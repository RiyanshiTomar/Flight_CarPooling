import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { DbService } from '../db/db.service';

const OTP_TTL_MIN = 5;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SEC = 30;

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(digits)) throw new BadRequestException('Enter a valid 10-digit Indian mobile number');
  return `+91${digits}`;
}

@Injectable()
export class AuthService {
  constructor(private readonly db: DbService, private readonly jwt: JwtService) {}

  private hash(phone: string, code: string) {
    return createHash('sha256').update(`${phone}:${code}:${process.env.JWT_SECRET}`).digest('hex');
  }

  async requestOtp(rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    const [last] = await this.db.query<{ age: number }>(
      `select extract(epoch from (now() - created_at))::int as age from otp_codes where phone = $1 order by created_at desc limit 1`,
      [phone],
    );
    if (last && last.age < RESEND_COOLDOWN_SEC) {
      throw new HttpException(`Wait ${RESEND_COOLDOWN_SEC - last.age}s before requesting another code`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.db.query(
      `insert into otp_codes (phone, code_hash, expires_at) values ($1, $2, now() + ($3 || ' minutes')::interval)`,
      [phone, this.hash(phone, code), String(OTP_TTL_MIN)],
    );
    // TODO(prod): send via SMS provider (MSG91/Twilio). Never log or return the code in production.
    const echo = process.env.OTP_DEV_ECHO === 'true' && process.env.NODE_ENV !== 'production';
    return { sent: true, expiresInMinutes: OTP_TTL_MIN, ...(echo ? { devCode: code } : {}) };
  }

  async verifyOtp(rawPhone: string, code: string) {
    const phone = normalizePhone(rawPhone);
    const [row] = await this.db.query<{ id: string; code_hash: string; attempts: number }>(
      `select id, code_hash, attempts from otp_codes
       where phone = $1 and used = false and expires_at > now()
       order by created_at desc limit 1`,
      [phone],
    );
    if (!row || row.attempts >= MAX_ATTEMPTS) throw new BadRequestException('Code expired. Request a new one.');

    const ok = (() => {
      const a = Buffer.from(this.hash(phone, code));
      const b = Buffer.from(row.code_hash);
      return a.length === b.length && timingSafeEqual(a, b);
    })();
    if (!ok) {
      await this.db.query('update otp_codes set attempts = attempts + 1 where id = $1', [row.id]);
      throw new BadRequestException('Incorrect code');
    }
    await this.db.query('update otp_codes set used = true where id = $1', [row.id]);

    const [user] = await this.db.query(
      `insert into users (phone) values ($1)
       on conflict (phone) do update set phone = excluded.phone
       returning id, phone, name, gender, verified_level, rating_avg, trips_count, created_at`,
      [phone],
    );
    const accessToken = await this.jwt.signAsync({ sub: user.id, phone: user.phone });
    return { accessToken, user };
  }
}

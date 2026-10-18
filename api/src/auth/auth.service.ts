import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { DbService, Queryable } from '../db/db.service';
import { SmsService } from '../sms/sms.service';

const OTP_TTL_MIN = 5;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SEC = 30;
const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_DAYS ?? 30);

export const USER_COLS = `id, phone, name, gender, verified_level, rating_avg, rating_count, trips_count,
  trusted_contact_name, trusted_contact_phone, created_at`;

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(digits)) throw new BadRequestException('Enter a valid 10-digit Indian mobile number');
  return `+91${digits}`;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  constructor(private readonly db: DbService, private readonly jwt: JwtService, private readonly sms: SmsService) {}

  private hash(phone: string, code: string) {
    return sha256(`${phone}:${code}:${process.env.JWT_SECRET}`);
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
    // only the newest code is valid: older unused ones are retired
    await this.db.query('update otp_codes set used = true where phone = $1 and used = false', [phone]);
    await this.db.query(
      `insert into otp_codes (phone, code_hash, expires_at) values ($1, $2, now() + ($3 || ' minutes')::interval)`,
      [phone, this.hash(phone, code), String(OTP_TTL_MIN)],
    );
    const echo = process.env.OTP_DEV_ECHO === 'true' && process.env.NODE_ENV !== 'production';
    if (!echo) await this.sms.send(phone, 'otp', `${code} is your FlyPool login code. It expires in ${OTP_TTL_MIN} minutes. Do not share it.`, { otp: code });
    return { sent: true, expiresInMinutes: OTP_TTL_MIN, resendInSeconds: RESEND_COOLDOWN_SEC, ...(echo ? { devCode: code } : {}) };
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

    const a = Buffer.from(this.hash(phone, code));
    const b = Buffer.from(row.code_hash);
    if (!(a.length === b.length && timingSafeEqual(a, b))) {
      await this.db.query('update otp_codes set attempts = attempts + 1 where id = $1', [row.id]);
      const left = MAX_ATTEMPTS - row.attempts - 1;
      throw new BadRequestException(left > 0 ? `Incorrect code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Request a new code.');
    }
    // single use, even under a race: only one request can flip used=false -> true
    const claimed = await this.db.query('update otp_codes set used = true where id = $1 and used = false returning id', [row.id]);
    if (!claimed.length) throw new BadRequestException('Code already used. Request a new one.');

    const [user] = await this.db.query(
      `insert into users (phone) values ($1)
       on conflict (phone) do update set phone = excluded.phone
       returning ${USER_COLS}`,
      [phone],
    );
    return { ...(await this.issueTokens(this.db, user.id, user.phone)), user, isNewUser: !user.name };
  }

  private async issueTokens(q: Queryable, userId: string, phone: string, familyId: string = randomUUID()) {
    const accessToken = await this.jwt.signAsync({ sub: userId, phone });
    const refreshToken = randomBytes(32).toString('base64url');
    await q.query(
      `insert into refresh_tokens (user_id, family_id, token_hash, expires_at) values ($1, $2, $3, now() + ($4 || ' days')::interval)`,
      [userId, familyId, sha256(refreshToken), String(REFRESH_DAYS)],
    );
    return { accessToken, refreshToken };
  }

  /**
   * Rotation with reuse detection: every refresh returns a NEW refresh token and retires the old one.
   * If a retired token is ever presented again, someone copied it, so the whole login family is revoked.
   */
  async refresh(refreshToken: string) {
    const result = await this.db.tx(async (q) => {
      const [t] = await q.query(
        `select t.id, t.user_id, t.family_id, t.revoked_at, t.expires_at < now() as expired, u.phone, u.deleted_at
         from refresh_tokens t join users u on u.id = t.user_id where t.token_hash = $1 for update of t`,
        [sha256(refreshToken)],
      );
      if (!t) return { error: 'Session expired. Please log in again.' } as const;
      if (t.revoked_at) {
        await q.query('update refresh_tokens set revoked_at = now() where family_id = $1 and revoked_at is null', [t.family_id]);
        return { error: 'Session ended for your safety. Please log in again.' } as const;
      }
      if (t.expired || t.deleted_at) return { error: 'Session expired. Please log in again.' } as const;
      await q.query('update refresh_tokens set revoked_at = now() where id = $1', [t.id]);
      return { tokens: await this.issueTokens(q, t.user_id, t.phone, t.family_id) } as const;
    });
    // thrown outside the transaction so the reuse-detection revoke above is committed
    if ('error' in result) throw new UnauthorizedException(result.error);
    return result.tokens;
  }

  async logout(refreshToken: string) {
    await this.db.query(
      `update refresh_tokens set revoked_at = now()
       where family_id = (select family_id from refresh_tokens where token_hash = $1) and revoked_at is null`,
      [sha256(refreshToken)],
    );
    return { loggedOut: true };
  }

  async logoutEverywhere(userId: string) {
    await this.db.query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [userId]);
  }
}

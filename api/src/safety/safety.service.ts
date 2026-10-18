import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DbService } from '../db/db.service';
import { SmsService } from '../sms/sms.service';

export const REPORT_REASONS = ['no_show', 'rude', 'unsafe', 'harassment', 'fake_profile', 'payment', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

const webUrl = () => (process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');

@Injectable()
export class SafetyService {
  private readonly log = new Logger('Safety');

  constructor(private readonly db: DbService, private readonly sms: SmsService) {}

  /** memberId (a ride-request id, as shown in the group view) -> that member's user id, checking both are in the group. */
  private async resolveMember(userId: string, groupId: string, memberId: string) {
    const rows = await this.db.query<{ user_id: string; request_id: string }>(
      'select user_id, request_id from group_members where group_id = $1',
      [groupId],
    );
    if (!rows.some((r) => r.user_id === userId)) throw new ForbiddenException('You are not in this group');
    const target = rows.find((r) => r.request_id === memberId);
    if (!target) throw new NotFoundException('That traveller is not in this group');
    if (target.user_id === userId) throw new BadRequestException('That is you');
    return target.user_id;
  }

  async report(userId: string, input: { groupId: string; memberId: string; reason: ReportReason; details?: string; block?: boolean }) {
    const target = await this.resolveMember(userId, input.groupId, input.memberId);
    await this.db.query(
      'insert into reports (reporter_id, target_user_id, group_id, reason, details) values ($1,$2,$3,$4,$5)',
      [userId, target, input.groupId, input.reason, input.details?.trim() || null],
    );
    if (input.block) await this.insertBlock(userId, target);
    // TODO(ops): page the trust & safety on-call for 'unsafe' / 'harassment' reports
    if (['unsafe', 'harassment'].includes(input.reason)) this.log.warn(`Priority report (${input.reason}) on group ${input.groupId}`);
    return { reported: true, blocked: !!input.block };
  }

  async block(userId: string, groupId: string, memberId: string) {
    const target = await this.resolveMember(userId, groupId, memberId);
    await this.insertBlock(userId, target);
    return { blocked: true };
  }

  private async insertBlock(userId: string, target: string) {
    await this.db.query('insert into blocks (blocker_id, blocked_id) values ($1,$2) on conflict do nothing', [userId, target]);
  }

  async listBlocks(userId: string) {
    return this.db.query(
      `select b.id, split_part(coalesce(u.name, 'Traveller'), ' ', 1) as name, b.created_at
       from blocks b join users u on u.id = b.blocked_id where b.blocker_id = $1 order by b.created_at desc`,
      [userId],
    );
  }

  async unblock(userId: string, blockId: string) {
    const rows = await this.db.query('delete from blocks where id = $1 and blocker_id = $2 returning id', [blockId, userId]);
    if (!rows.length) throw new NotFoundException('Block not found');
    return { unblocked: true };
  }

  // ---------------------------------------------------------------- trip sharing

  /** A read-only link for family. One active link per person per group; calling again returns the same link. */
  async createShareLink(userId: string, groupId: string) {
    const [m] = await this.db.query(
      `select g.window_end from group_members m join groups g on g.id = m.group_id where m.group_id = $1 and m.user_id = $2`,
      [groupId, userId],
    );
    if (!m) throw new ForbiddenException('You are not in this group');
    const [existing] = await this.db.query(
      'select token, expires_at from share_links where user_id = $1 and group_id = $2 and revoked_at is null and expires_at > now()',
      [userId, groupId],
    );
    const link =
      existing ??
      (
        await this.db.query(
          `insert into share_links (token, group_id, user_id, expires_at)
           values ($1, $2, $3, greatest($4::timestamptz, now()) + interval '12 hours') returning token, expires_at`,
          [randomBytes(18).toString('base64url'), groupId, userId, m.window_end],
        )
      )[0];
    return { token: link.token, url: `${webUrl()}/share/${link.token}`, expiresAt: link.expires_at };
  }

  async revokeShareLinks(userId: string, groupId: string) {
    await this.db.query('update share_links set revoked_at = now() where user_id = $1 and group_id = $2 and revoked_at is null', [userId, groupId]);
    return { revoked: true };
  }

  /** What family sees: no phone numbers, first names only, the sharer's own flight and drop area. */
  async publicShare(token: string) {
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) throw new NotFoundException('This link is not valid');
    const [s] = await this.db.query(
      `select s.group_id, s.user_id, s.expires_at, g.status, g.pickup_point, g.terminal, g.window_start, g.window_end,
              g.started_at, g.completed_at, a.iata, a.city, u.name as sharer
       from share_links s join groups g on g.id = s.group_id join airports a on a.id = g.airport_id join users u on u.id = s.user_id
       where s.token = $1 and s.revoked_at is null and s.expires_at > now()`,
      [token],
    );
    if (!s) throw new NotFoundException('This link has expired or was turned off');
    const members = await this.db.query(
      `select split_part(coalesce(u.name, 'Traveller'), ' ', 1) as name, u.verified_level, u.rating_avg, u.trips_count,
              r.flight_no, r.dest_label, (u.id = $2) as is_sharer
       from group_members m join users u on u.id = m.user_id join ride_requests r on r.id = m.request_id
       where m.group_id = $1 order by m.joined_at`,
      [s.group_id, s.user_id],
    );
    const me = members.find((m) => m.is_sharer);
    return {
      sharer: (s.sharer ?? 'Traveller').split(' ')[0],
      airport: { code: s.iata, city: s.city },
      status: s.status,
      terminal: s.terminal,
      pickupPoint: s.pickup_point,
      windowStart: s.window_start,
      windowEnd: s.window_end,
      startedAt: s.started_at,
      completedAt: s.completed_at,
      flightNo: me?.flight_no ?? null,
      destination: me?.dest_label ?? null,
      expiresAt: s.expires_at,
      members: members.map((m) => ({ name: m.name, verifiedLevel: m.verified_level, rating: Number(m.rating_avg), trips: m.trips_count, isSharer: m.is_sharer })),
    };
  }

  // ---------------------------------------------------------------- SOS

  async sos(userId: string, input: { groupId?: string; lat?: number; lng?: number }) {
    const [u] = await this.db.query('select name, trusted_contact_name, trusted_contact_phone from users where id = $1', [userId]);
    let groupId: string | null = input.groupId ?? null;
    if (groupId) {
      const [m] = await this.db.query('select 1 as x from group_members where group_id = $1 and user_id = $2', [groupId, userId]);
      if (!m) groupId = null;
    } else {
      // most relevant group: the one in progress, else the next confirmed one
      const [g] = await this.db.query(
        `select g.id from group_members m join groups g on g.id = m.group_id where m.user_id = $1 and g.status in ('IN_TRIP','CONFIRMED','OPEN')
         order by (g.status = 'IN_TRIP') desc, g.window_start asc limit 1`,
        [userId],
      );
      groupId = g?.id ?? null;
    }
    const share = groupId ? await this.createShareLink(userId, groupId) : null;
    const where = input.lat != null && input.lng != null ? ` Location: https://maps.google.com/?q=${input.lat.toFixed(5)},${input.lng.toFixed(5)}` : '';
    let notified = false;
    if (u?.trusted_contact_phone) {
      const name = (u.name ?? 'Your contact').split(' ')[0];
      const text = `SOS from ${name} via FlyPool. They may need help.${where}${share ? ` Trip: ${share.url}` : ''} If urgent, call 112.`;
      try {
        await this.sms.send(u.trusted_contact_phone, 'alert', text, { message: text });
        notified = true;
      } catch {
        notified = false;
      }
    }
    await this.db.query('insert into sos_events (user_id, group_id, lat, lng, contact_notified) values ($1,$2,$3,$4,$5)', [
      userId,
      groupId,
      input.lat ?? null,
      input.lng ?? null,
      notified,
    ]);
    this.log.warn(`SOS raised (group ${groupId ?? 'none'}, contact notified: ${notified})`);
    return {
      recorded: true,
      contactNotified: notified,
      contactName: u?.trusted_contact_name ?? null,
      hasTrustedContact: !!u?.trusted_contact_phone,
      emergencyNumber: '112',
      shareUrl: share?.url ?? null,
    };
  }
}

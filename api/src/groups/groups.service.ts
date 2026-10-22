import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService, Queryable } from '../db/db.service';
import { EventsService } from '../events/events.service';
import { MATCH, gapToWindowMin, haversineKm, matchScore, perPersonFare } from '../matching/matching.util';

export interface RequestRow {
  id: string;
  user_id: string;
  airport_id: string;
  terminal: string | null;
  eta: Date;
  dest_lat: number;
  dest_lng: number;
  seats: number;
  women_only: boolean;
  est_solo_fare: number;
  status: string;
}

const firstName = (n: string | null | undefined) => (n ?? '').trim().split(/\s+/)[0] || 'A traveller';

/** SQL: true when $user has blocked, or been blocked by, anyone in group g. */
const BLOCKED_IN_GROUP = (userParam: string) => `exists (
  select 1 from group_members bm join blocks b
    on (b.blocker_id = ${userParam} and b.blocked_id = bm.user_id) or (b.blocked_id = ${userParam} and b.blocker_id = bm.user_id)
  where bm.group_id = g.id)`;

@Injectable()
export class GroupsService {
  constructor(private readonly db: DbService, private readonly events: EventsService) {}

  // ------------------------------------------------------------------ matching

  /** Open groups this request could join, best first. Hard filters in SQL, scoring in code. */
  async suggestions(q: Queryable, r: RequestRow, userGender: string | null) {
    const groups = await q.query(
      `select g.* from groups g
       where g.airport_id = $1 and g.status = 'OPEN'
         and g.seats_taken + $2 <= g.capacity
         and g.window_end   >= $3::timestamptz - ($4 || ' minutes')::interval
         and g.window_start <= $3::timestamptz + ($4 || ' minutes')::interval
         and ($5::boolean = false or g.women_only = true)
         and (g.women_only = false or $6 = 'female')
         and not exists (select 1 from group_members m where m.group_id = g.id and m.user_id = $7)
         and not ${BLOCKED_IN_GROUP('$7')}`,
      [r.airport_id, r.seats, r.eta, String(MATCH.maxTimeGapMin), r.women_only, userGender, r.user_id],
    );
    const scored = [];
    for (const g of groups) {
      const gap = gapToWindowMin(new Date(r.eta), new Date(g.window_start), new Date(g.window_end));
      const dist = haversineKm({ lat: r.dest_lat, lng: r.dest_lng }, { lat: g.centroid_lat, lng: g.centroid_lng });
      const score = matchScore(gap, dist);
      if (score === null) continue;
      scored.push({ group: g, score, distKm: Math.round(dist * 10) / 10, gapMin: Math.round(gap) });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 10);
    return Promise.all(
      top.map(async (s) => ({
        score: s.score,
        detourKmApprox: s.distKm,
        timeGapMin: s.gapMin,
        group: await this.publicSummary(q, s.group, r.seats, r.est_solo_fare),
      })),
    );
  }

  /** Anonymised view for people who have not joined yet: first names only, no ids, no phone numbers. */
  private async publicSummary(q: Queryable, g: any, extraSeats: number, mySoloFare: number) {
    const members = await q.query(
      `select u.name, u.verified_level, u.rating_avg, u.rating_count, u.trips_count, r.dest_label
       from group_members m join users u on u.id = m.user_id join ride_requests r on r.id = m.request_id
       where m.group_id = $1 order by m.joined_at`,
      [g.id],
    );
    const shared = perPersonFare(g.est_solo_fare, g.seats_taken + extraSeats);
    return {
      id: g.id,
      status: g.status,
      terminal: g.terminal,
      pickupPoint: g.pickup_point,
      windowStart: g.window_start,
      windowEnd: g.window_end,
      womenOnly: g.women_only,
      seatsTaken: g.seats_taken,
      seatsLeft: g.capacity - g.seats_taken,
      soloFare: mySoloFare,
      sharedFareIfJoined: shared,
      members: members.map((m) => ({ ...m, name: firstName(m.name) })),
    };
  }

  // ------------------------------------------------------------------ membership

  async createFor(q: Queryable, r: RequestRow) {
    const [g] = await q.query(
      `insert into groups (airport_id, terminal, pickup_point, centroid_lat, centroid_lng, window_start, window_end,
                           capacity, seats_taken, women_only, est_solo_fare)
       values ($1,$2,$3,$4,$5,$6,$6,$7,0,$8,$9) returning id`,
      [r.airport_id, r.terminal, defaultPickup(r.terminal), r.dest_lat, r.dest_lng, r.eta, MATCH.capacity, r.women_only, r.est_solo_fare],
    );
    await this.addMember(q, g.id, r);
    return g.id as string;
  }

  async join(userId: string, groupId: string, requestId: string) {
    const out = await this.db.tx(async (q) => {
      const [g] = await q.query('select * from groups where id = $1 for update', [groupId]);
      if (!g) throw new NotFoundException('Group not found');
      const [r] = await q.query(
        `select r.*, u.gender, u.name from ride_requests r join users u on u.id = r.user_id where r.id = $1`,
        [requestId],
      );
      if (!r || r.user_id !== userId) throw new NotFoundException('Ride request not found');
      if (['CANCELLED', 'EXPIRED', 'COMPLETED', 'IN_TRIP'].includes(r.status)) throw new BadRequestException('This request is no longer active');
      if (g.status !== 'OPEN') throw new ConflictException('This group is no longer open. Pick another one.');
      if (g.airport_id !== r.airport_id) throw new BadRequestException('This group is at a different airport');
      if (g.seats_taken + r.seats > g.capacity) throw new ConflictException('Not enough seats left in this group');
      if (r.women_only && !g.women_only) throw new BadRequestException('This group is not women-only');
      if (g.women_only && r.gender !== 'female') throw new ForbiddenException('This is a women-only group');
      const [blocked] = await q.query(`select 1 as x from groups g where g.id = $1 and ${BLOCKED_IN_GROUP('$2')}`, [groupId, userId]);
      if (blocked) throw new ForbiddenException('You cannot join this group');

      const [already] = await q.query('select group_id from group_members where request_id = $1', [requestId]);
      if (already?.group_id === groupId) return { view: await this.view(q, groupId, userId), oldGroup: null, name: r.name };
      if (already) await this.removeMember(q, requestId); // moving from own solo group to this one

      const gap = gapToWindowMin(new Date(r.eta), new Date(g.window_start), new Date(g.window_end));
      const dist = haversineKm({ lat: r.dest_lat, lng: r.dest_lng }, { lat: g.centroid_lat, lng: g.centroid_lng });
      if (matchScore(gap, dist) === null) throw new BadRequestException('This group is no longer a good match for your flight or destination');

      await this.addMember(q, groupId, r as RequestRow);
      await this.systemMessage(q, groupId, `${firstName(r.name)} joined the group.`);
      return { view: await this.view(q, groupId, userId), oldGroup: already?.group_id ?? null, name: r.name };
    });
    await this.events.toGroup(groupId, { type: 'group.updated', note: `${firstName(out.name)} joined your group` }, { except: userId });
    await this.events.toGroup(groupId, { type: 'message.created' }, { except: userId });
    if (out.oldGroup) await this.events.toGroup(out.oldGroup, { type: 'group.updated' });
    return out.view;
  }

  /** Insert membership then recompute the group's window, centroid, seats and statuses. */
  async addMember(q: Queryable, groupId: string, r: Pick<RequestRow, 'id' | 'user_id' | 'seats'>) {
    await q.query('insert into group_members (group_id, request_id, user_id, seats) values ($1,$2,$3,$4)', [groupId, r.id, r.user_id, r.seats]);
    await this.recompute(q, groupId);
  }

  /** Returns the group the request was removed from (or null). */
  async removeMember(q: Queryable, requestId: string): Promise<string | null> {
    const [m] = await q.query('delete from group_members where request_id = $1 returning group_id', [requestId]);
    if (m) await this.recompute(q, m.group_id);
    return m?.group_id ?? null;
  }

  async recompute(q: Queryable, groupId: string) {
    const [g] = await q.query('select status from groups where id = $1', [groupId]);
    if (!g || !['OPEN', 'CONFIRMED'].includes(g.status)) return; // trips that started or ended are frozen
    const [a] = await q.query(
      `select count(*)::int as n, coalesce(sum(m.seats),0)::int as seats,
              min(r.eta) as w_start, max(r.eta) as w_end,
              sum(r.dest_lat * m.seats) / nullif(sum(m.seats),0) as lat,
              sum(r.dest_lng * m.seats) / nullif(sum(m.seats),0) as lng,
              max(r.est_solo_fare) as solo,
              bool_or(m.confirmed_at is null) as someone_unconfirmed
       from group_members m join ride_requests r on r.id = m.request_id where m.group_id = $1`,
      [groupId],
    );
    if (a.n === 0) {
      await q.query(`update groups set status = 'CANCELLED', seats_taken = 0 where id = $1`, [groupId]);
      return;
    }
    const confirmed = a.n >= 2 && !a.someone_unconfirmed;
    await q.query(
      `update groups set seats_taken = $2, window_start = $3, window_end = $4, centroid_lat = $5, centroid_lng = $6,
                         est_solo_fare = $8, status = case when $7 then 'CONFIRMED' else 'OPEN' end
       where id = $1`,
      [groupId, a.seats, a.w_start, a.w_end, a.lat, a.lng, confirmed, a.solo],
    );
    await q.query(
      `update ride_requests set status = case when $2 then 'CONFIRMED' when $3 >= 2 then 'MATCHED' else 'PENDING' end
       where id in (select request_id from group_members where group_id = $1) and status in ('PENDING','MATCHED','CONFIRMED')`,
      [groupId, confirmed, a.n],
    );
  }

  /** Leave the group but keep the ride request: you get a fresh group of one, so others can still find you. */
  async leave(userId: string, groupId: string) {
    const out = await this.db.tx(async (q) => {
      const [m] = await q.query(
        `select m.request_id, g.status, u.name from group_members m join groups g on g.id = m.group_id join users u on u.id = m.user_id
         where m.group_id = $1 and m.user_id = $2 for update of g`,
        [groupId, userId],
      );
      if (!m) throw new ForbiddenException('You are not in this group');
      if (!['OPEN', 'CONFIRMED'].includes(m.status)) throw new BadRequestException('You cannot leave a trip that has started or ended');
      await this.removeMember(q, m.request_id);
      await this.systemMessage(q, groupId, `${firstName(m.name)} left the group.`);
      await q.query(`update group_members set confirmed_at = null where group_id = $1`, [groupId]); // the deal changed: re-confirm
      await this.recompute(q, groupId);
      const [r] = await q.query('select * from ride_requests where id = $1', [m.request_id]);
      const newGroupId = await this.createFor(q, r as RequestRow);
      return { newGroupId, requestId: m.request_id as string, name: m.name };
    });
    await this.events.toGroup(groupId, { type: 'group.updated', note: `${firstName(out.name)} left your group` });
    await this.events.toGroup(groupId, { type: 'message.created' });
    return out;
  }

  // ------------------------------------------------------------------ lifecycle

  async confirm(userId: string, groupId: string) {
    const out = await this.db.tx(async (q) => {
      const [g] = await q.query('select * from groups where id = $1 for update', [groupId]);
      if (!g) throw new NotFoundException('Group not found');
      if (!['OPEN', 'CONFIRMED'].includes(g.status)) throw new BadRequestException('This trip has already started or ended');
      const rows = await q.query(
        `update group_members m set confirmed_at = coalesce(confirmed_at, now()) from users u
         where m.group_id = $1 and m.user_id = $2 and u.id = m.user_id returning u.name`,
        [groupId, userId],
      );
      if (!rows.length) throw new ForbiddenException('You are not in this group');
      await this.recompute(q, groupId);
      const [after] = await q.query('select status from groups where id = $1', [groupId]);
      await this.systemMessage(
        q,
        groupId,
        after.status === 'CONFIRMED' ? 'Everyone has confirmed. Meet at the pickup point and book one cab together.' : `${firstName(rows[0].name)} confirmed.`,
      );
      return { view: await this.view(q, groupId, userId), name: rows[0].name, all: after.status === 'CONFIRMED' };
    });
    await this.events.toGroup(
      groupId,
      { type: 'group.updated', note: out.all ? 'Your group is confirmed' : `${firstName(out.name)} confirmed` },
      { except: userId },
    );
    await this.events.toGroup(groupId, { type: 'message.created' }, { except: userId });
    return out.view;
  }

  async updatePickup(userId: string, groupId: string, pickupPoint: string) {
    const text = pickupPoint.trim();
    const out = await this.db.tx(async (q) => {
      const g = await this.lockForMember(q, groupId, userId);
      if (!['OPEN', 'CONFIRMED'].includes(g.status)) throw new BadRequestException('Pickup can only change before the trip starts');
      await q.query('update groups set pickup_point = $2, pickup_updated_at = now() where id = $1', [groupId, text]);
      await this.systemMessage(q, groupId, `${firstName(g.me_name)} changed the pickup point to "${text}".`);
      return this.view(q, groupId, userId);
    });
    await this.events.toGroup(groupId, { type: 'group.updated', note: `Pickup changed to ${text}` }, { except: userId });
    await this.events.toGroup(groupId, { type: 'message.created' }, { except: userId });
    return out;
  }

  /** Any member can mark the cab as started once the group is confirmed. */
  async start(userId: string, groupId: string) {
    const out = await this.db.tx(async (q) => {
      const g = await this.lockForMember(q, groupId, userId);
      if (g.status === 'IN_TRIP') return this.view(q, groupId, userId);
      if (g.status !== 'CONFIRMED') throw new BadRequestException('Everyone has to confirm before the ride starts');
      await q.query(`update groups set status = 'IN_TRIP', started_at = now() where id = $1`, [groupId]);
      await q.query(`update ride_requests set status = 'IN_TRIP' where id in (select request_id from group_members where group_id = $1)`, [groupId]);
      await this.systemMessage(q, groupId, `${firstName(g.me_name)} started the ride. Have a safe trip!`);
      return this.view(q, groupId, userId);
    });
    await this.events.toGroup(groupId, { type: 'group.updated', note: 'Your ride has started' }, { except: userId });
    await this.events.toGroup(groupId, { type: 'message.created' }, { except: userId });
    return out;
  }

  async complete(userId: string, groupId: string) {
    const out = await this.db.tx(async (q) => {
      const g = await this.lockForMember(q, groupId, userId);
      if (g.status === 'COMPLETED') return this.view(q, groupId, userId);
      if (g.status !== 'IN_TRIP') throw new BadRequestException('Start the ride first');
      await q.query(
        `update groups set status = 'COMPLETED', completed_at = now(), final_per_person = $2 where id = $1`,
        [groupId, perPersonFare(g.est_solo_fare, g.seats_taken)],
      );
      await q.query(`update ride_requests set status = 'COMPLETED' where id in (select request_id from group_members where group_id = $1)`, [groupId]);
      await q.query(`update users set trips_count = trips_count + 1 where id in (select user_id from group_members where group_id = $1)`, [groupId]);
      await this.systemMessage(q, groupId, 'Ride completed. Please rate your co-travellers, it keeps FlyPool safe.');
      return this.view(q, groupId, userId);
    });
    await this.events.toGroup(groupId, { type: 'group.updated', note: 'Ride completed. Rate your co-travellers' }, { except: userId });
    await this.events.toGroup(groupId, { type: 'message.created' }, { except: userId });
    return out;
  }

  async rate(userId: string, groupId: string, ratings: { memberId: string; score: number; comment?: string }[]) {
    return this.db.tx(async (q) => {
      const g = await this.lockForMember(q, groupId, userId);
      if (g.status !== 'COMPLETED') throw new BadRequestException('You can rate co-travellers after the ride is completed');
      const members = await q.query<{ request_id: string; user_id: string }>('select request_id, user_id from group_members where group_id = $1', [groupId]);
      const touched = new Set<string>();
      for (const r of ratings) {
        const target = members.find((m) => m.request_id === r.memberId);
        if (!target) throw new BadRequestException('That traveller was not in this group');
        if (target.user_id === userId) throw new BadRequestException('You cannot rate yourself');
        await q.query(
          `insert into ratings (group_id, from_user, to_user, score, comment) values ($1,$2,$3,$4,$5)
           on conflict (group_id, from_user, to_user) do update set score = excluded.score, comment = excluded.comment, created_at = now()`,
          [groupId, userId, target.user_id, r.score, r.comment?.trim() || null],
        );
        touched.add(target.user_id);
      }
      for (const uid of touched) {
        await q.query(
          `update users set rating_avg = coalesce((select round(avg(score)::numeric, 2) from ratings where to_user = $1), 5),
                            rating_count = (select count(*) from ratings where to_user = $1)
           where id = $1`,
          [uid],
        );
      }
      return this.view(q, groupId, userId);
    });
  }

  // ------------------------------------------------------------------ reading

  async view(q: Queryable, groupId: string, userId: string) {
    const [g] = await q.query('select * from groups where id = $1', [groupId]);
    if (!g) throw new NotFoundException('Group not found');
    const members = await q.query(
      `select m.request_id, u.id as user_id, u.name, u.verified_level, u.rating_avg, u.rating_count, u.trips_count,
              r.flight_no, r.eta, r.dest_label, r.est_solo_fare, m.seats, (m.confirmed_at is not null) as confirmed
       from group_members m join users u on u.id = m.user_id join ride_requests r on r.id = m.request_id
       where m.group_id = $1 order by m.joined_at`,
      [groupId],
    );
    const me = members.find((m) => m.user_id === userId);
    if (!me) throw new ForbiddenException('You are not in this group');
    const rated = await q.query<{ to_user: string }>('select to_user from ratings where group_id = $1 and from_user = $2', [groupId, userId]);
    const ratedIds = new Set(rated.map((r) => r.to_user));
    const perPerson = g.final_per_person ?? perPersonFare(g.est_solo_fare, g.seats_taken);
    return {
      id: g.id,
      status: g.status,
      airportId: g.airport_id,
      terminal: g.terminal,
      pickupPoint: g.pickup_point,
      windowStart: g.window_start,
      windowEnd: g.window_end,
      womenOnly: g.women_only,
      seatsTaken: g.seats_taken,
      seatsLeft: g.capacity - g.seats_taken,
      soloFare: me.est_solo_fare,
      perPersonFare: perPerson,
      startedAt: g.started_at,
      completedAt: g.completed_at,
      myRequestId: me.request_id,
      estimate: true,
      members: members.map(({ user_id, request_id, est_solo_fare, ...m }) => ({
        ...m,
        name: user_id === userId ? m.name : firstName(m.name), // co-travellers only ever see first names
        memberId: request_id,
        isYou: user_id === userId,
        ratedByYou: ratedIds.has(user_id),
      })),
    };
  }

  getView(userId: string, groupId: string) {
    return this.view(this.db, groupId, userId);
  }

  async assertMember(userId: string, groupId: string) {
    const [m] = await this.db.query('select 1 as x from group_members where group_id = $1 and user_id = $2', [groupId, userId]);
    if (!m) throw new ForbiddenException('You are not in this group');
  }

  async messages(userId: string, groupId: string, after?: string) {
    await this.assertMember(userId, groupId);
    return this.db.query(
      `select m.id, m.body, m.created_at, m.kind, coalesce(m.user_id = $2, false) as mine,
              case when m.user_id is null then 'FlyPool' else split_part(coalesce(usr.name, 'Traveller'), ' ', 1) end as sender
       from messages m left join users usr on usr.id = m.user_id
       where m.group_id = $1
         -- clients send ISO times with millisecond precision; Postgres stores microseconds
         and ($3::timestamptz is null or date_trunc('milliseconds', m.created_at) > $3::timestamptz)
       order by m.created_at asc limit 300`,
      [groupId, userId, after ?? null],
    );
  }

  async send(userId: string, groupId: string, body: string) {
    await this.assertMember(userId, groupId);
    const [row] = await this.db.query(
      `insert into messages (group_id, user_id, body) values ($1,$2,$3) returning id, body, created_at, kind`,
      [groupId, userId, body.trim()],
    );
    await this.events.toGroup(groupId, { type: 'message.created' }, { except: userId });
    return { ...row, mine: true, sender: 'You' };
  }

  async systemMessage(q: Queryable, groupId: string, body: string) {
    await q.query(`insert into messages (group_id, user_id, body, kind) values ($1, null, $2, 'system')`, [groupId, body.slice(0, 1000)]);
  }

  /** Lock the group row and check the caller is a member. Returns the group plus the caller's name. */
  private async lockForMember(q: Queryable, groupId: string, userId: string): Promise<Record<string, any>> {
    const [g] = await q.query('select * from groups where id = $1 for update', [groupId]);
    if (!g) throw new NotFoundException('Group not found');
    const [m] = await q.query(
      'select u.name from group_members m join users u on u.id = m.user_id where m.group_id = $1 and m.user_id = $2',
      [groupId, userId],
    );
    if (!m) throw new ForbiddenException('You are not in this group');
    return { ...g, me_name: m.name };
  }
}

export function defaultPickup(terminal: string | null) {
  return `${terminal ?? 'T1'} Arrivals, Pillar 6`;
}

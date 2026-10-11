import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService, Queryable } from '../db/db.service';
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

@Injectable()
export class GroupsService {
  constructor(private readonly db: DbService) {}

  /** Open groups this request could join, best first. Hard filters in SQL, scoring in code. */
  async suggestions(q: Queryable, r: RequestRow, userGender: string | null) {
    const groups = await q.query(
      `select g.*, (select count(*) from group_members m where m.group_id = g.id)::int as member_count
       from groups g
       where g.airport_id = $1 and g.status = 'OPEN'
         and g.seats_taken + $2 <= g.capacity
         and g.window_end   >= $3::timestamptz - ($4 || ' minutes')::interval
         and g.window_start <= $3::timestamptz + ($4 || ' minutes')::interval
         and ($5::boolean = false or g.women_only = true)
         and (g.women_only = false or $6 = 'female')
         and not exists (select 1 from group_members m where m.group_id = g.id and m.user_id = $7)`,
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
        group: await this.publicSummary(q, s.group, r.seats),
      })),
    );
  }

  /** Anonymised view for people who have not joined yet: no ids, no phone numbers. */
  private async publicSummary(q: Queryable, g: any, extraSeats: number) {
    const members = await q.query(
      `select split_part(coalesce(u.name, 'Traveller'), ' ', 1) as name, u.verified_level, u.rating_avg, u.trips_count
       from group_members m join users u on u.id = m.user_id where m.group_id = $1 order by m.joined_at`,
      [g.id],
    );
    return {
      id: g.id,
      terminal: g.terminal,
      pickupPoint: g.pickup_point,
      windowStart: g.window_start,
      windowEnd: g.window_end,
      womenOnly: g.women_only,
      seatsTaken: g.seats_taken,
      seatsLeft: g.capacity - g.seats_taken,
      soloFare: g.est_solo_fare,
      sharedFareIfJoined: perPersonFare(g.est_solo_fare, g.seats_taken + extraSeats),
      members,
    };
  }

  async createFor(q: Queryable, r: RequestRow) {
    const [g] = await q.query(
      `insert into groups (airport_id, terminal, pickup_point, centroid_lat, centroid_lng, window_start, window_end,
                           capacity, seats_taken, women_only, est_solo_fare)
       values ($1,$2,$3,$4,$5,$6,$6,$7,0,$8,$9) returning id`,
      [r.airport_id, r.terminal, `${r.terminal ?? 'T1'} Arrivals, Pillar 6`, r.dest_lat, r.dest_lng, r.eta, MATCH.capacity, r.women_only, r.est_solo_fare],
    );
    await this.addMember(q, g.id, r);
    return g.id as string;
  }

  async join(userId: string, groupId: string, requestId: string) {
    return this.db.tx(async (q) => {
      const [g] = await q.query('select * from groups where id = $1 for update', [groupId]);
      if (!g) throw new NotFoundException('Group not found');
      const [r] = await q.query(
        `select r.*, u.gender from ride_requests r join users u on u.id = r.user_id where r.id = $1`,
        [requestId],
      );
      if (!r || r.user_id !== userId) throw new NotFoundException('Ride request not found');
      if (['CANCELLED', 'EXPIRED', 'COMPLETED'].includes(r.status)) throw new BadRequestException('This request is no longer active');
      if (g.status !== 'OPEN') throw new ConflictException('This group is no longer open');
      if (g.airport_id !== r.airport_id) throw new BadRequestException('Different airport');
      if (g.seats_taken + r.seats > g.capacity) throw new ConflictException('Not enough seats left');
      if (r.women_only && !g.women_only) throw new BadRequestException('This group is not women-only');
      if (g.women_only && r.gender !== 'female') throw new ForbiddenException('This is a women-only group');
      const [already] = await q.query('select 1 as x from group_members where request_id = $1', [requestId]);
      if (already) await this.removeMember(q, requestId); // moving from own solo group to this one

      const gap = gapToWindowMin(new Date(r.eta), new Date(g.window_start), new Date(g.window_end));
      const dist = haversineKm({ lat: r.dest_lat, lng: r.dest_lng }, { lat: g.centroid_lat, lng: g.centroid_lng });
      if (matchScore(gap, dist) === null) throw new BadRequestException('This group is no longer a good match for your flight or destination');

      await this.addMember(q, groupId, r as RequestRow);
      return this.view(q, groupId, userId);
    });
  }

  /** Insert membership then recompute the group's window, centroid, seats and statuses. */
  async addMember(q: Queryable, groupId: string, r: Pick<RequestRow, 'id' | 'user_id' | 'seats'>) {
    await q.query('insert into group_members (group_id, request_id, user_id, seats) values ($1,$2,$3,$4)', [groupId, r.id, r.user_id, r.seats]);
    await this.recompute(q, groupId);
  }

  async removeMember(q: Queryable, requestId: string) {
    const [m] = await q.query('delete from group_members where request_id = $1 returning group_id', [requestId]);
    if (m) await this.recompute(q, m.group_id);
  }

  private async recompute(q: Queryable, groupId: string) {
    const [a] = await q.query(
      `select count(*)::int as n, coalesce(sum(m.seats),0)::int as seats,
              min(r.eta) as w_start, max(r.eta) as w_end,
              sum(r.dest_lat * m.seats) / nullif(sum(m.seats),0) as lat,
              sum(r.dest_lng * m.seats) / nullif(sum(m.seats),0) as lng,
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
                         status = case when $7 then 'CONFIRMED' else 'OPEN' end
       where id = $1`,
      [groupId, a.seats, a.w_start, a.w_end, a.lat, a.lng, confirmed],
    );
    await q.query(
      `update ride_requests set status = case when $2 then 'CONFIRMED' when $3 >= 2 then 'MATCHED' else 'PENDING' end
       where id in (select request_id from group_members where group_id = $1) and status in ('PENDING','MATCHED','CONFIRMED')`,
      [groupId, confirmed, a.n],
    );
  }

  async confirm(userId: string, groupId: string) {
    return this.db.tx(async (q) => {
      const [g] = await q.query('select * from groups where id = $1 for update', [groupId]);
      if (!g) throw new NotFoundException('Group not found');
      const rows = await q.query('update group_members set confirmed_at = now() where group_id = $1 and user_id = $2 returning 1 as x', [groupId, userId]);
      if (!rows.length) throw new ForbiddenException('You are not in this group');
      await this.recompute(q, groupId);
      return this.view(q, groupId, userId);
    });
  }

  async view(q: Queryable, groupId: string, userId: string) {
    const [g] = await q.query('select * from groups where id = $1', [groupId]);
    if (!g) throw new NotFoundException('Group not found');
    const members = await q.query(
      `select u.id as user_id, u.name, u.verified_level, u.rating_avg, u.trips_count,
              r.flight_no, r.eta, r.dest_label, m.seats, (m.confirmed_at is not null) as confirmed
       from group_members m join users u on u.id = m.user_id join ride_requests r on r.id = m.request_id
       where m.group_id = $1 order by m.joined_at`,
      [groupId],
    );
    if (!members.some((m) => m.user_id === userId)) throw new ForbiddenException('You are not in this group');
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
      soloFare: g.est_solo_fare,
      perPersonFare: perPersonFare(g.est_solo_fare, g.seats_taken),
      estimate: true,
      members: members.map(({ user_id, ...m }) => ({ ...m, isYou: user_id === userId })),
    };
  }

  getView(userId: string, groupId: string) {
    return this.view(this.db, groupId, userId);
  }

  async assertMember(userId: string, groupId: string) {
    const [m] = await this.db.query('select 1 as x from group_members where group_id = $1 and user_id = $2', [groupId, userId]);
    if (!m) throw new ForbiddenException('You are not in this group');
  }
}


import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { EventsService } from '../events/events.service';
import { FlightsService } from '../flights/flights.service';
import { GroupsService, RequestRow } from '../groups/groups.service';
import { MATCH } from '../matching/matching.util';

export interface CreateRequestInput {
  flightNo: string;
  date: string;
  destPlaceId: string;
  seats: number;
  luggage: string;
  womenOnly: boolean;
  airport?: string;
}

const ACTIVE = ['PENDING', 'MATCHED', 'CONFIRMED'];

@Injectable()
export class RequestsService {
  constructor(
    private readonly db: DbService,
    private readonly flights: FlightsService,
    private readonly groups: GroupsService,
    private readonly events: EventsService,
  ) {}

  async create(userId: string, input: CreateRequestInput) {
    const [user] = await this.db.query('select id, gender, name from users where id = $1', [userId]);
    if (!user?.name) throw new BadRequestException('Add your name to your profile first');
    if (input.womenOnly && user.gender !== 'female') {
      throw new BadRequestException('Women-only matching needs gender set to "female" on your profile');
    }

    // 1. the flight tells us where and when the person lands
    const flight = await this.flights.lookup(input.flightNo, input.date, input.airport);
    if (flight.status === 'cancelled') throw new BadRequestException(`${flight.flightNo} on ${input.date} is cancelled`);
    const [airport] = await this.db.query('select id, iata from airports where iata = $1 and active = true', [flight.destIata]);
    if (!airport) throw new BadRequestException(`${flight.flightNo} lands at ${flight.destIata}. FlyPool is not live there yet.`);
    if (input.airport && input.airport !== flight.destIata) {
      throw new BadRequestException(`${flight.flightNo} lands at ${flight.destIata}, not ${input.airport}. Check the airport.`);
    }

    // 2. destination must be a known area at that airport
    const [place] = await this.db.query('select * from places where id = $1 and airport_id = $2', [input.destPlaceId, airport.id]);
    if (!place) throw new BadRequestException('Pick a drop area from the list for this airport');

    const eta = new Date(flight.estimatedArrival.getTime() + MATCH.etaBufferMin * 60_000);
    const expires = new Date(eta.getTime() + 3 * 3600_000);
    if (expires < new Date()) throw new BadRequestException('This flight has already landed');

    // 3. store + find a group, atomically
    let result;
    try {
      result = await this.db.tx(async (q) => {
        const [row] = await q.query(
          `insert into ride_requests (user_id, airport_id, flight_no, flight_date, terminal, eta, dest_label, dest_lat, dest_lng,
                                      est_solo_fare, seats, luggage, women_only, expires_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
          [userId, airport.id, flight.flightNo, input.date, flight.terminal, eta, place.label, place.lat, place.lng,
           place.est_solo_fare, input.seats, input.luggage, input.womenOnly, expires],
        );
        const suggestions = await this.groups.suggestions(q, row as RequestRow, user.gender);
        // Nobody to join yet: open a group of one so later arrivals can find this person.
        const groupId = suggestions.length ? null : await this.groups.createFor(q, row as RequestRow);
        return { request: this.present({ ...row, group_id: groupId, group_status: groupId ? 'OPEN' : null }), flight: this.presentFlight(flight), suggestions, groupId };
      });
    } catch (e: any) {
      if (e?.code === '23505') throw new ConflictException('You already have an active request for this flight. Open it from My trips.');
      throw e;
    }
    return result;
  }

  async listMine(userId: string) {
    const rows = await this.db.query(
      `select r.*, gm.group_id, g.status as group_status, g.pickup_point,
              (select count(*)::int from group_members x where x.group_id = gm.group_id) as member_count
       from ride_requests r
       left join group_members gm on gm.request_id = r.id
       left join groups g on g.id = gm.group_id
       where r.user_id = $1 order by r.eta desc limit 50`,
      [userId],
    );
    return rows.map((r) => this.present(r));
  }

  async suggestionsFor(userId: string, requestId: string) {
    const [r] = await this.db.query('select r.*, u.gender from ride_requests r join users u on u.id = r.user_id where r.id = $1 and r.user_id = $2', [requestId, userId]);
    if (!r) throw new NotFoundException('Ride request not found');
    if (!ACTIVE.includes(r.status)) return [];
    return this.groups.suggestions(this.db, r as RequestRow, r.gender);
  }

  /** Skip the suggestions and start a fresh group of your own. */
  async ownGroup(userId: string, requestId: string) {
    const out = await this.db.tx(async (q) => {
      const [r] = await q.query(`select * from ride_requests where id = $1 and user_id = $2 and status in ('PENDING','MATCHED')`, [requestId, userId]);
      if (!r) throw new NotFoundException('Active request not found');
      const old = await this.groups.removeMember(q, requestId);
      const groupId = await this.groups.createFor(q, r as RequestRow);
      return { view: await this.groups.view(q, groupId, userId), old };
    });
    if (out.old) await this.events.toGroup(out.old, { type: 'group.updated' });
    return out.view;
  }

  async cancel(userId: string, requestId: string) {
    const out = await this.db.tx(async (q) => {
      const [r] = await q.query(
        `update ride_requests r set status = 'CANCELLED' from users u
         where r.id = $1 and r.user_id = $2 and u.id = r.user_id and r.status in ('PENDING','MATCHED','CONFIRMED') returning u.name`,
        [requestId, userId],
      );
      if (!r) throw new NotFoundException('Active ride request not found');
      const groupId = await this.groups.removeMember(q, requestId);
      if (groupId) await this.groups.systemMessage(q, groupId, `${(r.name ?? 'A traveller').split(' ')[0]} cancelled their ride.`);
      return { groupId, name: r.name };
    });
    if (out.groupId) {
      await this.events.toGroup(out.groupId, { type: 'group.updated', note: `${(out.name ?? 'A traveller').split(' ')[0]} cancelled` });
      await this.events.toGroup(out.groupId, { type: 'message.created' });
    }
    return { cancelled: true };
  }

  private present(r: any) {
    return {
      id: r.id,
      flightNo: r.flight_no,
      flightDate: r.flight_date instanceof Date ? r.flight_date.toLocaleDateString('en-CA') : r.flight_date,
      terminal: r.terminal,
      eta: r.eta,
      destLabel: r.dest_label,
      seats: r.seats,
      luggage: r.luggage,
      womenOnly: r.women_only,
      status: r.status,
      estSoloFare: r.est_solo_fare,
      groupId: r.group_id ?? null,
      groupStatus: r.group_status ?? null,
      groupSize: r.member_count ?? null,
      pickupPoint: r.pickup_point ?? null,
    };
  }

  private presentFlight(f: any) {
    return {
      flightNo: f.flightNo, origin: f.originIata, destination: f.destIata, terminal: f.terminal,
      scheduledArrival: f.scheduledArrival, estimatedArrival: f.estimatedArrival, status: f.status,
    };
  }
}

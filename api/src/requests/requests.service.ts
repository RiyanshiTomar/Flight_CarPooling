import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
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

@Injectable()
export class RequestsService {
  constructor(
    private readonly db: DbService,
    private readonly flights: FlightsService,
    private readonly groups: GroupsService,
  ) {}

  async create(userId: string, input: CreateRequestInput) {
    const [user] = await this.db.query('select id, gender from users where id = $1', [userId]);
    if (input.womenOnly && user.gender !== 'female') {
      throw new BadRequestException('Women-only matching needs gender set to "female" on your profile');
    }

    // 1. the flight tells us where and when the person lands
    const flight = await this.flights.lookup(input.flightNo, input.date, input.airport);
    const [airport] = await this.db.query('select id, iata from airports where iata = $1 and active = true', [flight.destIata]);
    if (!airport) throw new BadRequestException(`FlyPool is not live at ${flight.destIata} yet`);

    // 2. destination must be a known area at that airport
    const [place] = await this.db.query('select * from places where id = $1 and airport_id = $2', [input.destPlaceId, airport.id]);
    if (!place) throw new BadRequestException('Pick a drop area from the list for this airport');

    const eta = new Date(flight.estimatedArrival.getTime() + MATCH.etaBufferMin * 60_000);
    const expires = new Date(eta.getTime() + 3 * 3600_000);
    if (expires < new Date()) throw new BadRequestException('This flight has already landed');

    // 3. store + find a group, atomically
    try {
      return await this.db.tx(async (q) => {
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
        return { request: this.present(row), flight: this.presentFlight(flight), suggestions, groupId };
      });
    } catch (e: any) {
      if (e?.code === '23505') throw new ConflictException('You already have an active request for this flight');
      throw e;
    }
  }

  async listMine(userId: string) {
    const rows = await this.db.query(
      `select r.*, gm.group_id from ride_requests r
       left join group_members gm on gm.request_id = r.id
       where r.user_id = $1 order by r.created_at desc limit 50`,
      [userId],
    );
    return rows.map((r) => ({ ...this.present(r), groupId: r.group_id ?? null }));
  }

  async suggestionsFor(userId: string, requestId: string) {
    const [r] = await this.db.query('select r.*, u.gender from ride_requests r join users u on u.id = r.user_id where r.id = $1 and r.user_id = $2', [requestId, userId]);
    if (!r) throw new NotFoundException('Ride request not found');
    return this.groups.suggestions(this.db, r as RequestRow, r.gender);
  }

  async cancel(userId: string, requestId: string) {
    return this.db.tx(async (q) => {
      const [r] = await q.query(
        `update ride_requests set status = 'CANCELLED' where id = $1 and user_id = $2 and status in ('PENDING','MATCHED','CONFIRMED') returning id`,
        [requestId, userId],
      );
      if (!r) throw new NotFoundException('Active ride request not found');
      await this.groups.removeMember(q, requestId);
      return { cancelled: true };
    });
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
      womenOnly: r.women_only,
      status: r.status,
      estSoloFare: r.est_solo_fare,
    };
  }

  private presentFlight(f: any) {
    return {
      flightNo: f.flightNo, origin: f.originIata, destination: f.destIata, terminal: f.terminal,
      scheduledArrival: f.scheduledArrival, estimatedArrival: f.estimatedArrival, status: f.status,
    };
  }
}

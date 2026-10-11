import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { FLIGHT_PROVIDER, FlightInfo, FlightProvider, normalizeFlightNo } from './flight-provider';

@Injectable()
export class FlightsService {
  constructor(private readonly db: DbService, @Inject(FLIGHT_PROVIDER) private readonly provider: FlightProvider) {}

  /**
   * Cache-first lookup. 50 users on the same flight cost ONE vendor call per cache window.
   * The flight_snapshots table doubles as history for delay analytics later.
   */
  async lookup(rawNo: string, date: string, hintAirport?: string): Promise<FlightInfo> {
    const flightNo = normalizeFlightNo(rawNo);
    const ttl = Number(process.env.FLIGHT_CACHE_MINUTES ?? 10);

    const [cached] = await this.db.query(
      `select flight_no, flight_date::text as flight_date, origin_iata, dest_iata, terminal,
              sched_arrival, est_arrival, status, provider
       from flight_snapshots
       where flight_no = $1 and flight_date = $2 and fetched_at > now() - ($3 || ' minutes')::interval`,
      [flightNo, date, String(ttl)],
    );
    if (cached) return this.fromRow(cached);

    const fresh = await this.provider.getFlight(flightNo, date, hintAirport);
    if (!fresh) throw new NotFoundException(`No flight ${flightNo} found on ${date}`);

    await this.db.query(
      `insert into flight_snapshots (flight_no, flight_date, origin_iata, dest_iata, terminal, sched_arrival, est_arrival, status, provider)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (flight_no, flight_date) do update set
         origin_iata = excluded.origin_iata, dest_iata = excluded.dest_iata, terminal = excluded.terminal,
         sched_arrival = excluded.sched_arrival, est_arrival = excluded.est_arrival,
         status = excluded.status, provider = excluded.provider, fetched_at = now()`,
      [fresh.flightNo, date, fresh.originIata, fresh.destIata, fresh.terminal, fresh.scheduledArrival, fresh.estimatedArrival, fresh.status, fresh.provider],
    );
    return fresh;
  }

  private fromRow(r: any): FlightInfo {
    return {
      flightNo: r.flight_no,
      flightDate: r.flight_date,
      originIata: r.origin_iata,
      destIata: r.dest_iata,
      terminal: r.terminal,
      scheduledArrival: new Date(r.sched_arrival),
      estimatedArrival: new Date(r.est_arrival),
      status: r.status,
      provider: r.provider,
    };
  }
}

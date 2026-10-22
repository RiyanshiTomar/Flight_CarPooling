import { Injectable, Logger, Module, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { EventsService } from '../events/events.service';
import { FlightsModule } from '../flights/flights.module';
import { FlightsService } from '../flights/flights.service';
import { GroupsModule } from '../groups/groups.module';
import { GroupsService } from '../groups/groups.service';
import { MATCH, perPersonFare } from '../matching/matching.util';
import { fmtIst } from '../common/time';

/**
 * Background work, run inside the API process (set JOBS_ENABLED=false on all but a worker if you prefer).
 * Each job takes a short DB lease first, so with several instances only one runs it at a time.
 *
 *  expire   (every minute)  PENDING/MATCHED requests past their expiry -> EXPIRED; groups 12h past pickup auto-close
 *  flights  (every 5 min)   re-check flights landing in the next 12h; on ETA change, move the pickup window and tell the group
 *  cleanup  (hourly)        drop old OTP codes and dead refresh tokens
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Jobs');
  private timers: NodeJS.Timeout[] = [];
  private running = new Set<string>();

  constructor(
    private readonly db: DbService,
    private readonly flights: FlightsService,
    private readonly groups: GroupsService,
    private readonly events: EventsService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.JOBS_ENABLED === 'false') return;
    const every = (name: string, sec: number, fn: () => Promise<unknown>) => {
      const run = () => this.runLeased(name, sec, fn);
      this.timers.push(setTimeout(run, 5_000 + Math.random() * 5_000)); // first run shortly after boot
      this.timers.push(setInterval(run, sec * 1000));
    };
    every('expire', Number(process.env.JOB_EXPIRE_SEC ?? 60), () => this.expire());
    every('flights', Number(process.env.FLIGHT_POLL_MINUTES ?? 5) * 60, () => this.refreshFlights());
    every('cleanup', 3600, () => this.cleanup());
  }

  onApplicationShutdown() {
    this.timers.forEach((t) => clearInterval(t));
  }

  private async runLeased(name: string, sec: number, fn: () => Promise<unknown>) {
    if (this.running.has(name)) return;
    this.running.add(name);
    try {
      const got = await this.db.query(
        `update job_leases set locked_until = now() + ($2 || ' seconds')::interval, last_run_at = now()
         where name = $1 and locked_until < now() returning name`,
        [name, String(Math.max(30, sec - 5))],
      );
      if (!got.length) return; // another instance has it
      await fn();
    } catch (e: any) {
      this.log.error(`${name} failed: ${e.message}`);
    } finally {
      this.running.delete(name);
    }
  }

  async expire() {
    const stale = await this.db.query<{ id: string }>(
      `select id from ride_requests where status in ('PENDING','MATCHED') and expires_at < now() limit 500`,
    );
    const touched = new Set<string>();
    for (const r of stale) {
      const g = await this.db.tx(async (q) => {
        await q.query(`update ride_requests set status = 'EXPIRED' where id = $1 and status in ('PENDING','MATCHED')`, [r.id]);
        return this.groups.removeMember(q, r.id);
      });
      if (g) touched.add(g);
    }

    // trips nobody marked as finished: close them 12h after the pickup window so they can be rated
    const done = await this.db.query<{ id: string; est_solo_fare: number; seats_taken: number }>(
      `select id, est_solo_fare, seats_taken from groups
       where status in ('CONFIRMED','IN_TRIP') and window_end < now() - interval '12 hours' limit 200`,
    );
    for (const g of done) {
      await this.db.tx(async (q) => {
        const rows = await q.query(
          `update groups set status = 'COMPLETED', completed_at = now(), final_per_person = $2
           where id = $1 and status in ('CONFIRMED','IN_TRIP') returning id`,
          [g.id, perPersonFare(g.est_solo_fare, g.seats_taken)],
        );
        if (!rows.length) return;
        await q.query(`update ride_requests set status = 'COMPLETED' where id in (select request_id from group_members where group_id = $1)`, [g.id]);
        await q.query(`update users set trips_count = trips_count + 1 where id in (select user_id from group_members where group_id = $1)`, [g.id]);
        await this.groups.systemMessage(q, g.id, 'This trip was closed automatically. Rate your co-travellers when you get a moment.');
      });
      touched.add(g.id);
    }

    // abandoned solo or never-confirmed groups whose window is long gone
    await this.db.query(
      `update groups set status = 'CANCELLED' where status = 'OPEN' and window_end < now() - interval '6 hours'
       and not exists (select 1 from group_members m join ride_requests r on r.id = m.request_id
                       where m.group_id = groups.id and r.status in ('PENDING','MATCHED','CONFIRMED'))`,
    );
    for (const g of touched) await this.events.toGroup(g, { type: 'group.updated' });
    if (stale.length || done.length) this.log.log(`expired ${stale.length} requests, closed ${done.length} trips`);
  }

  async refreshFlights() {
    const flights = await this.db.query<{ flight_no: string; flight_date: string; iata: string }>(
      `select distinct r.flight_no, r.flight_date::text as flight_date, a.iata
       from ride_requests r join airports a on a.id = r.airport_id
       where r.status in ('PENDING','MATCHED','CONFIRMED') and r.eta between now() - interval '1 hour' and now() + interval '12 hours'
       limit 300`,
    );
    for (const f of flights) {
      let info;
      try {
        info = await this.flights.lookup(f.flight_no, f.flight_date, f.iata);
      } catch (e: any) {
        this.log.warn(`flight ${f.flight_no} ${f.flight_date}: ${e.message}`);
        continue;
      }
      const newEta = new Date(info.estimatedArrival.getTime() + MATCH.etaBufferMin * 60_000);
      const changed = await this.db.query<{ id: string; user_id: string; eta: Date }>(
        `select id, user_id, eta from ride_requests
         where flight_no = $1 and flight_date = $2 and status in ('PENDING','MATCHED','CONFIRMED')
           and abs(extract(epoch from (eta - $3::timestamptz))) >= 300`,
        [f.flight_no, f.flight_date, newEta],
      );
      if (!changed.length) continue;

      const delta = Math.round((newEta.getTime() - new Date(changed[0].eta).getTime()) / 60_000);
      const note =
        info.status === 'cancelled'
          ? `${info.flightNo} is cancelled. Your group has been told.`
          : `${info.flightNo} now lands ${fmtIst(info.estimatedArrival)} (${delta > 0 ? `${delta} min later` : `${-delta} min earlier`}). Pickup time updated.`;
      const groupsTouched = new Set<string>();
      await this.db.tx(async (q) => {
        for (const r of changed) {
          await q.query(`update ride_requests set eta = $2, expires_at = $2::timestamptz + interval '3 hours' where id = $1`, [r.id, newEta]);
          const [m] = await q.query('select group_id from group_members where request_id = $1', [r.id]);
          if (m) {
            await this.groups.recompute(q, m.group_id);
            groupsTouched.add(m.group_id);
          }
        }
        for (const g of groupsTouched) await this.groups.systemMessage(q, g, note);
      });
      await this.events.toUsers(
        changed.map((r) => r.user_id),
        { type: 'flight.updated', note },
      );
      for (const g of groupsTouched) {
        await this.events.toGroup(g, { type: 'group.updated' });
        await this.events.toGroup(g, { type: 'message.created' });
      }
      this.log.log(`${info.flightNo}: ETA moved ${delta} min for ${changed.length} riders`);
    }
  }

  async cleanup() {
    await this.db.query(`delete from otp_codes where created_at < now() - interval '1 day'`);
    await this.db.query(
      `delete from refresh_tokens where expires_at < now() - interval '7 days' or revoked_at < now() - interval '7 days'`,
    );
  }
}

@Module({ imports: [FlightsModule, GroupsModule], providers: [JobsService], exports: [JobsService] })
export class JobsModule {}

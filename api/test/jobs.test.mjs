// Background jobs against a real in-memory Postgres (PGlite), flight provider faked so we control the ETA.
// Runs on the compiled code: npm run test:e2e (builds first). PGlite needs real ESM, which Jest's VM lacks.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('reflect-metadata');
const { DbService } = require('../dist/db/db.service');
const { EventsService } = require('../dist/events/events.service');
const { GroupsService } = require('../dist/groups/groups.service');
const { JobsService } = require('../dist/jobs/jobs.service');

const expect = (v) => ({
  toBe: (x) => assert.equal(v, x),
  toBeGreaterThan: (x) => assert.ok(v > x, `${v} > ${x}`),
});
/** Real SQL on an in-memory Postgres (PGlite); the flight provider is faked so we control the ETA. */
describe('background jobs', () => {
  let db, events, groups, jobs, landing;
  const sent = [];

  before(async () => {
    process.env.PGLITE_DIR = 'memory://';
    if (process.env.E2E_DATABASE_URL) process.env.DATABASE_URL = process.env.E2E_DATABASE_URL; // real Postgres
    else delete process.env.DATABASE_URL;
    const cwd = process.cwd();
    db = new DbService();
    await db.onModuleInit();
    process.chdir(cwd);
    events = new EventsService(db);
    await events.onModuleInit();
    events.toUsers = async (ids, e) => void sent.push({ ids, e });
    groups = new GroupsService(db, events);
    const flights = { lookup: async () => ({ flightNo: '6E2041', estimatedArrival: landing, status: 'delayed' }) };
    jobs = new JobsService(db, flights, groups, events);
  });

  after(async () => db.onModuleDestroy());

  async function rider(phone, etaMs, expiresMs) {
    const [u] = await db.query(`insert into users (phone, name) values ($1, 'Rider ' || $1) returning id`, [phone]);
    const [a] = await db.query(`select id from airports where iata = 'DEL'`);
    const [r] = await db.query(
      `insert into ride_requests (user_id, airport_id, flight_no, flight_date, terminal, eta, dest_label, dest_lat, dest_lng, est_solo_fare, expires_at)
       values ($1,$2,'6E2041',(now() + interval '2 hours')::date,'T3',$3,'Saket',28.52,77.2,520,$4) returning *`,
      [u.id, a.id, new Date(Date.now() + etaMs), new Date(Date.now() + expiresMs)],
    );
    return r;
  }

  it('moves the pickup window when a flight is delayed and tells the group', async () => {
    const r1 = await rider('+919811111111', 2 * 3600_000, 5 * 3600_000);
    const r2 = await rider('+919822222222', 2 * 3600_000, 5 * 3600_000);
    const gid = await db.tx(async (q) => {
      const g = await groups.createFor(q, r1);
      await groups.addMember(q, g, r2);
      return g;
    });
    // flight now lands 20 minutes later than the stored ETA (ETA = landing + 30 min buffer)
    landing = new Date(new Date(r1.eta).getTime() - 30 * 60_000 + 20 * 60_000);
    await jobs.refreshFlights();

    const [g] = await db.query('select window_start from groups where id = $1', [gid]);
    expect(Math.round((new Date(g.window_start).getTime() - new Date(r1.eta).getTime()) / 60_000)).toBe(20);
    const msgs = await db.query(`select body from messages where group_id = $1 and kind = 'system'`, [gid]);
    expect(msgs.some((m) => /20 min later/.test(m.body))).toBe(true);
    expect(sent.some((s) => s.e.type === 'flight.updated' && s.ids.length === 2)).toBe(true);

    // running again with the same ETA changes nothing
    const before = msgs.length;
    await jobs.refreshFlights();
    const after = await db.query(`select 1 from messages where group_id = $1 and kind = 'system'`, [gid]);
    expect(after.length).toBe(before);
  });

  it('expires stale requests and cancels their empty groups', async () => {
    const r = await rider('+919833333333', -5 * 3600_000, -60_000);
    const gid = await db.tx((q) => groups.createFor(q, r));
    await jobs.expire();
    const [req] = await db.query('select status from ride_requests where id = $1', [r.id]);
    const [g] = await db.query('select status from groups where id = $1', [gid]);
    expect(req.status).toBe('EXPIRED');
    expect(g.status).toBe('CANCELLED');
  });

  it('auto-closes confirmed trips long after pickup', async () => {
    const r1 = await rider('+919844444444', -20 * 3600_000, 5 * 3600_000);
    const r2 = await rider('+919855555555', -20 * 3600_000, 5 * 3600_000);
    const gid = await db.tx(async (q) => {
      const g = await groups.createFor(q, r1);
      await groups.addMember(q, g, r2);
      await q.query('update group_members set confirmed_at = now() where group_id = $1', [g]);
      await groups.recompute(q, g);
      return g;
    });
    await jobs.expire();
    const [g] = await db.query('select status, final_per_person from groups where id = $1', [gid]);
    expect(g.status).toBe('COMPLETED');
    expect(g.final_per_person).toBeGreaterThan(0);
  });
});

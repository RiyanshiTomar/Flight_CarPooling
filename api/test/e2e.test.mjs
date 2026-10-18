// End-to-end test: boots the real compiled server (embedded in-memory Postgres) and drives it over HTTP.
// Run with: npm run test:e2e   (builds first)
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 4011;
const URL = `http://localhost:${PORT}`;
const date = new Date(Date.now() + 36 * 3600_000).toLocaleDateString('en-CA'); // always in the future
let server;
let places = {};

async function api(method, path, { token, body } = {}) {
  const res = await fetch(URL + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

async function login(phone, gender, name) {
  const otp = await api('POST', '/auth/otp/request', { body: { phone } });
  assert.equal(otp.status, 201, JSON.stringify(otp.body));
  const v = await api('POST', '/auth/otp/verify', { body: { phone, code: otp.body.devCode } });
  assert.equal(v.status, 201);
  const token = v.body.accessToken;
  assert.equal((await api('PATCH', '/me', { token, body: { gender, name } })).status, 200);
  return token;
}

/** Open the SSE stream and collect events until stop() is called. */
function listen(token) {
  const events = [];
  const ctrl = new AbortController();
  const ready = (async () => {
    const res = await fetch(URL + '/events', { headers: { authorization: `Bearer ${token}` }, signal: ctrl.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    (async () => {
      const dec = new TextDecoder();
      let buf = '';
      try {
        for await (const chunk of res.body) {
          buf += dec.decode(chunk, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const data = block.split('\n').find((l) => l.startsWith('data:'));
            if (block.includes('event: event') && data) events.push(JSON.parse(data.slice(5)));
          }
        }
      } catch { /* aborted */ }
    })();
  })();
  return { events, ready, stop: () => ctrl.abort() };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reqBody = (dest, extra = {}) => ({
  flightNo: '6E 2041', date, destPlaceId: places[dest], seats: 1, luggage: 'cabin', womenOnly: false, ...extra,
});

before(async () => {
  server = spawn(process.execPath, ['dist/main'], {
    env: {
      ...process.env, PORT: String(PORT), PGLITE_DIR: 'memory://', JWT_SECRET: 'test-secret', OTP_DEV_ECHO: 'true',
      FLIGHT_PROVIDER: 'mock', OTP_RATE_LIMIT: '100000', RATE_LIMIT: '100000', DATABASE_URL: process.env.E2E_DATABASE_URL ?? '', JOBS_ENABLED: 'false',
      LOG_REQUESTS: 'false', NODE_ENV: 'test',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL + '/health')).ok) break; } catch { /* not up yet */ }
    await wait(500);
  }
  const list = (await api('GET', '/places?airport=DEL')).body;
  places = Object.fromEntries(list.map((p) => [p.label, p.id]));
});
after(() => server?.kill());

describe('FlyPool API', () => {
  let a, b, c, d, groupId, aRefresh, bMemberId, aMemberId;

  it('public catalog works and sends security headers', async () => {
    const ap = await api('GET', '/airports');
    assert.deepEqual(ap.body.map((x) => x.iata), ['BLR', 'DEL']);
    assert.ok(places['Gurugram - Cyber Hub']);
    const pl = (await api('GET', '/places?airport=DEL')).body[0];
    assert.ok(pl.estSharedFare < pl.estSoloFare);
    assert.equal(ap.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(ap.headers.get('x-request-id'));
  });

  it('protected routes need a token, errors have one shape', async () => {
    const r = await api('GET', '/me');
    assert.equal(r.status, 401);
    assert.equal(r.body.statusCode, 401);
    assert.ok(r.body.requestId);
    assert.equal((await api('POST', '/ride-requests', { body: {} })).status, 401);
  });

  it('OTP rejects wrong code, bad phone numbers, and counts tries', async () => {
    await api('POST', '/auth/otp/request', { body: { phone: '9000000001' } });
    const bad = await api('POST', '/auth/otp/verify', { body: { phone: '9000000001', code: '000000' } });
    assert.equal(bad.status, 400);
    assert.match(bad.body.message, /tries left/);
    assert.equal((await api('POST', '/auth/otp/request', { body: { phone: '1234567890' } })).status, 400);
  });

  it('OTP resend has a cooldown and a code works only once', async () => {
    const r1 = await api('POST', '/auth/otp/request', { body: { phone: '9000000002' } });
    assert.equal((await api('POST', '/auth/otp/request', { body: { phone: '9000000002' } })).status, 429);
    assert.equal((await api('POST', '/auth/otp/verify', { body: { phone: '9000000002', code: r1.body.devCode } })).status, 201);
    assert.equal((await api('POST', '/auth/otp/verify', { body: { phone: '9000000002', code: r1.body.devCode } })).status, 400);
  });

  it('refresh tokens rotate, and reusing an old one ends the session', async () => {
    const otp = await api('POST', '/auth/otp/request', { body: { phone: '9876500110' } });
    const v = await api('POST', '/auth/otp/verify', { body: { phone: '9876500110', code: otp.body.devCode } });
    assert.equal(v.body.isNewUser, true);
    const first = v.body.refreshToken;
    const r1 = await api('POST', '/auth/refresh', { body: { refreshToken: first } });
    assert.equal(r1.status, 200);
    assert.notEqual(r1.body.refreshToken, first);
    assert.equal((await api('POST', '/auth/refresh', { body: { refreshToken: first } })).status, 401); // reuse!
    assert.equal((await api('POST', '/auth/refresh', { body: { refreshToken: r1.body.refreshToken } })).status, 401); // family revoked
    const again = await api('POST', '/auth/otp/request', { body: { phone: '9876500110' } });
    assert.equal(again.status, 429); // cooldown still on, fine: log in below after a fresh login path
  });

  it('a ride needs a name on the profile', async () => {
    await wait(10); // separate user to avoid the cooldown above
    const otp = await api('POST', '/auth/otp/request', { body: { phone: '9876500999' } });
    const v = await api('POST', '/auth/otp/verify', { body: { phone: '9876500999', code: otp.body.devCode } });
    const r = await api('POST', '/ride-requests', { token: v.body.accessToken, body: reqBody('Saket') });
    assert.equal(r.status, 400);
    assert.match(r.body.message, /name/);
  });

  it('first traveller gets a group of one and no suggestions', async () => {
    a = await login('9876500111', 'female', 'Aarti Sharma');
    const r = await api('POST', '/ride-requests', { token: a, body: reqBody('Gurugram - Cyber Hub', { airport: 'DEL' }) });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.suggestions, []);
    assert.ok(r.body.groupId);
    assert.equal(r.body.flight.destination, 'DEL');
    groupId = r.body.groupId;
  });

  it('the airport picked must match where the flight lands', async () => {
    const r = await api('POST', '/ride-requests', { token: a, body: reqBody('Saket', { flightNo: 'AI 101', airport: 'BLR' }) });
    assert.equal(r.status, 400);
  });

  it('duplicate request for the same flight is a 409', async () => {
    assert.equal((await api('POST', '/ride-requests', { token: a, body: reqBody('Gurugram - Cyber Hub') })).status, 409);
  });

  it('second traveller is suggested the group, joins, and the first hears it live', async () => {
    const live = listen(a);
    await live.ready;
    b = await login('9876500220', 'male', 'Bhavesh Rao');
    const r = await api('POST', '/ride-requests', { token: b, body: reqBody('Gurugram - DLF Phase 3') });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.suggestions.length, 1);
    const s = r.body.suggestions[0];
    assert.equal(s.group.id, groupId);
    assert.ok(s.score > 60);
    assert.doesNotMatch(JSON.stringify(s), /\+91|user_id|phone|Sharma/); // privacy: first names only, nothing identifying

    const j = await api('POST', `/groups/${groupId}/join`, { token: b, body: { requestId: r.body.request.id } });
    assert.equal(j.status, 201, JSON.stringify(j.body));
    assert.equal(j.body.members.length, 2);
    assert.equal(j.body.status, 'OPEN');
    assert.ok(j.body.perPersonFare < j.body.soloFare);
    bMemberId = j.body.members.find((m) => m.isYou).memberId;
    aMemberId = j.body.members.find((m) => !m.isYou).memberId;
    assert.doesNotMatch(JSON.stringify(j.body), /user_id|\+91/);
    assert.equal(j.body.members.find((m) => !m.isYou).name, 'Aarti'); // members see first names only

    await wait(300);
    live.stop();
    assert.ok(live.events.some((e) => e.type === 'group.updated' && e.groupId === groupId && /Bhavesh joined/.test(e.note)));
  });

  it('only members can change the pickup point', async () => {
    const p = await api('PATCH', `/groups/${groupId}/pickup`, { token: a, body: { pickupPoint: 'T3 Gate 4, near Costa' } });
    assert.equal(p.status, 200);
    assert.equal(p.body.pickupPoint, 'T3 Gate 4, near Costa');
  });

  it('ride cannot start before everyone confirms, then group becomes CONFIRMED', async () => {
    assert.equal((await api('POST', `/groups/${groupId}/start`, { token: a })).status, 400);
    assert.equal((await api('POST', `/groups/${groupId}/confirm`, { token: a })).status, 201);
    const done = await api('POST', `/groups/${groupId}/confirm`, { token: b });
    assert.equal(done.body.status, 'CONFIRMED');
    const mine = await api('GET', '/ride-requests/mine', { token: b });
    assert.equal(mine.body[0].status, 'CONFIRMED');
    assert.equal(mine.body[0].groupStatus, 'CONFIRMED');
  });

  it('chat works for members only and includes system messages', async () => {
    assert.equal((await api('POST', `/groups/${groupId}/messages`, { token: a, body: { body: 'I am at pillar 6' } })).status, 201);
    const m = await api('GET', `/groups/${groupId}/messages`, { token: b });
    const user = m.body.filter((x) => x.kind === 'user');
    assert.equal(user.length, 1);
    assert.equal(user[0].sender, 'Aarti');
    assert.equal(user[0].mine, false);
    assert.ok(m.body.some((x) => x.kind === 'system' && /joined/.test(x.body)));
    const after = await api('GET', `/groups/${groupId}/messages?after=${encodeURIComponent(user[0].created_at)}`, { token: b });
    assert.equal(after.body.filter((x) => x.kind === 'user').length, 0);
    d = await login('9876500440', 'male', 'Dev Kumar');
    assert.equal((await api('GET', `/groups/${groupId}/messages`, { token: d })).status, 403);
    assert.equal((await api('GET', `/groups/${groupId}`, { token: d })).status, 403);
  });

  it('share link shows family a safe, read-only view', async () => {
    const s = await api('POST', `/groups/${groupId}/share`, { token: a });
    assert.equal(s.status, 201);
    assert.equal((await api('POST', `/groups/${groupId}/share`, { token: a })).body.token, s.body.token); // same link
    const pub = await api('GET', `/share/${s.body.token}`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.sharer, 'Aarti');
    assert.equal(pub.body.members.length, 2);
    assert.doesNotMatch(JSON.stringify(pub.body), /\+91|Sharma|user_id/);
    assert.equal((await api('POST', `/groups/${groupId}/share`, { token: d })).status, 403);
    await api('DELETE', `/groups/${groupId}/share`, { token: a });
    assert.equal((await api('GET', `/share/${s.body.token}`)).status, 404);
  });

  it('ride lifecycle: start, complete, then rate', async () => {
    assert.equal((await api('POST', `/groups/${groupId}/ratings`, { token: a, body: { ratings: [{ memberId: bMemberId, score: 5 }] } })).status, 400);
    const st = await api('POST', `/groups/${groupId}/start`, { token: b });
    assert.equal(st.body.status, 'IN_TRIP');
    assert.equal((await api('POST', `/groups/${groupId}/leave`, { token: b })).status, 400); // cannot leave a moving cab
    const done = await api('POST', `/groups/${groupId}/complete`, { token: a });
    assert.equal(done.body.status, 'COMPLETED');
    assert.equal((await api('POST', `/groups/${groupId}/ratings`, { token: a, body: { ratings: [{ memberId: aMemberId, score: 5 }] } })).status, 400); // self
    const rated = await api('POST', `/groups/${groupId}/ratings`, { token: a, body: { ratings: [{ memberId: bMemberId, score: 4, comment: 'On time' }] } });
    assert.equal(rated.status, 201);
    assert.equal(rated.body.members.find((m) => m.memberId === bMemberId).ratedByYou, true);
    const meB = await api('GET', '/me', { token: b });
    assert.equal(Number(meB.body.rating_avg), 4);
    assert.equal(meB.body.trips_count, 1);
    const stats = await api('GET', '/me/stats', { token: b });
    assert.equal(stats.body.tripsCompleted, 1);
    assert.ok(stats.body.savedApprox > 0);
    assert.equal(stats.body.coTravellers, 1);
  });

  it('report + block hides that person from your future matches', async () => {
    const rep = await api('POST', '/safety/reports', { token: a, body: { groupId, memberId: bMemberId, reason: 'rude', details: 'test', block: true } });
    assert.equal(rep.status, 201, JSON.stringify(rep.body));
    const blocks = await api('GET', '/safety/blocks', { token: a });
    assert.equal(blocks.body.length, 1);
    assert.equal(blocks.body[0].name, 'Bhavesh');

    // b opens a new group on a new flight; a on the same flight must not see it
    const rb = await api('POST', '/ride-requests', { token: b, body: reqBody('Gurugram - Cyber Hub', { flightNo: 'UK 971' }) });
    assert.equal(rb.status, 201);
    const ra = await api('POST', '/ride-requests', { token: a, body: reqBody('Gurugram - Cyber Hub', { flightNo: 'UK 971' }) });
    assert.equal(ra.status, 201);
    assert.deepEqual(ra.body.suggestions, []);

    assert.equal((await api('DELETE', `/safety/blocks/${blocks.body[0].id}`, { token: a })).status, 200);
    const sug = await api('GET', `/ride-requests/${ra.body.request.id}/suggestions`, { token: a });
    assert.equal(sug.body.length, 1);
  });

  it('women-only requires a female profile', async () => {
    assert.equal((await api('POST', '/ride-requests', { token: d, body: reqBody('Saket', { womenOnly: true }) })).status, 400);
  });

  it('a far-away destination is not matched; leaving a group gives you a group of one', async () => {
    c = await login('9876500330', 'female', 'Chitra Nair');
    const r = await api('POST', '/ride-requests', { token: c, body: reqBody('Dwarka Sector 21', { flightNo: 'UK 971' }) });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.suggestions, []);

    const rd = await api('POST', '/ride-requests', { token: d, body: reqBody('Dwarka Sector 21', { flightNo: 'UK 971' }) });
    assert.equal(rd.body.suggestions.length, 1);
    const j = await api('POST', `/groups/${rd.body.suggestions[0].group.id}/join`, { token: d, body: { requestId: rd.body.request.id } });
    assert.equal(j.body.members.length, 2);
    const left = await api('POST', `/groups/${j.body.id}/leave`, { token: d });
    assert.equal(left.status, 201);
    assert.notEqual(left.body.newGroupId, j.body.id);
    const g = await api('GET', `/groups/${j.body.id}`, { token: c });
    assert.equal(g.body.members.length, 1);
  });

  it('cancelling frees the seat', async () => {
    const mine = await api('GET', '/ride-requests/mine', { token: d });
    const active = mine.body.find((r) => r.status === 'PENDING');
    assert.equal((await api('DELETE', `/ride-requests/${active.id}`, { token: d })).status, 200);
    assert.equal((await api('DELETE', `/ride-requests/${active.id}`, { token: d })).status, 404);
  });

  it('SOS is recorded and texts the trusted contact', async () => {
    assert.equal((await api('PATCH', '/me', { token: c, body: { trustedContactPhone: '9876500330' } })).status, 400); // not yourself
    const p = await api('PATCH', '/me', { token: c, body: { trustedContactName: 'Mom', trustedContactPhone: '98765 00777' } });
    assert.equal(p.body.trusted_contact_phone, '+919876500777');
    const s = await api('POST', '/safety/sos', { token: c, body: { lat: 28.55, lng: 77.1 } });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.equal(s.body.contactNotified, true);
    assert.equal(s.body.emergencyNumber, '112');
    assert.match(s.body.shareUrl, /\/share\//);
  });

  it('flight lookup is validated and cached', async () => {
    assert.equal((await api('POST', '/ride-requests', { token: a, body: { flightNo: '!!', date: 'x' } })).status, 400);
    assert.equal((await api('GET', '/flights/6E2041', { token: a })).status, 400); // date missing
    const f1 = await api('GET', `/flights/6E2041?date=${date}`, { token: a });
    const f2 = await api('GET', `/flights/6E2041?date=${date}`, { token: b });
    assert.equal(f1.status, 200);
    assert.equal(f1.body.estimatedArrival, f2.body.estimatedArrival);
  });

  it('deleting an account wipes personal data and ends sessions', async () => {
    const del = await api('DELETE', '/me', { token: c, body: { confirm: 'DELETE' } });
    assert.equal(del.status, 200);
    assert.equal((await api('GET', '/me', { token: c })).status, 404);
  });
});

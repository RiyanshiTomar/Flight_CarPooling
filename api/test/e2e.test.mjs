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
  return { status: res.status, body: json };
}

async function login(phone, gender, name) {
  const otp = await api('POST', '/auth/otp/request', { body: { phone } });
  assert.equal(otp.status, 201);
  const v = await api('POST', '/auth/otp/verify', { body: { phone, code: otp.body.devCode } });
  assert.equal(v.status, 201);
  const token = v.body.accessToken;
  assert.equal((await api('PATCH', '/me', { token, body: { gender, name } })).status, 200);
  return token;
}

const reqBody = (dest, extra = {}) => ({
  flightNo: '6E 2041', date, destPlaceId: places[dest], seats: 1, luggage: 'cabin', womenOnly: false, ...extra,
});

before(async () => {
  server = spawn(process.execPath, ['dist/main'], {
    env: {
      ...process.env, PORT: String(PORT), PGLITE_DIR: 'memory://', JWT_SECRET: 'test-secret', OTP_DEV_ECHO: 'true',
      FLIGHT_PROVIDER: 'mock', OTP_RATE_LIMIT: '100000', RATE_LIMIT: '100000', DATABASE_URL: '',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL + '/health')).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  const list = (await api('GET', '/places?airport=DEL')).body;
  places = Object.fromEntries(list.map((p) => [p.label, p.id]));
});
after(() => server?.kill());

describe('FlyPool API', () => {
  let a, b, c, d, groupId;

  it('public catalog works', async () => {
    const ap = await api('GET', '/airports');
    assert.deepEqual(ap.body.map((x) => x.iata), ['BLR', 'DEL']);
    assert.ok(places['Gurugram - Cyber Hub']);
  });

  it('protected routes need a token', async () => {
    assert.equal((await api('GET', '/me')).status, 401);
    assert.equal((await api('POST', '/ride-requests', { body: {} })).status, 401);
  });

  it('OTP rejects wrong code and bad phone numbers', async () => {
    await api('POST', '/auth/otp/request', { body: { phone: '9000000001' } });
    assert.equal((await api('POST', '/auth/otp/verify', { body: { phone: '9000000001', code: '000000' } })).status, 400);
    assert.equal((await api('POST', '/auth/otp/request', { body: { phone: '12345' } })).status, 400);
  });

  it('first traveller gets a group of one and no suggestions', async () => {
    a = await login('9876500110', 'female', 'Aarti Sharma');
    const r = await api('POST', '/ride-requests', { token: a, body: reqBody('Gurugram - Cyber Hub') });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.suggestions, []);
    assert.ok(r.body.groupId);
    assert.equal(r.body.flight.destination, 'DEL');
    groupId = r.body.groupId;
  });

  it('duplicate request for the same flight is a 409', async () => {
    assert.equal((await api('POST', '/ride-requests', { token: a, body: reqBody('Gurugram - Cyber Hub') })).status, 409);
  });

  it('second traveller on the same flight is suggested the group and joins', async () => {
    b = await login('9876500220', 'male', 'Bhavesh Rao');
    const r = await api('POST', '/ride-requests', { token: b, body: reqBody('Gurugram - DLF Phase 3') });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.suggestions.length, 1);
    const s = r.body.suggestions[0];
    assert.equal(s.group.id, groupId);
    assert.ok(s.score > 60);
    assert.doesNotMatch(JSON.stringify(s), /\+91|user_id|phone/); // privacy: nothing identifying before joining

    const j = await api('POST', `/groups/${groupId}/join`, { token: b, body: { requestId: r.body.request.id } });
    assert.equal(j.status, 201, JSON.stringify(j.body));
    assert.equal(j.body.members.length, 2);
    assert.equal(j.body.status, 'OPEN');
    assert.ok(j.body.perPersonFare < j.body.soloFare);
  });

  it('group becomes CONFIRMED once everyone confirms', async () => {
    assert.equal((await api('POST', `/groups/${groupId}/confirm`, { token: a })).status, 201);
    const done = await api('POST', `/groups/${groupId}/confirm`, { token: b });
    assert.equal(done.body.status, 'CONFIRMED');
    const mine = await api('GET', '/ride-requests/mine', { token: b });
    assert.equal(mine.body[0].status, 'CONFIRMED');
  });

  it('a far-away destination is not matched', async () => {
    c = await login('9876500330', 'female', 'Chitra Nair');
    const r = await api('POST', '/ride-requests', { token: c, body: reqBody('Dwarka Sector 21') });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.suggestions, []);
  });

  it('women-only requires a female profile', async () => {
    d = await login('9876500440', 'male', 'Dev Kumar');
    assert.equal((await api('POST', '/ride-requests', { token: d, body: reqBody('Saket', { womenOnly: true }) })).status, 400);
  });

  it('chat works for members only', async () => {
    assert.equal((await api('POST', `/groups/${groupId}/messages`, { token: a, body: { body: 'I am at pillar 6' } })).status, 201);
    const m = await api('GET', `/groups/${groupId}/messages`, { token: b });
    assert.equal(m.body.length, 1);
    assert.equal(m.body[0].sender, 'Aarti');
    assert.equal(m.body[0].mine, false);
    assert.equal((await api('GET', `/groups/${groupId}/messages`, { token: d })).status, 403);
    assert.equal((await api('GET', `/groups/${groupId}`, { token: d })).status, 403);
  });

  it('cancelling frees the seat and reopens the group', async () => {
    const mine = await api('GET', '/ride-requests/mine', { token: b });
    assert.equal((await api('DELETE', `/ride-requests/${mine.body[0].id}`, { token: b })).status, 200);
    const g = await api('GET', `/groups/${groupId}`, { token: a });
    assert.equal(g.body.members.length, 1);
    assert.equal(g.body.status, 'OPEN');
  });

  it('flight lookup is validated and cached', async () => {
    assert.equal((await api('POST', '/ride-requests', { token: a, body: { flightNo: '!!', date: 'x' } })).status, 400);
    assert.equal((await api('GET', '/flights/6E2041', { token: a })).status, 400); // date missing
    const f1 = await api('GET', `/flights/6E2041?date=${date}`, { token: a });
    const f2 = await api('GET', `/flights/6E2041?date=${date}`, { token: b });
    assert.equal(f1.status, 200);
    assert.equal(f1.body.estimatedArrival, f2.body.estimatedArrival);
  });
});


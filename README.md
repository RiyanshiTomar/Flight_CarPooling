# FlyPool

**Landed? Don't overpay for the cab.** FlyPool matches travellers who land at the same airport within ~40 minutes of each other and are heading the same way, so they can share one cab and split the fare.

Launch airport: **Delhi IGI (T3)**, then Bengaluru BLR.

| Part | Folder | Stack | Status |
|---|---|---|---|
| Website (mobile-first, installable PWA) | [`web/`](web) | Next.js, TypeScript, Tailwind | v2: new design, live updates, full ride lifecycle, safety tools |
| Backend API | [`api/`](api) | NestJS, TypeScript, PostgreSQL | v2: refresh tokens, live events (SSE), jobs, ratings, safety, SMS adapter |
| Architecture and scaling plan | [`ARCHITECTURE.md`](ARCHITECTURE.md), [`FlyPool_Architecture.pdf`](FlyPool_Architecture.pdf) | | Reference |

> **FlyPool is not a cab service.** We only connect travellers who can share a ride. We do not book cabs, run vehicles or collect fares. Any amount shown in the app is a rough estimate of each person's share, paid directly to whichever cab the group books (Uber, Ola, prepaid taxi...).

The website talks to the API through one swappable layer. See [Switching the backend](#11-switching-the-backend-one-change).

---

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | **20.12 or newer** (24 tested) | `node -v` |
| npm | 10+ | `npm -v` |
| Git | any | `git --version` |
| Docker | optional, only for a real PostgreSQL | `docker -v` |

You do **not** need to install PostgreSQL. In development the API uses an embedded Postgres (PGlite) that stores data in `api/.data/`.

---

## 2. Run it locally (5 minutes)

```bash
git clone https://github.com/RiyanshiTomar/Flight_CarPooling.git
cd Flight_CarPooling
```

### Terminal 1: backend

```bash
cd api
npm install
cp .env.example .env        # Windows PowerShell: copy .env.example .env
npm run start:dev
```

You should see `FlyPool API  http://localhost:4000`. Open **http://localhost:4000/docs** for the interactive API docs (Swagger).

First start creates the database and runs the migrations in `api/migrations/` automatically.

### Terminal 2: website

```bash
cd web
npm install
cp .env.local.example .env.local     # Windows PowerShell: copy .env.local.example .env.local
npm run dev
```

Open **http://localhost:3000**. Log in with any Indian mobile number. In development the login screen shows the OTP on the page.

No backend handy? Put `NEXT_PUBLIC_DATA_SOURCE=mock` in `web/.env.local` and the whole website runs offline on fake in-memory data.

Website settings (`web/.env.local`):

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Where the API lives |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Public URL of the website (link previews) |
| `NEXT_PUBLIC_DATA_SOURCE` | unset | `mock` = offline demo data instead of the API (demo OTP `123456`) |

### Try the API from Swagger (no frontend needed)

1. `POST /auth/otp/request` with `{"phone": "9876543210"}`. In development the response contains `devCode` (the OTP).
2. `POST /auth/otp/verify` with the phone and `devCode`. Copy the `accessToken`.
3. Click **Authorize** (top right) and paste the token.
4. `PATCH /me` with `{"name": "Your Name", "gender": "female"}`.
5. `GET /places?airport=DEL` and copy a place `id`.
6. `POST /ride-requests` with a flight number, tomorrow's date and that place id:
   ```json
   { "flightNo": "6E 2041", "date": "2026-10-12", "destPlaceId": "<id>", "seats": 1, "luggage": "cabin", "womenOnly": false }
   ```
7. Log in as a second phone number, create a request for the **same flight** and a nearby place, and you will get the first person's group in `suggestions`. Then `POST /groups/{id}/join`.

Use a **future date**: requests for flights that already landed are rejected.

---

## 3. Configuration

All backend settings live in `api/.env` (copy from `api/.env.example`, every variable is explained there).
With `NODE_ENV=production` the API **refuses to start** if a setting is unsafe (weak `JWT_SECRET`, `OTP_DEV_ECHO=true`, no `DATABASE_URL`, no SMS provider, no `PUBLIC_WEB_URL`...).

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | API port |
| `PUBLIC_WEB_URL` | `http://localhost:3000` | Website URL, used in share links and SOS texts |
| `DATABASE_URL` | empty | Empty = embedded Postgres. Set for real Postgres |
| `DATABASE_SSL` | `false` | `true` for managed Postgres that needs TLS |
| `JWT_SECRET` | dev value | 32+ random characters in production (`openssl rand -hex 32`) |
| `JWT_EXPIRES_IN` / `REFRESH_TOKEN_DAYS` | `15m` / `30` | Short access token, rotating refresh token |
| `OTP_DEV_ECHO` | `true` | Returns the OTP in the response. Refused in production |
| `SMS_PROVIDER` | `console` | `console`, `msg91` or `twilio` (keys in `.env.example`) |
| `FLIGHT_PROVIDER` | `mock` | `mock` (no key needed) or `aeroapi` |
| `AEROAPI_KEY` | empty | FlightAware key, only for `aeroapi` |
| `FLIGHT_CACHE_MINUTES` / `FLIGHT_POLL_MINUTES` | `10` / `5` | Flight cache, and how often active flights are re-checked for delays |
| `JOBS_ENABLED` | `true` | Background jobs (expiry, delay updates, cleanup) |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed website origins, comma separated |
| `TRUST_PROXY` | empty | Proxy hops to trust behind a load balancer (correct client IPs for rate limits) |
| `SWAGGER` | `false` | Swagger UI at `/docs` is off in production unless `true` |

---

## 4. Using real PostgreSQL (optional)

```bash
docker compose up -d                       # from the repo root, starts Postgres 16
```
Then in `api/.env`:
```
DATABASE_URL=postgres://flypool:flypool@localhost:5432/flypool
```
Restart the API. Migrations run on startup. The SQL is plain Postgres, so the same code runs on the embedded and the real database.

> The embedded database is great for development and tests. I verified the whole API against it. Run the tests once against your real Postgres before going live.

---

## 5. Real flight data (FlyPool uses FlightAware AeroAPI)

Out of the box the API uses **mock flights**: the same flight number and date always give the same arrival time, so you can test matching with no account.

To use real data:

1. Create an account on the FlightAware **AeroAPI** portal and choose a plan. Check the current pricing there, and check that the plan allows **commercial** use.
2. Copy your API key.
3. Put it in `api/.env` (never in the website, never in Git):
   ```
   FLIGHT_PROVIDER=aeroapi
   AEROAPI_KEY=your-key-here
   ```
4. Restart the API and call `GET /flights/6E2041?date=YYYY-MM-DD` to test.

**Cost control is built in.** Users type a flight number, so we look up only that one flight and cache it (`flight_snapshots` table). Fifty people on one flight cost one API call per cache window.

`api/src/flights/aeroapi.provider.ts` follows the AeroAPI v4 response format. Check the field names against the current FlightAware docs when you switch on, since vendors change them. Other vendors plug in by implementing the `FlightProvider` interface in `api/src/flights/flight-provider.ts`.

Why not the others from the research sheet: Aviationstack's free tier (100 requests per month) is only good for prototypes. OpenSky is for non-commercial research. Cirium/OAG are enterprise-priced, for later.

---

## 6. Tests

```bash
cd api
npm test            # unit tests (matching rules, fare split)
npm run test:e2e    # builds, boots the real server, runs 22 end-to-end API tests + 3 background-job tests

cd ../web
npm run lint && npx tsc --noEmit && npm run build
```

The e2e tests cover: OTP login (wrong codes, cooldown, single use), refresh-token rotation and reuse detection, flight lookup + cache,
matching, live events over SSE, joining, pickup changes, confirmation, start/complete/rate, share links, report + block (blocked people
disappear from matches), leaving a group, cancelling, SOS, women-only rules, privacy (first names only, no phone numbers), account deletion.
The job tests cover flight-delay updates, request expiry and auto-closing old trips.

GitHub Actions runs all of this on every push and pull request (`.github/workflows/ci.yml`).

---

## 7. API overview

| Method | Path | Purpose |
|---|---|---|
| GET | `/health`, `/airports`, `/places?airport=DEL` | Public catalog (`/health` checks the database) |
| POST | `/auth/otp/request`, `/auth/otp/verify` | Phone OTP login. Returns a 15-min access token + a refresh token |
| POST | `/auth/refresh`, `/auth/logout` | Rotate tokens (reuse of an old one ends the session), log out |
| GET / PATCH / DELETE | `/me` | Profile, trusted contact, delete account (DPDP) |
| GET | `/me/stats` | Rides, money saved, people met |
| GET | `/events` | **Live updates** (Server-Sent Events) for the logged-in user |
| GET | `/flights/:flightNo?date=YYYY-MM-DD` | Flight lookup (cached) |
| POST | `/ride-requests` | Create a request. Returns suggested groups, or opens a new group |
| GET | `/ride-requests/mine`, `/ride-requests/:id/suggestions` | My requests, fresh suggestions |
| POST | `/ride-requests/:id/own-group` | Skip suggestions, start my own group |
| DELETE | `/ride-requests/:id` | Cancel |
| GET | `/groups/:id` | Group details (members only, first names only) |
| POST | `/groups/:id/join`, `/confirm`, `/leave` | Join, confirm (all confirmed = `CONFIRMED`), leave (you get a group of one) |
| PATCH | `/groups/:id/pickup` | Change the meeting point |
| POST | `/groups/:id/start`, `/complete`, `/ratings` | Ride lifecycle and 1-5 star ratings |
| GET / POST | `/groups/:id/messages` | Group chat (`?after=` for only new messages) |
| POST / DELETE | `/groups/:id/share` | Create / turn off a read-only trip link for family |
| GET | `/share/:token` | Public trip view (no login) |
| POST | `/safety/reports`, `/safety/blocks`, `/safety/sos` | Report, block, SOS (texts your trusted contact) |
| GET / DELETE | `/safety/blocks`, `/safety/blocks/:id` | My blocked list, unblock |

Every error has one shape: `{ statusCode, message, requestId }`. Full details and try-it-out: `http://localhost:4000/docs`.

### Live updates and background jobs

- The website opens **one** `GET /events` stream after login. Events carry ids only ("group X changed"); the page then re-reads
  what changed through the normal, permission-checked endpoints. So nothing private travels over the stream.
- With several API instances on real Postgres, events go through Postgres `LISTEN/NOTIFY`, so no Redis is needed yet.
- Jobs (`api/src/jobs/jobs.service.ts`) run in the API process, each behind a DB lease so only one instance runs it:
  expire old requests, re-check flights landing in the next 12 h and move the group's pickup window on delays (with a chat message
  and a toast), auto-close trips 12 h after pickup, and clean old OTPs/tokens.

### How matching works (`api/src/matching/matching.util.ts`)

Two travellers are compatible when they are at the **same airport**, land within **40 minutes** of each other (using estimated arrival + 30 min to exit), and their drop areas are within **5 km**. A group holds up to **4 seats**. Women-only groups only accept women. Score = 100 minus penalties for time gap and distance. Tune the numbers in `MATCH`.

---

## 8. Project layout

```
Flight_CarPooling/
├── README.md
├── ARCHITECTURE.md / FlyPool_Architecture.pdf   design + scaling plan
├── docker-compose.yml                            full stack (db + api + web), or just the db
├── .github/workflows/ci.yml                      tests, lint and builds on every push
├── web/                                          Next.js website (Dockerfile: standalone server)
│   ├── app/                                      landing, login, trip/new, matches, group, trips, safety, profile,
│   │                                             share/[token] (public), terms, privacy, 404, error
│   ├── components/                               UI kit: Modal, Toast, Live (events), OtpInput, Stars, ...
│   ├── lib/hooks.ts, lib/format.ts
│   └── lib/services/                             the swappable backend layer
│       ├── types.ts                              the contract (FlyPoolService)
│       ├── http.ts                               FlyPool API: token refresh + live events
│       ├── mock.ts                               offline implementation
│       └── index.ts                              THE one file that picks the backend
└── api/                                          NestJS backend (Dockerfile included)
    ├── migrations/                               append-only SQL (001 schema, 002 seed, 003 v2)
    ├── src/auth, users, flights, requests, groups, matching, safety, events, jobs, sms, db, catalog, common
    └── test/                                     unit + e2e + jobs tests
```

---

## 9. Push to GitHub

From the repo root (first time):

```bash
git init
git add .
git commit -m "FlyPool: web UI and API (phase 2)"
git branch -M main
git remote add origin https://github.com/RiyanshiTomar/Flight_CarPooling.git
git push -u origin main
```

Check before pushing: `git status` must **not** list `.env`, `node_modules`, `.data` or `dist`. The `.gitignore` files already exclude them. Never commit `AEROAPI_KEY` or `JWT_SECRET`.

---

## 10. Deploying

- **Docker:** `docker compose up --build` runs Postgres + API + website locally the production way.
  `api/Dockerfile` and `web/Dockerfile` are production images (non-root, health check, Next.js standalone server).
- **Website:** Vercel, or any container host with `web/Dockerfile`. `NEXT_PUBLIC_API_URL` is baked in at build time.
- **API:** any container host (Railway, Render, Fly.io, AWS ECS, Cloud Run). Health check: `GET /health`.
  The `/events` stream needs a proxy that does not buffer (`X-Accel-Buffering: no` is already sent) and an idle timeout above 30 s.
- **Database:** managed PostgreSQL (Neon, Supabase, RDS). Use a direct or session-mode connection (LISTEN/NOTIFY does not work through transaction-mode PgBouncer).
- **Production checklist:** `NODE_ENV=production`, strong `JWT_SECRET`, `OTP_DEV_ECHO=false`, `SMS_PROVIDER=msg91` (DLT templates) or `twilio`,
  `PUBLIC_WEB_URL`, `CORS_ORIGINS`, `TRUST_PROXY=1` behind a load balancer. The API checks these at boot and stops if something is unsafe.
- Before launch: verify SMS vendor request formats and AeroAPI field names against their current docs, get Terms/Privacy reviewed by a lawyer,
  and add an error tracker (Sentry) in `web/app/error.tsx` and the API exception filter.

---

## 11. Switching the backend (one change)

Pages never call `fetch` and never see the backend's JSON. They only use `service` from `web/lib/services`, which follows the `FlyPoolService` interface in `web/lib/services/types.ts`.

To use a different backend (another REST API, Firebase, Supabase, GraphQL...):

1. Create `web/lib/services/myBackend.ts` that exports an object implementing `FlyPoolService`. Copy `http.ts` as a template. It also converts the backend's JSON into the app's own types, so no page is affected by the new format.
2. Open `web/lib/services/index.ts`, import it, and change the one line marked `// <-- CHANGE HERE`:
   ```ts
   const defaultService: FlyPoolService = myBackendService; // <-- CHANGE HERE
   ```

That is the whole change. No page or component is touched.

The same idea exists on the API side for flight data: add one class that implements `FlightProvider` and set `FLIGHT_PROVIDER` (see section 5).

---

## Roadmap

- [x] Phase 1: mobile-first UI
- [x] Phase 2: backend (auth, flights adapter + cache, matching v1, groups, chat REST)
- [x] Website connected to the API through a swappable service layer
- [x] v2: new design, live updates (SSE), flight-delay updates, ride lifecycle + ratings, report/block, SOS, share-trip links,
      refresh tokens, account deletion, background jobs, SMS adapter, Docker, CI
- [ ] Push notifications (FCM / Web Push) so updates arrive with the app closed
- [ ] ID verification (DigiLocker) and a trust & safety admin view for reports
- [ ] Phase 5: Delhi IGI pilot with real users
- [ ] Phase 6: Redis (shared rate limits, cache), read replicas, PostGIS, more airports (see `ARCHITECTURE.md`)

## Known limitations

- Drop areas are a fixed list per airport (no map search yet), and fares are rough estimates from a per-area base fare.
- Rate limits are counted per API instance. With several instances, add a shared store (Redis) or limit at the CDN/WAF.
- Live updates need the page open. Push notifications are the next step.
- The session (access + refresh token) is kept in `localStorage`. Tokens are short-lived and rotate, but an httpOnly cookie is stronger
  once web and API share one domain.
- Reports are stored and logged; there is no admin screen to review them yet.
- All tests pass on both the embedded Postgres (PGlite) and real PostgreSQL 16 (`E2E_DATABASE_URL=postgres://... npm run test:e2e`, against an empty database). CI runs both.

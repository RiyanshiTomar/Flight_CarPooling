# FlyPool

**Landed? Don't overpay for the cab.** FlyPool matches travellers who land at the same airport within ~40 minutes of each other and are heading the same way, so they can share one cab and split the fare.

Launch airport: **Delhi IGI (T3)**, then Bengaluru BLR.

| Part | Folder | Stack | Status |
|---|---|---|---|
| Website (mobile-first PWA-ready UI) | [`web/`](web) | Next.js, TypeScript, Tailwind | UI done, runs on mock data |
| Backend API | [`api/`](api) | NestJS, TypeScript, PostgreSQL | Phase 2 done: auth, flights, matching, groups, chat |
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
| `NEXT_PUBLIC_DATA_SOURCE` | unset | `mock` = offline demo data instead of the API |

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

All backend settings live in `api/.env` (copy from `api/.env.example`).

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | API port |
| `DATABASE_URL` | empty | Empty = embedded Postgres. Set for real Postgres, e.g. `postgres://flypool:flypool@localhost:5432/flypool` |
| `JWT_SECRET` | dev value | **Must** be a long random string in production (`openssl rand -hex 32`) |
| `OTP_DEV_ECHO` | `true` | Returns the OTP in the response. **Never true in production** (also ignored when `NODE_ENV=production`) |
| `FLIGHT_PROVIDER` | `mock` | `mock` (no key needed) or `aeroapi` |
| `AEROAPI_KEY` | empty | FlightAware key, only for `aeroapi` |
| `FLIGHT_CACHE_MINUTES` | `10` | Reuse a flight lookup for this long |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed website origins, comma separated |

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
npm run test:e2e    # builds, boots the real server, runs 12 end-to-end API tests
```

The e2e test covers: login, flight lookup + cache, matching, joining, confirmation, women-only rules, privacy of suggestions, chat access control, cancelling, duplicate requests.

---

## 7. API overview

| Method | Path | Purpose |
|---|---|---|
| GET | `/health`, `/airports`, `/places?airport=DEL` | Public catalog |
| POST | `/auth/otp/request`, `/auth/otp/verify` | Phone OTP login, returns JWT |
| GET / PATCH | `/me` | Profile |
| GET | `/flights/:flightNo?date=YYYY-MM-DD` | Flight lookup (cached) |
| POST | `/ride-requests` | Create a request. Returns suggested groups, or opens a new group |
| GET | `/ride-requests/mine`, `/ride-requests/:id/suggestions` | My requests, fresh suggestions |
| POST | `/ride-requests/:id/own-group` | Skip suggestions, start my own group |
| DELETE | `/ride-requests/:id` | Cancel |
| GET | `/groups/:id` | Group details (members only) |
| POST | `/groups/:id/join`, `/groups/:id/confirm` | Join, confirm. All confirmed = `CONFIRMED` |
| | | (Cost fields such as `soloFare` and `perPersonFare` are estimates only) |
| GET / POST | `/groups/:id/messages` | Group chat (members only) |

Full details and try-it-out: `http://localhost:4000/docs`.

### How matching works (`api/src/matching/matching.util.ts`)

Two travellers are compatible when they are at the **same airport**, land within **40 minutes** of each other (using estimated arrival + 30 min to exit), and their drop areas are within **5 km**. A group holds up to **4 seats**. Women-only groups only accept women. Score = 100 minus penalties for time gap and distance. Tune the numbers in `MATCH`.

---

## 8. Project layout

```
Flight_CarPooling/
├── README.md
├── ARCHITECTURE.md / FlyPool_Architecture.pdf   design + scaling plan
├── docker-compose.yml                            optional real Postgres
├── web/                                          Next.js website
│   ├── app/                                      pages (landing, login, trip, matches, group, safety, profile)
│   ├── components/                               shared UI
│   └── lib/services/                             the swappable backend layer
│       ├── types.ts                              the contract (FlyPoolService)
│       ├── http.ts                               implementation for the FlyPool API
│       ├── mock.ts                               offline implementation
│       └── index.ts                              THE one file that picks the backend
└── api/                                          NestJS backend
    ├── migrations/                               append-only SQL (001 schema, 002 seed)
    ├── src/auth, flights, requests, groups, matching, db, catalog
    └── test/                                     unit + e2e tests
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

## 10. Deploying later (outline)

- **Website:** Vercel (set the API URL as an environment variable).
- **API:** any container host (Railway, Render, Fly.io, AWS ECS, Cloud Run). Build with `npm run build`, start with `npm run start:prod`.
- **Database:** managed PostgreSQL (Neon, Supabase, RDS). Set `DATABASE_URL`.
- Production settings: `NODE_ENV=production`, strong `JWT_SECRET`, `OTP_DEV_ECHO=false`, and plug in a real SMS provider in `api/src/auth/auth.service.ts` (marked `TODO(prod)`). Without it nobody can log in in production.

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
- [x] Website connected to the API through a swappable service layer (login, trip request, matches, join, confirm, chat)
- [ ] Phase 3: background matcher/worker, push notifications, WebSocket chat, flight delay re-matching
- [ ] Phase 4: ID verification, report/block, in-app fare settlement
- [ ] Phase 5: Delhi IGI pilot with real users
- [ ] Phase 6: Redis cache and queue, read replicas, PostGIS, more airports (see `ARCHITECTURE.md`)

## Known limitations

- Pickup point is a fixed placeholder (`<terminal> Arrivals, Pillar 6`).
- Cost figures are rough estimates from a per-area base fare, not live cab prices, and FlyPool does not charge or collect them.
- Chat refreshes by polling every 4 seconds. WebSockets come in Phase 3.
- Login state is kept in the browser (`localStorage`), so it is per device.
- Matching runs inside the request. Fine for a pilot, move it to a worker as traffic grows.
- OTP is not sent by SMS yet.
- Verified only on the embedded Postgres, not yet on a real Postgres server.

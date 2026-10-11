# CabShare for Flyers — Architecture (v1)

Idea: Airport par utarte hi cab ke price high hote hain. User apni flight number + destination daalta hai. Same airport par, same time window mein land hone wale aur same dishaa mein jaane wale users match hote hain, aur cab share karte hain.

---

## 1. Sabse pehle: asli challenges (ye API se bade hain)

| Challenge | Kyun important | Solution |
|---|---|---|
| **Cold start** (chicken-and-egg) | Match tabhi hoga jab same time par dusre users ho | Launch **ek airport** (e.g. BLR ya DEL) + **ek corridor** se. Flight se 1 din pehle bhi request daal sakein. |
| **Safety** (strangers ke saath cab) | Trust nahi to koi use nahi karega | Phone OTP, optional ID verify, women-only matching, report/block, trip share, exact address match ke baad hi. |
| **Matching quality** | Galat match = kharab experience | Time window + destination distance + group size + luggage (neeche) |
| **Cab booking** | Hum cab nahi chalate | MVP: sirf group banate hain, fare split calculate karte hain; cab Uber/Ola/Meru app se ya airport prepaid counter se book. Baad mein deep link. |

---

## 2. Flight API — kaun si use karein

CSV ke options ka verdict:

| API | Verdict |
|---|---|
| Aviationstack | **Sirf prototype.** Free 100 req/month = ek din mein khatam. Paid ~$49.99/mo se. |
| OpenSky | **Mat use karo.** Research/non-commercial only; hamara product commercial hai. Schedule/delay data bhi weak. |
| **FlightAware AeroAPI** | **Best choice.** Accurate ETA/delay, production-grade, chhote plan se start. |
| Amadeus / Cirium / OAG | Baad mein, jab scale + contract chahiye (enterprise pricing). |

**Recommendation:** Dev/testing = Aviationstack free ya AeroAPI free tier. Launch = AeroAPI paid. Scale = Cirium/OAG.

Paid kaise karna hai (step by step):
1. FlightAware AeroAPI portal par account banao, plan choose karo (pricing page par current rates check karo, ye change hote rehte hain).
2. Card add karo; API key milegi.
3. Key sirf **backend ke `.env`** mein rakho. Frontend/GitHub par kabhi nahi.
4. Usage limit/alert set karo taaki bill surprise na ho.
5. Terms check karo: commercial use allowed hona chahiye (free personal tier ka use commercial product mein mat karo).

**Cost bachane ki trick (bahut zaroori):** hum "airport par sab flights" nahi mangte. User flight number + date deta hai, hum **us ek flight ko lookup** karte hain, aur result **cache** karte hain (Redis, key = `flight:{number}:{date}`). 50 users ek hi flight par = sirf 1 API call. Landing ke qareeb poll interval badhao (ETA update ke liye har 10-15 min), baaki time nahi.

Hamesha ek **adapter interface** rakho (`FlightProvider`), taaki Aviationstack -> AeroAPI -> Cirium badalna ek file ka kaam ho.

---

## 3. High-level architecture

```
 Mobile/Web (Next.js PWA)
        |  HTTPS + WebSocket
        v
   CDN / WAF (Cloudflare)
        |
   API Gateway / Load Balancer
        |
 +------+-----------------------------------+
 |  Backend (Node.js + TypeScript, NestJS)  |
 |  Modular monolith:                       |
 |   - auth        - flights (adapter)      |
 |   - trips/requests  - matching           |
 |   - groups/chat     - notifications      |
 |   - safety/reports  - payments (later)   |
 +--+---------+-----------+-----------------+
    |         |           |
 Postgres   Redis      Queue (BullMQ on Redis)
 (+PostGIS) cache,      workers: flight poller,
            pub/sub,    matcher, notifier
            rate-limit
                          |
              External: FlightAware, Maps/Places,
              SMS OTP (MSG91/Twilio), FCM push, Email
```

**Kyun modular monolith, microservices nahi:** shuru mein ek team/ek deploy = fast. Modules ke boundaries clean rakho; jab load aaye tab matching aur chat ko alag service bana do.

### Tech stack
- **Frontend:** Next.js + TypeScript + Tailwind, **PWA** (mobile par app jaisa, install ho sakta hai). Mobile-first design.
- **Backend:** NestJS (TypeScript). Frontend aur backend same language = kaam aasan.
- **DB:** PostgreSQL + PostGIS (location queries). Managed: Supabase / Neon / AWS RDS.
- **Cache/Queue/Realtime:** Redis (cache, BullMQ, pub/sub for WebSocket).
- **Auth:** Phone OTP (India mein primary), Google login optional. JWT + refresh token.
- **Maps:** Google Places/Maps (autocomplete, distance) ya Mapbox/Ola Maps (sasta).
- **Hosting:** Start = Vercel (frontend) + Railway/Render/Fly (backend). Scale = AWS/GCP containers (ECS/Cloud Run).
- **Monitoring:** Sentry + Grafana/Datadog + structured logs.

---

## 4. Core flow (user journey)

1. User site kholta hai -> phone OTP login.
2. Form: **Flight number, date, destination** (map autocomplete), seats chahiye, luggage, preferences (women-only, etc).
3. Backend flight lookup (cache first) -> airport, terminal, scheduled/estimated arrival nikalta hai.
4. Request `PENDING` banti hai. Matcher dusre requests se match dhoondta hai.
5. Match mile -> **suggested group** dikhta hai (kitne log, kitna fare split, kitna detour). Sab ko accept karna hota hai.
6. Sab accept -> group chat khulta hai, pickup point (terminal pillar number) fix.
7. Flight delay/early hone par ETA auto-update, group ko notification.
8. Ride ke baad rating + fare split settle (MVP: UPI mein aapas mein; baad mein in-app).

State machine: `PENDING -> MATCHED -> CONFIRMED -> IN_TRIP -> COMPLETED` (aur `CANCELLED`, `EXPIRED`).

---

## 5. Matching algorithm

Do requests tab compatible hain jab:
- **Same airport** (aur ideally same terminal).
- **Time**: `|ETA_a - ETA_b| <= ~40 min` (landing + baggage + exit buffer). Flight delay hone par re-evaluate.
- **Destination**: dono ke destinations ek hi route par, ya radius mein. Simple v1: **H3 hex cell (res 7-8) ya PostGIS `ST_DWithin` 3-5 km**. v2: route-detour check (A ke raste mein B ka drop kitna extra).
- **Group size** <= cab capacity (3 seats + luggage; SUV mein 5).
- **Preferences**: women-only, no-smoking etc. hard filters.

Score = weighted (time gap, destination distance, detour minutes). Greedy clustering, best group pehle. Matcher **worker** mein chalta hai (naye request par + har 2 min), request-time par heavy kaam nahi.

Candidates dhoondna fast hota hai kyunki index: `(airport_id, eta_window, status)`.

---

## 6. Database design (core tables)

```
users(id, phone, name, gender, verified_level, rating_avg, created_at)
airports(id, iata, name, city, lat, lng, tz)
flight_snapshots(id, flight_no, flight_date, airport_id, sched_arr, est_arr,
                 status, raw jsonb, fetched_at)           -- cache + history
ride_requests(id, user_id, flight_no, flight_date, airport_id, eta,
              dest_point geography, dest_h3, dest_label,
              seats, luggage, prefs jsonb, status, created_at, expires_at)
groups(id, airport_id, pickup_point, status, est_fare, created_at)
group_members(group_id, request_id, user_id, accepted_at, role)
messages(id, group_id, user_id, body, created_at)
reports(id, reporter_id, target_user_id, group_id, reason, created_at)
ratings(id, group_id, from_user, to_user, score, comment)
```

Indexes: `ride_requests(airport_id, eta, status)`, GIST on `dest_point`, `dest_h3`.
Unique: `(user_id, flight_no, flight_date)` taaki duplicate request na ho.

---

## 7. Database ko scalable kaise banayein (shuru se)

Is app ka data **time-boxed** hai: aaj ki requests aaj hi kaam ki, kal bekaar. Isse scaling aasan hai.

| Stage | Users | Kya karein |
|---|---|---|
| **0 - MVP** | < 10k | Ek managed Postgres, Redis cache, connection pooling (PgBouncer). |
| **1** | 10k - 500k | Read replica (history/analytics ke liye), `ride_requests`/`messages` ko **time par partition** (monthly), purana data archive (S3/cold table). Redis mein hot data. |
| **2** | 500k - 5M | Chat ko alag store (e.g. ScyllaDB/DynamoDB/Redis streams), matching alag service, event bus (Kafka/SQS). |
| **3** | 5M+ | **Shard by `airport_id` / region** (natural key: ek airport ka data dusre se kabhi mix nahi hota). Multi-region deploy. |

Principles jo day-1 se follow karo:
- UUID/ULID primary keys (sharding-friendly, auto-increment mat lo).
- Har table mein `airport_id` ho jahan relevant ho (future shard key).
- Ephemeral data par `expires_at` + cleanup job.
- Flight API calls ko cache karo (sabse bada cost + latency saver).
- Stateless backend (session JWT mein) taaki horizontally scale ho.
- Rate limiting (Redis) har endpoint par, OTP par special.

### App tier scaling
- Containers + autoscaling (CPU/requests par).
- WebSocket: Redis pub/sub adapter taaki multiple instances ke beech chat chale.
- Workers alag scale (flight poller, matcher, notifier).
- CDN se static + image.

---

## 8. Safety, privacy, legal (India)

- OTP verification mandatory; baad mein Aadhaar/DigiLocker ya selfie verify (badge).
- **Women-only / women-prefer** option.
- Exact destination address sirf confirmed group ko, pehle sirf area.
- Phone numbers masked; chat in-app.
- Report/block, emergency button, trip share link.
- **DPDP Act 2023** compliance: consent, data minimisation, delete-account, privacy policy.
- Terms: hum sirf matching platform hain, cab ke liye liability clarify karo (lawyer se check karwao).

---

## 9. Monetisation (baad mein)
- Per-successful-match chhoti fee, ya premium (priority match).
- Cab partners/affiliate (Uber/Ola/airport taxi deep link commission).
- Airline/airport/hotel partnerships.

---

## 10. Step-by-step build roadmap

**Phase 1 - UI (pehle ye karenge):** mobile-first screens: Landing, Login (OTP), Trip form, Searching/Matches, Group + chat, Profile, Safety. Mock data ke saath.
**Phase 2 - Backend core:** auth, DB schema, ride_requests API, flight adapter (Aviationstack/AeroAPI) + cache.
**Phase 3 - Matching:** worker, scoring, accept flow, notifications.
**Phase 4 - Realtime + safety:** chat, ETA updates, report/block, verification.
**Phase 5 - Pilot:** ek airport, real users, feedback, metrics (match rate, time-to-match, cost saved).
**Phase 6 - Scale:** neeche ke stages upar ke scaling table se.

Key metrics: match rate, time-to-match, avg savings per rider, repeat usage, safety incidents.

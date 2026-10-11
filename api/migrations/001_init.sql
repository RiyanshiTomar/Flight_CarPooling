-- FlyPool initial schema. Keep migrations append-only: add 002_*.sql, never edit this file.

CREATE TABLE airports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iata        text NOT NULL UNIQUE,
  name        text NOT NULL,
  city        text NOT NULL,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  tz          text NOT NULL DEFAULT 'Asia/Kolkata',
  active      boolean NOT NULL DEFAULT true
);

CREATE TABLE places (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  airport_id  uuid NOT NULL REFERENCES airports(id),
  label       text NOT NULL,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  est_solo_fare integer NOT NULL
);
CREATE INDEX places_airport_idx ON places (airport_id);

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           text NOT NULL UNIQUE,
  name            text,
  gender          text CHECK (gender IN ('female', 'male', 'other')),
  verified_level  smallint NOT NULL DEFAULT 1,   -- 1 phone, 2 ID, 3 ID + selfie
  rating_avg      numeric(3,2) NOT NULL DEFAULT 5.00,
  trips_count     integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE otp_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    smallint NOT NULL DEFAULT 0,
  used        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_phone_idx ON otp_codes (phone, created_at DESC);

-- Cache + history of flight lookups (one row per flight per day).
CREATE TABLE flight_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_no     text NOT NULL,
  flight_date   date NOT NULL,
  origin_iata   text,
  dest_iata     text NOT NULL,
  terminal      text,
  sched_arrival timestamptz NOT NULL,
  est_arrival   timestamptz NOT NULL,
  status        text NOT NULL,
  provider      text NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flight_no, flight_date)
);

CREATE TABLE ride_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  airport_id    uuid NOT NULL REFERENCES airports(id),   -- future shard key
  flight_no     text NOT NULL,
  flight_date   date NOT NULL,
  terminal      text,
  eta           timestamptz NOT NULL,
  dest_label    text NOT NULL,
  dest_lat      double precision NOT NULL,
  dest_lng      double precision NOT NULL,
  est_solo_fare integer NOT NULL,
  seats         smallint NOT NULL DEFAULT 1 CHECK (seats BETWEEN 1 AND 3),
  luggage       text NOT NULL DEFAULT 'cabin',
  women_only    boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING','MATCHED','CONFIRMED','IN_TRIP','COMPLETED','CANCELLED','EXPIRED')),
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ride_requests_match_idx ON ride_requests (airport_id, eta, status);
CREATE INDEX ride_requests_user_idx ON ride_requests (user_id, created_at DESC);
-- one active request per user per flight
CREATE UNIQUE INDEX ride_requests_one_active
  ON ride_requests (user_id, flight_no, flight_date)
  WHERE status NOT IN ('CANCELLED','EXPIRED','COMPLETED');

CREATE TABLE groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  airport_id    uuid NOT NULL REFERENCES airports(id),
  terminal      text,
  pickup_point  text NOT NULL,
  centroid_lat  double precision NOT NULL,
  centroid_lng  double precision NOT NULL,
  window_start  timestamptz NOT NULL,
  window_end    timestamptz NOT NULL,
  capacity      smallint NOT NULL DEFAULT 4,
  seats_taken   smallint NOT NULL DEFAULT 0,
  women_only    boolean NOT NULL DEFAULT false,
  est_solo_fare integer NOT NULL,
  status        text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CONFIRMED','IN_TRIP','COMPLETED','CANCELLED')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX groups_match_idx ON groups (airport_id, status, window_start);

CREATE TABLE group_members (
  group_id      uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  request_id    uuid NOT NULL REFERENCES ride_requests(id),
  user_id       uuid NOT NULL REFERENCES users(id),
  seats         smallint NOT NULL,
  confirmed_at  timestamptz,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, request_id)
);
CREATE INDEX group_members_user_idx ON group_members (user_id);

CREATE TABLE messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id),
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_group_idx ON messages (group_id, created_at);

CREATE TABLE reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid NOT NULL REFERENCES users(id),
  target_user_id  uuid NOT NULL REFERENCES users(id),
  group_id        uuid REFERENCES groups(id),
  reason          text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

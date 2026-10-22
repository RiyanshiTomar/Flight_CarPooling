-- v2: refresh tokens, trip lifecycle, ratings, safety (block, report, SOS, share links), system chat messages.
-- Append-only: never edit this file after it ships, add 004_*.sql instead.

-- ---------- users ----------
ALTER TABLE users ADD COLUMN rating_count integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN trusted_contact_name text;
ALTER TABLE users ADD COLUMN trusted_contact_phone text;
ALTER TABLE users ADD COLUMN deleted_at timestamptz;

-- ---------- auth: rotating refresh tokens (only a hash is stored) ----------
CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id    uuid NOT NULL,                 -- all rotations of one login share a family
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

-- ---------- trip lifecycle ----------
ALTER TABLE groups ADD COLUMN started_at timestamptz;
ALTER TABLE groups ADD COLUMN completed_at timestamptz;
ALTER TABLE groups ADD COLUMN final_per_person integer;
ALTER TABLE groups ADD COLUMN pickup_updated_at timestamptz;

-- system messages ("Meera joined", "6E 2041 delayed 15 min") have no author
ALTER TABLE messages ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE messages ADD COLUMN kind text NOT NULL DEFAULT 'user';

-- ---------- ratings ----------
CREATE TABLE ratings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_user   uuid NOT NULL REFERENCES users(id),
  to_user     uuid NOT NULL REFERENCES users(id),
  score       smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment     text CHECK (comment IS NULL OR char_length(comment) <= 300),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, from_user, to_user)
);
CREATE INDEX ratings_to_idx ON ratings (to_user);

-- ---------- safety ----------
CREATE TABLE blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);
CREATE INDEX blocks_blocked_idx ON blocks (blocked_id);

ALTER TABLE reports ADD COLUMN details text;
ALTER TABLE reports ADD COLUMN status text NOT NULL DEFAULT 'OPEN';

CREATE TABLE share_links (
  token       text PRIMARY KEY,
  group_id    uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX share_links_owner_idx ON share_links (user_id, group_id);

CREATE TABLE sos_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  group_id    uuid REFERENCES groups(id),
  lat         double precision,
  lng         double precision,
  contact_notified boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- jobs scan these
CREATE INDEX ride_requests_expiry_idx ON ride_requests (status, expires_at);
CREATE INDEX groups_status_idx ON groups (status, window_end);

-- background jobs: a row lease so only one API instance runs each job at a time
CREATE TABLE job_leases (
  name          text PRIMARY KEY,
  locked_until  timestamptz NOT NULL DEFAULT 'epoch',
  last_run_at   timestamptz
);
INSERT INTO job_leases (name) VALUES ('expire'), ('flights'), ('cleanup');

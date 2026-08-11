-- ChqIn initial schema. See docs/data-model.md for the reasoning.
--
-- Two domains, deliberately not joined by foreign keys except through
-- `checkins`: identity (global, small, read-mostly) and property (tenanted by
-- hotel, large, write-mostly). Keeping that boundary clean is what makes a
-- later service split a migration instead of a rewrite.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Postgres 18 has uuidv7() built in; on 17 and below this stands in.
-- Time-ordered UUIDs keep B-tree inserts append-only, unlike random v4.
CREATE OR REPLACE FUNCTION uuid_v7() RETURNS uuid AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(
          gen_random_bytes(16)
          PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
          FROM 1 FOR 6
        ),
        52, 1),
      53, 1),
    'hex')::uuid;
$$ LANGUAGE sql VOLATILE;

/* ------------------------------------------------------------------ */
/* Identity domain — global, belongs to the guest                      */
/* ------------------------------------------------------------------ */

CREATE TABLE guests (
  id            uuid PRIMARY KEY DEFAULT uuid_v7(),
  display_name  text NOT NULL,
  -- HMAC, not a bare hash: emails and phone numbers are guessable, so a plain
  -- digest is offline-attackable. Keyed with a server-side secret.
  email_hmac    bytea UNIQUE,
  phone_hmac    bytea UNIQUE,
  email_enc     bytea,
  phone_enc     bytea,
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'suspended', 'erased')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per passkey. This table is the login system.
CREATE TABLE credentials (
  id               uuid PRIMARY KEY DEFAULT uuid_v7(),
  guest_id         uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  credential_id    text NOT NULL,   -- base64url, as the browser reports it
  public_key       bytea NOT NULL,  -- COSE key
  alg              int NOT NULL,    -- -7 ES256, -257 RS256
  sign_count       bigint NOT NULL DEFAULT 0,
  aaguid           uuid,
  transports       text[],
  backup_eligible  boolean NOT NULL DEFAULT false,
  backed_up        boolean NOT NULL DEFAULT false,
  device_label     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_used_at     timestamptz,
  revoked_at       timestamptz
);

-- THE hot path: a discoverable-credential login arrives carrying only this.
CREATE UNIQUE INDEX credentials_credential_id_key ON credentials (credential_id);
CREATE INDEX credentials_guest_active ON credentials (guest_id) WHERE revoked_at IS NULL;

-- KYC events, never the document itself.
CREATE TABLE identity_verifications (
  id             uuid PRIMARY KEY DEFAULT uuid_v7(),
  guest_id       uuid REFERENCES guests(id) ON DELETE CASCADE,
  session_id     uuid,  -- intentionally unconstrained: survives session expiry
  method         text NOT NULL CHECK (method IN ('document', 'manual_desk', 'simulated')),
  provider       text,
  provider_ref   text,
  document_type  text,
  document_hmac  bytea,
  document_last4 text,
  artifact_uri   text,
  result         text NOT NULL CHECK (result IN ('passed', 'failed', 'manual_review')),
  verified_at    timestamptz,
  expires_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX identity_verifications_guest ON identity_verifications (guest_id, created_at DESC);

/* ------------------------------------------------------------------ */
/* Property domain — tenanted by hotel                                 */
/* ------------------------------------------------------------------ */

CREATE TABLE hotels (
  id          uuid PRIMARY KEY DEFAULT uuid_v7(),
  chain_id    uuid,
  name        text NOT NULL,
  location    text,
  timezone    text NOT NULL DEFAULT 'UTC',  -- check-in cutoffs are local time
  address     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
  id         uuid PRIMARY KEY DEFAULT uuid_v7(),
  hotel_id   uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  number     text NOT NULL,
  room_type  text,
  UNIQUE (hotel_id, number)
);

CREATE TABLE bookings (
  id              uuid PRIMARY KEY DEFAULT uuid_v7(),
  hotel_id        uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  booking_ref     text NOT NULL,
  pms_ref         text,
  guest_name      text NOT NULL,               -- as booked; not an identity
  guest_id        uuid REFERENCES guests(id),  -- linked at first check-in
  room_id         uuid REFERENCES rooms(id),
  arrival_date    date NOT NULL,
  departure_date  date NOT NULL,
  status          text NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed', 'checked_in', 'checked_out', 'cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, booking_ref)
);

CREATE INDEX bookings_arrivals ON bookings (hotel_id, arrival_date) WHERE status = 'confirmed';
CREATE INDEX bookings_guest ON bookings (guest_id) WHERE guest_id IS NOT NULL;

-- What a QR resolves to. A printed desk card is a 'desk' row that mints
-- short-lived children on scan — so the printed code identifies the property,
-- not one check-in.
CREATE TABLE checkin_sessions (
  id          uuid PRIMARY KEY DEFAULT uuid_v7(),
  hotel_id    uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  booking_id  uuid REFERENCES bookings(id),
  parent_id   uuid REFERENCES checkin_sessions(id),
  token_hash  bytea NOT NULL,  -- hashed, so a DB leak isn't a ring of keys
  kind        text NOT NULL CHECK (kind IN ('desk', 'booking', 'kiosk')),
  status      text NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'consumed', 'expired', 'revoked')),
  guest_id    uuid REFERENCES guests(id),  -- filled once the ceremony resolves one
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX checkin_sessions_token ON checkin_sessions (token_hash);
CREATE INDEX checkin_sessions_open ON checkin_sessions (hotel_id, expires_at) WHERE status = 'open';

/* ------------------------------------------------------------------ */
/* The join, and the log                                               */
/* ------------------------------------------------------------------ */

CREATE TABLE checkins (
  id               uuid PRIMARY KEY DEFAULT uuid_v7(),
  hotel_id         uuid NOT NULL REFERENCES hotels(id),
  booking_id       uuid NOT NULL REFERENCES bookings(id),
  -- Nullable so erasure can tombstone the guest without deleting a stay
  -- record that has a statutory retention period.
  guest_id         uuid REFERENCES guests(id) ON DELETE SET NULL,
  session_id       uuid REFERENCES checkin_sessions(id),
  credential_id    uuid REFERENCES credentials(id) ON DELETE SET NULL,
  journey          text NOT NULL
                   CHECK (journey IN ('returning', 'newDevice', 'firstTime', 'desk')),
  room_id          uuid REFERENCES rooms(id),
  idempotency_key  text,
  checked_in_at    timestamptz NOT NULL DEFAULT now()
);

-- A double-tapped button must not produce two check-ins.
CREATE UNIQUE INDEX checkins_idempotency ON checkins (booking_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX checkins_hotel_day ON checkins (hotel_id, checked_in_at DESC);

-- Append-only, no foreign keys on purpose: it must still record an attempt
-- against a credential that was just deleted, and never block on another
-- table's lock.
CREATE TABLE auth_events (
  id             uuid NOT NULL DEFAULT uuid_v7(),
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  guest_id       uuid,
  credential_id  text,
  hotel_id       uuid,
  session_id     uuid,
  event          text NOT NULL,
  outcome        text NOT NULL CHECK (outcome IN ('ok', 'failed')),
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip             inet,
  user_agent     text,
  PRIMARY KEY (occurred_at, id)
) PARTITION BY RANGE (occurred_at);

-- Partitions are cheap to add and the only thing that keeps this table
-- prunable. A production deploy creates the next month ahead of time.
CREATE TABLE auth_events_2026_08 PARTITION OF auth_events
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE auth_events_2026_09 PARTITION OF auth_events
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE auth_events_default PARTITION OF auth_events DEFAULT;

CREATE INDEX auth_events_guest ON auth_events (guest_id, occurred_at DESC);

/* ------------------------------------------------------------------ */
/* Challenges — Postgres for now, Redis when write volume justifies it */
/* ------------------------------------------------------------------ */

CREATE TABLE webauthn_challenges (
  id          uuid PRIMARY KEY DEFAULT uuid_v7(),
  session_id  uuid REFERENCES checkin_sessions(id) ON DELETE CASCADE,
  guest_id    uuid REFERENCES guests(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('registration', 'authentication')),
  challenge   text NOT NULL,
  consumed_at timestamptz,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX webauthn_challenges_expiry ON webauthn_challenges (expires_at)
  WHERE consumed_at IS NULL;

COMMIT;

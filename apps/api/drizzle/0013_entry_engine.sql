-- The entry engine replaces the hotel-only tables.
--
-- checkin_sessions, checkins and bookings are dropped, and their jobs move to
-- gates, entry_sessions, entries and entitlements; rooms become hotel_rooms.
-- This destroys the rows in the old tables on purpose: nothing was live, and a
-- backfill would only have carried test data across. Hand-written, like
-- 0010-0012, because drizzle-kit's snapshot stops at 0002.

DROP TABLE IF EXISTS "checkins" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "checkin_sessions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "booking_rooms" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "bookings" CASCADE;--> statement-breakpoint
ALTER TABLE "rooms" RENAME TO "hotel_rooms";--> statement-breakpoint
ALTER INDEX IF EXISTS "rooms_venue_number_key" RENAME TO "hotel_rooms_venue_number_key";--> statement-breakpoint
ALTER INDEX IF EXISTS "rooms_pkey" RENAME TO "hotel_rooms_pkey";--> statement-breakpoint
ALTER TABLE "hotel_rooms" RENAME CONSTRAINT "rooms_venue_id_venues_id_fk" TO "hotel_rooms_venue_id_venues_id_fk";--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "flow_definitions" (
  "id"           uuid PRIMARY KEY NOT NULL,
  "key"          text NOT NULL,
  "version"      integer NOT NULL,
  "steps"        jsonb NOT NULL,
  "published_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "flow_definitions_key_version" ON "flow_definitions" ("key","version");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "gates" (
  "id"         uuid PRIMARY KEY NOT NULL,
  "venue_id"   uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "name"       text NOT NULL,
  "kind"       text NOT NULL DEFAULT 'qr',
  "flow_id"    uuid NOT NULL REFERENCES "flow_definitions"("id"),
  "token"      text,
  "token_hash" bytea NOT NULL,
  "config"     jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status"     text NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gates_kind" CHECK ("kind" IN ('qr','desk','turnstile','kiosk')),
  CONSTRAINT "gates_status" CHECK ("status" IN ('active','revoked'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gates_token" ON "gates" ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gates_venue" ON "gates" ("venue_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "entitlements" (
  "id"         uuid PRIMARY KEY NOT NULL,
  "venue_id"   uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "kind"       text NOT NULL,
  "guest_id"   uuid REFERENCES "guests"("id"),
  "ref"        text,
  "status"     text NOT NULL DEFAULT 'active',
  "valid_from" timestamp with time zone,
  "valid_to"   timestamp with time zone,
  "data"       jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "entitlements_kind" CHECK ("kind" IN ('booking','ticket','slot','permit','membership','event')),
  CONSTRAINT "entitlements_status" CHECK ("status" IN ('active','used','cancelled','expired'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entitlements_venue_kind_ref" ON "entitlements" ("venue_id","kind","ref") WHERE ref IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entitlements_guest" ON "entitlements" ("guest_id") WHERE guest_id IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "hotel_bookings" (
  "entitlement_id" uuid PRIMARY KEY NOT NULL REFERENCES "entitlements"("id") ON DELETE CASCADE,
  "pms_ref"        text,
  "guest_name"     text NOT NULL,
  "arrival_date"   date NOT NULL,
  "departure_date" date NOT NULL,
  "party_size"     integer,
  "rooms_count"    integer,
  "status"         text NOT NULL DEFAULT 'confirmed',
  CONSTRAINT "hotel_bookings_status" CHECK ("status" IN ('confirmed','checked_in','checked_out','cancelled'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hotel_bookings_arrivals" ON "hotel_bookings" ("arrival_date") WHERE status = 'confirmed';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "hotel_booking_rooms" (
  "booking_id" uuid NOT NULL REFERENCES "hotel_bookings"("entitlement_id") ON DELETE CASCADE,
  "room_id"    uuid NOT NULL REFERENCES "hotel_rooms"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hotel_booking_rooms_key" ON "hotel_booking_rooms" ("booking_id","room_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hotel_booking_rooms_room" ON "hotel_booking_rooms" ("room_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "entry_sessions" (
  "id"             uuid PRIMARY KEY NOT NULL,
  "venue_id"       uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "gate_id"        uuid NOT NULL REFERENCES "gates"("id"),
  "flow_id"        uuid NOT NULL REFERENCES "flow_definitions"("id"),
  "token_hash"     bytea NOT NULL,
  "status"         text NOT NULL DEFAULT 'in_progress',
  "cursor"         integer NOT NULL DEFAULT 0,
  "version"        integer NOT NULL DEFAULT 0,
  "state"          jsonb NOT NULL DEFAULT '{}'::jsonb,
  "trail"          jsonb NOT NULL DEFAULT '[]'::jsonb,
  "guest_id"       uuid REFERENCES "guests"("id"),
  "entitlement_id" uuid REFERENCES "entitlements"("id"),
  "expires_at"     timestamp with time zone NOT NULL,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "entry_sessions_status" CHECK ("status" IN ('in_progress','waiting','done','rejected','expired','revoked'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entry_sessions_token" ON "entry_sessions" ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entry_sessions_waiting" ON "entry_sessions" ("venue_id","updated_at") WHERE status = 'waiting';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "entries" (
  "id"              uuid PRIMARY KEY NOT NULL,
  "venue_id"        uuid NOT NULL REFERENCES "venues"("id"),
  "gate_id"         uuid NOT NULL REFERENCES "gates"("id"),
  "entitlement_id"  uuid REFERENCES "entitlements"("id"),
  "guest_id"        uuid REFERENCES "guests"("id") ON DELETE SET NULL,
  "session_id"      uuid REFERENCES "entry_sessions"("id"),
  "credential_id"   uuid REFERENCES "credentials"("id") ON DELETE SET NULL,
  "outcome"         text NOT NULL DEFAULT 'admitted',
  "idempotency_key" text,
  "data"            jsonb NOT NULL DEFAULT '{}'::jsonb,
  "entered_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "entries_outcome" CHECK ("outcome" IN ('admitted','denied'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entries_idempotency" ON "entries" ("idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entries_venue_day" ON "entries" ("venue_id","entered_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "hotel_entry_details" (
  "entry_id"    uuid PRIMARY KEY NOT NULL REFERENCES "entries"("id") ON DELETE CASCADE,
  "room_id"     uuid REFERENCES "hotel_rooms"("id"),
  "journey"     text NOT NULL,
  "nights"      integer,
  "party_size"  integer,
  "rooms_count" integer,
  CONSTRAINT "hotel_entry_details_journey" CHECK ("journey" IN ('returning','newDevice','firstTime','desk'))
);--> statement-breakpoint

-- Venue kinds beyond the hotel, and how long a venue keeps entry history (an
-- open venue may want far less than a hotel's statutory period; null = default).
ALTER TABLE "venues" DROP CONSTRAINT IF EXISTS "venues_kind";--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_kind"
  CHECK ("kind" IN ('hotel','apartment','temple','station','office','monument','park','museum','event','other'));--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "retention_days" integer;--> statement-breakpoint

-- Someone who answers "may this visitor come in?" without running the desk.
ALTER TABLE "staff_memberships" DROP CONSTRAINT IF EXISTS "staff_memberships_role";--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_role"
  CHECK ("role" IN ('owner','manager','frontdesk','approver'));--> statement-breakpoint

-- Challenges pointed at the dropped session table; any still pending belonged
-- to sessions that no longer exist.
DELETE FROM "webauthn_challenges";--> statement-breakpoint
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_session_id_entry_sessions_id_fk"
  FOREIGN KEY ("session_id") REFERENCES "entry_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint

-- The hotel flow: know who they are, find their booking (a walk-in has none,
-- which a hotel allows), let them in.
INSERT INTO "flow_definitions" ("id","key","version","steps")
VALUES (
  gen_random_uuid(), 'hotel', 1,
  '[{"type":"identify"},{"type":"match_booking","optional":true},{"type":"admit"}]'::jsonb
)
ON CONFLICT ("key","version") DO NOTHING;

-- The visitor flow: a person arrives at an office or building, says why, and
-- either a host approves them or they join an event.
--
-- visit_ tables belong to any venue that hosts visitors (The Nest first);
-- event_ tables to any venue that runs events. `outbox` is for every kind of
-- gate: a notification is written in the same transaction as the thing that
-- caused it and sent later, so a slow provider never holds a guest.
-- Hand-written, like 0010-0013.

CREATE TABLE IF NOT EXISTS "visit_hosts" (
  "id"         uuid PRIMARY KEY NOT NULL,
  "venue_id"   uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "name"       text NOT NULL,
  "phone"      text,
  "active"     boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visit_hosts_venue" ON "visit_hosts" ("venue_id") WHERE active;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "event_events" (
  "id"           uuid PRIMARY KEY NOT NULL,
  "venue_id"     uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "name"         text NOT NULL,
  "organizer_id" uuid REFERENCES "visit_hosts"("id") ON DELETE SET NULL,
  "active"       boolean NOT NULL DEFAULT true,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_events_venue" ON "event_events" ("venue_id") WHERE active;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "visit_entry_details" (
  "entry_id" uuid PRIMARY KEY NOT NULL REFERENCES "entries"("id") ON DELETE CASCADE,
  "purpose"  text NOT NULL,
  "host_id"  uuid REFERENCES "visit_hosts"("id") ON DELETE SET NULL,
  CONSTRAINT "visit_entry_details_purpose" CHECK ("purpose" IN ('meeting','office'))
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "event_entry_details" (
  "entry_id"    uuid PRIMARY KEY NOT NULL REFERENCES "entries"("id") ON DELETE CASCADE,
  "event_id"    uuid REFERENCES "event_events"("id") ON DELETE SET NULL,
  "company"     text NOT NULL,
  "designation" text NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_entry_details_event" ON "event_entry_details" ("event_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "outbox" (
  "id"         uuid PRIMARY KEY NOT NULL,
  "venue_id"   uuid REFERENCES "venues"("id") ON DELETE CASCADE,
  "kind"       text NOT NULL,
  "payload"    jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status"     text NOT NULL DEFAULT 'pending',
  "attempts"   integer NOT NULL DEFAULT 0,
  "last_error" text,
  "run_after"  timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "sent_at"    timestamp with time zone,
  CONSTRAINT "outbox_status" CHECK ("status" IN ('pending','sent','failed'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_pending" ON "outbox" ("run_after") WHERE status = 'pending';--> statement-breakpoint

-- purpose and host first, then who approves, or the event questions. Meeting
-- and office work wait for a host; an event goes straight in and the organiser
-- is told afterwards.
INSERT INTO "flow_definitions" ("id","key","version","steps")
VALUES (
  gen_random_uuid(), 'visitor.host_approval', 1,
  '[
    {"type":"identify"},
    {"type":"collect_details","fields":[{"key":"purpose","label":"Purpose of visit","kind":"choice","options":[{"value":"meeting","label":"Meeting"},{"value":"office","label":"Office work"},{"value":"event","label":"Attending an event"}]}]},
    {"type":"collect_details","when":{"purpose":["meeting","office"]},"fields":[{"key":"host","label":"Person or team to meet","kind":"choice","source":"hosts"}]},
    {"type":"staff_approves","when":{"purpose":["meeting","office"]}},
    {"type":"collect_details","when":{"purpose":"event"},"fields":[{"key":"event","label":"Event","kind":"choice","source":"events"},{"key":"company","label":"Company","kind":"text"},{"key":"designation","label":"Designation","kind":"text"}]},
    {"type":"admit"}
  ]'::jsonb
)
ON CONFLICT ("key","version") DO NOTHING;

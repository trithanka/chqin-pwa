-- What ChqIn Admin needs from the platform tables. Hand-written, like 0010-0016.
--
-- 1. A venue can be suspended (gates refuse scans, staff cannot sign in) or
--    closed (the tombstone left when a venue with history is "deleted").
-- 2. An outbox message can be cancelled by an admin rather than deleted, so
--    the row still says it existed.
-- 3. Indexes for the cross-venue screens. Lists page by id (UUIDv7, so id
--    order is creation order), so each filter gets an (filter, id) index.

ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "status_reason" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "venues" DROP CONSTRAINT IF EXISTS "venues_status";--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_status" CHECK ("status" IN ('active','suspended','closed'));--> statement-breakpoint

ALTER TABLE "outbox" DROP CONSTRAINT IF EXISTS "outbox_status";--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_status" CHECK ("status" IN ('pending','sent','failed','cancelled'));--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "entries_venue_id" ON "entries" ("venue_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entries_gate_id" ON "entries" ("gate_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entries_guest_id" ON "entries" ("guest_id","id") WHERE guest_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entries_entered_at" ON "entries" ("entered_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entry_sessions_venue_id" ON "entry_sessions" ("venue_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entry_sessions_status_updated" ON "entry_sessions" ("status","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entry_sessions_guest" ON "entry_sessions" ("guest_id") WHERE guest_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entry_sessions_flow" ON "entry_sessions" ("flow_id") WHERE status IN ('in_progress','waiting');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_events_venue_id" ON "auth_events" ("venue_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_events_event_id" ON "auth_events" ("event","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_status_id" ON "outbox" ("status","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_venue_id" ON "outbox" ("venue_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gates_flow" ON "gates" ("flow_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_memberships_venue" ON "staff_memberships" ("venue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guests_name_prefix" ON "guests" (lower("display_name") text_pattern_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "identity_verifications_session" ON "identity_verifications" ("session_id");

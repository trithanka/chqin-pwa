-- What the guest said on the way in, and what the desk gave them.
--
-- Hand-written rather than generated: drizzle-kit's snapshot for this project
-- predates the hotels -> venues rename, so `generate` proposes recreating that
-- history and dropping live columns. Only the statements below are wanted.

-- The guest's own statement of their stay, taken during check-in. Nullable
-- because every check-in before this migration was made without asking.
ALTER TABLE "checkins" ADD COLUMN IF NOT EXISTS "nights" integer;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN IF NOT EXISTS "party_size" integer;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN IF NOT EXISTS "rooms_count" integer;--> statement-breakpoint

-- What the booking was asked for, as against what it holds.
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "party_size" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "rooms_count" integer;--> statement-breakpoint

-- The rooms a booking actually holds. A party can take two, so this cannot be
-- a column on the booking.
CREATE TABLE IF NOT EXISTS "booking_rooms" (
	"booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
	"room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "booking_rooms_key" ON "booking_rooms" ("booking_id","room_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_rooms_room" ON "booking_rooms" ("room_id");--> statement-breakpoint

-- Assignments made before this table existed keep their room.
INSERT INTO "booking_rooms" ("booking_id","room_id")
SELECT "id","room_id" FROM "bookings" WHERE "room_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- bookings.room_id is now a second answer to a question booking_rooms owns.
ALTER TABLE "bookings" DROP COLUMN IF EXISTS "room_id";

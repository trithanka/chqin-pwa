-- A check-in no longer requires a reservation.
--
-- The record that matters is "this identified person arrived at this venue";
-- which room they were given is a property-management detail that may not
-- exist yet — and at a venue without rooms at all (an apartment lobby, a
-- temple) it never will.
--
-- Idempotency moves with it: the old unique index was (booking_id,
-- idempotency_key), and NULLs are distinct in Postgres, so a walk-in retry
-- would have created a second check-in. The client's key is a random UUID per
-- session, so it stands alone.

BEGIN;

ALTER TABLE "checkins" ALTER COLUMN "booking_id" DROP NOT NULL;

DROP INDEX IF EXISTS "checkins_idempotency";
CREATE UNIQUE INDEX "checkins_idempotency" ON "checkins" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

COMMIT;

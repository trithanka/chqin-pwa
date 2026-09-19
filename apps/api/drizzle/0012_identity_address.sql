-- The registered address and care-of from the Aadhaar check.
--
-- Hand-written, like 0010 and 0011: drizzle-kit's snapshot stops at 0002 and
-- predates the hotels -> venues rename, so `generate` proposes recreating the
-- schema.
--
-- These were previously read from the provider response and dropped. A hotel
-- register asks for a guest's address by law, and Form C needs it for foreign
-- nationals, so the dashboard now shows both — which is the reader they were
-- missing before.
ALTER TABLE "identity_verifications" ADD COLUMN IF NOT EXISTS "subject_address" jsonb;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD COLUMN IF NOT EXISTS "subject_care_of" text;--> statement-breakpoint

-- Rows verified before this migration keep NULL: UIDAI returned the address at
-- the time, but it was never stored and cannot be recovered without asking the
-- guest to verify again.

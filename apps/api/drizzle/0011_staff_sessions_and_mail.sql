-- Revocable staff sessions, and the single-use links a staff account needs an
-- email address for.
--
-- Hand-written for the same reason as 0010: drizzle-kit's snapshot stops at
-- 0002 and predates the hotels -> venues rename, so `generate` proposes
-- recreating the whole schema. Only the statements below are wanted.

-- One row per signed-in browser. This replaces a self-contained signed cookie,
-- which had no server-side record and therefore no way to revoke: logout
-- cleared only the browser's copy and a stolen cookie stayed valid for its
-- full twelve hours.
--
-- The token itself is never stored, only its SHA-256 digest, so a leaked
-- backup yields no usable cookies.
CREATE TABLE IF NOT EXISTS "staff_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_id" uuid NOT NULL REFERENCES "staff_users"("id") ON DELETE CASCADE,
	"venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
	"role" text NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"created_at" timestamptz NOT NULL DEFAULT now(),
	"last_seen_at" timestamptz,
	"expires_at" timestamptz NOT NULL,
	"revoked_at" timestamptz
);--> statement-breakpoint

-- The hot path: every authenticated request is this lookup.
CREATE UNIQUE INDEX IF NOT EXISTS "staff_sessions_token" ON "staff_sessions" ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_sessions_staff" ON "staff_sessions" ("staff_id");--> statement-breakpoint

-- Password reset and address verification. One table because the shape is
-- identical — a hashed token, an expiry, a used-at stamp — and `purpose` is
-- the only thing that differs.
CREATE TABLE IF NOT EXISTS "staff_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_id" uuid NOT NULL REFERENCES "staff_users"("id") ON DELETE CASCADE,
	"purpose" text NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"created_at" timestamptz NOT NULL DEFAULT now(),
	"expires_at" timestamptz NOT NULL,
	"used_at" timestamptz,
	CONSTRAINT "staff_tokens_purpose" CHECK ("purpose" IN ('password_reset','email_verify'))
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "staff_tokens_token" ON "staff_tokens" ("token_hash");--> statement-breakpoint
-- Answers both "is there a live link already" (the resend throttle) and
-- "invalidate the others" from one index.
CREATE INDEX IF NOT EXISTS "staff_tokens_staff" ON "staff_tokens" ("staff_id","purpose");--> statement-breakpoint

-- Recorded, not enforced: an unverified owner runs their property exactly as
-- before. This exists so that gating something on a real address later is a
-- decision rather than a migration with no data behind it.
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamptz;--> statement-breakpoint

-- Accounts created before this migration have `email_hmac` and nothing else:
-- the system can recognise them at login but has nowhere to send a reset link.
-- Nothing can backfill that — the address was never stored in a readable form
-- — so those owners need their address set again before reset works for them.
-- New registrations write `email_enc` from here on.

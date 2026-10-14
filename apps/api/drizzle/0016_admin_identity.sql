-- ChqIn Admin: the team that runs the platform. Its own users, sessions and
-- links, kept apart from staff_* on purpose, and an append-only audit log with
-- no foreign keys (same reasoning as auth_events). Hand-written, like 0010-0015.

CREATE TABLE IF NOT EXISTS "admin_users" (
  "id"               uuid PRIMARY KEY NOT NULL,
  "email_hmac"       bytea NOT NULL,
  "email_enc"        bytea,
  "display_name"     text NOT NULL,
  "password_hash"    text,
  "role"             text NOT NULL,
  "status"           text NOT NULL DEFAULT 'invited',
  "totp_secret_enc"  bytea,
  "totp_last_step"   bigint,
  "totp_enabled_at"  timestamp with time zone,
  "failed_attempts"  integer NOT NULL DEFAULT 0,
  "locked_until"     timestamp with time zone,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "last_login_at"    timestamp with time zone,
  CONSTRAINT "admin_users_role" CHECK ("role" IN ('owner','support','read_only')),
  CONSTRAINT "admin_users_status" CHECK ("status" IN ('invited','active','disabled'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_users_email" ON "admin_users" ("email_hmac");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "admin_sessions" (
  "id"           uuid PRIMARY KEY NOT NULL,
  "admin_id"     uuid NOT NULL REFERENCES "admin_users"("id") ON DELETE CASCADE,
  "role"         text NOT NULL,
  "token_hash"   bytea NOT NULL,
  "mfa_at"       timestamp with time zone,
  "ip"           inet,
  "user_agent"   text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "last_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"   timestamp with time zone NOT NULL,
  "revoked_at"   timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_sessions_token" ON "admin_sessions" ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_sessions_admin" ON "admin_sessions" ("admin_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "admin_tokens" (
  "id"         uuid PRIMARY KEY NOT NULL,
  "admin_id"   uuid NOT NULL REFERENCES "admin_users"("id") ON DELETE CASCADE,
  "purpose"    text NOT NULL,
  "token_hash" bytea NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL,
  "used_at"    timestamp with time zone,
  CONSTRAINT "admin_tokens_purpose" CHECK ("purpose" IN ('invite','totp_reset'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_tokens_token" ON "admin_tokens" ("token_hash");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "admin_audit_log" (
  "id"          uuid PRIMARY KEY NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now(),
  "admin_id"    uuid,
  "admin_name"  text,
  "role"        text,
  "action"      text NOT NULL,
  "target_type" text,
  "target_id"   text,
  "venue_id"    uuid,
  "reason"      text,
  "changes"     jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ip"          inet,
  "user_agent"  text
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_log_time" ON "admin_audit_log" ("occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_log_target" ON "admin_audit_log" ("target_type","target_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_log_admin" ON "admin_audit_log" ("admin_id","occurred_at");

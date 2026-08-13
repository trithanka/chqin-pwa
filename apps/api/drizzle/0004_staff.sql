-- Staff accounts and their venue memberships.
--
-- Hand-written because drizzle-kit generate needs an interactive TTY here;
-- `drizzle-kit push` reporting no drift afterwards is what proves this matches
-- the schema files. Constraint names follow drizzle's own convention so it
-- recognises them rather than proposing to recreate them.

BEGIN;

CREATE TABLE "staff_users" (
  "id"            uuid PRIMARY KEY NOT NULL,
  "email_hmac"    bytea NOT NULL,
  "email_enc"     bytea,
  "display_name"  text NOT NULL,
  "password_hash" text NOT NULL,
  "status"        text DEFAULT 'active' NOT NULL,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  "last_login_at" timestamp with time zone,
  CONSTRAINT "staff_users_status" CHECK ("staff_users"."status" IN ('active','suspended'))
);

CREATE TABLE "staff_memberships" (
  "id"         uuid PRIMARY KEY NOT NULL,
  "staff_id"   uuid NOT NULL,
  "venue_id"   uuid NOT NULL,
  "role"       text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "staff_memberships_role" CHECK ("staff_memberships"."role" IN ('owner','manager','frontdesk'))
);

ALTER TABLE "staff_memberships"
  ADD CONSTRAINT "staff_memberships_staff_id_staff_users_id_fk"
  FOREIGN KEY ("staff_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "staff_memberships"
  ADD CONSTRAINT "staff_memberships_venue_id_venues_id_fk"
  FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "staff_users_email" ON "staff_users" USING btree ("email_hmac");
CREATE UNIQUE INDEX "staff_memberships_unique" ON "staff_memberships" USING btree ("staff_id","venue_id");

COMMIT;

CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guest_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" "bytea" NOT NULL,
	"alg" integer NOT NULL,
	"sign_count" bigint DEFAULT 0 NOT NULL,
	"aaguid" uuid,
	"transports" text[],
	"backup_eligible" boolean DEFAULT false NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"device_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"email_hmac" "bytea",
	"phone_hmac" "bytea",
	"email_enc" "bytea",
	"phone_enc" "bytea",
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guests_email_hmac_unique" UNIQUE("email_hmac"),
	CONSTRAINT "guests_phone_hmac_unique" UNIQUE("phone_hmac")
);
--> statement-breakpoint
CREATE TABLE "identity_verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guest_id" uuid,
	"session_id" uuid,
	"method" text NOT NULL,
	"provider" text,
	"provider_ref" text,
	"document_type" text,
	"document_hmac" "bytea",
	"document_last4" text,
	"artifact_uri" text,
	"result" text NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hotel_id" uuid NOT NULL,
	"booking_ref" text NOT NULL,
	"pms_ref" text,
	"guest_name" text NOT NULL,
	"guest_id" uuid,
	"room_id" uuid,
	"arrival_date" date NOT NULL,
	"departure_date" date NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkin_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hotel_id" uuid NOT NULL,
	"booking_id" uuid,
	"parent_id" uuid,
	"token_hash" "bytea" NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"journey" text,
	"guest_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chain_id" uuid,
	"name" text NOT NULL,
	"location" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hotel_id" uuid NOT NULL,
	"number" text NOT NULL,
	"room_type" text
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hotel_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"guest_id" uuid,
	"session_id" uuid,
	"credential_id" uuid,
	"journey" text NOT NULL,
	"room_id" uuid,
	"idempotency_key" text,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"guest_id" uuid,
	"credential_id" text,
	"hotel_id" uuid,
	"session_id" uuid,
	"event" text NOT NULL,
	"outcome" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" "inet",
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "webauthn_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid,
	"guest_id" uuid,
	"pending_user_handle" uuid,
	"pending_display_name" text,
	"purpose" text NOT NULL,
	"challenge" text NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_sessions" ADD CONSTRAINT "checkin_sessions_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_sessions" ADD CONSTRAINT "checkin_sessions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_sessions" ADD CONSTRAINT "checkin_sessions_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_session_id_checkin_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."checkin_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_credential_id_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_session_id_checkin_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."checkin_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_credential_id_key" ON "credentials" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "credentials_guest_active" ON "credentials" USING btree ("guest_id") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "identity_verifications_guest" ON "identity_verifications" USING btree ("guest_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_hotel_ref_key" ON "bookings" USING btree ("hotel_id","booking_ref");--> statement-breakpoint
CREATE INDEX "bookings_arrivals" ON "bookings" USING btree ("hotel_id","arrival_date") WHERE status = 'confirmed';--> statement-breakpoint
CREATE INDEX "bookings_guest" ON "bookings" USING btree ("guest_id") WHERE guest_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_sessions_token" ON "checkin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "checkin_sessions_open" ON "checkin_sessions" USING btree ("hotel_id","expires_at") WHERE status = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_hotel_number_key" ON "rooms" USING btree ("hotel_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "checkins_idempotency" ON "checkins" USING btree ("booking_id","idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "checkins_hotel_day" ON "checkins" USING btree ("hotel_id","checked_in_at");--> statement-breakpoint
CREATE INDEX "auth_events_guest" ON "auth_events" USING btree ("guest_id","occurred_at");--> statement-breakpoint
CREATE INDEX "webauthn_challenges_expiry" ON "webauthn_challenges" USING btree ("expires_at") WHERE consumed_at IS NULL;
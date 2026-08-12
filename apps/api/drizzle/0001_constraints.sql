ALTER TABLE "checkin_sessions" ADD CONSTRAINT "checkin_sessions_parent_id_checkin_sessions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."checkin_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_status" CHECK ("guests"."status" IN ('active','suspended','erased'));--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_method" CHECK ("identity_verifications"."method" IN ('document','manual_desk','simulated'));--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_result" CHECK ("identity_verifications"."result" IN ('passed','failed','manual_review'));--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_status" CHECK ("bookings"."status" IN ('confirmed','checked_in','checked_out','cancelled'));--> statement-breakpoint
ALTER TABLE "checkin_sessions" ADD CONSTRAINT "checkin_sessions_kind" CHECK ("checkin_sessions"."kind" IN ('desk','booking','kiosk'));--> statement-breakpoint
ALTER TABLE "checkin_sessions" ADD CONSTRAINT "checkin_sessions_status" CHECK ("checkin_sessions"."status" IN ('open','consumed','expired','revoked'));--> statement-breakpoint
ALTER TABLE "checkin_sessions" ADD CONSTRAINT "checkin_sessions_journey" CHECK ("checkin_sessions"."journey" IS NULL OR "checkin_sessions"."journey" IN ('returning','newDevice','firstTime','desk'));--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_journey" CHECK ("checkins"."journey" IN ('returning','newDevice','firstTime','desk'));--> statement-breakpoint
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_outcome" CHECK ("auth_events"."outcome" IN ('ok','failed'));--> statement-breakpoint
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_purpose" CHECK ("webauthn_challenges"."purpose" IN ('registration','authentication'));
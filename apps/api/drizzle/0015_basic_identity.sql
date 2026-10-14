-- A venue can choose how it identifies visitors. `basic` is a name and a mobile
-- number the visitor typed: no Aadhaar call, and nothing claims it was checked.
-- Aadhaar stays available per venue (gates.config.identity = 'aadhaar').
ALTER TABLE "identity_verifications" DROP CONSTRAINT IF EXISTS "identity_verifications_method";--> statement-breakpoint
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_method"
  CHECK ("method" IN ('document','manual_desk','simulated','aadhaar_otp','basic'));

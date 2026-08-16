-- Allow 'aadhaar_otp' as a verification method.
--
-- The constraint did its job: the code invented a value the schema had never
-- agreed to, and the insert failed rather than quietly storing a method
-- nothing else understands.

BEGIN;

ALTER TABLE "identity_verifications" DROP CONSTRAINT IF EXISTS "identity_verifications_method";
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_method"
  CHECK ("method" IN ('document', 'manual_desk', 'simulated', 'aadhaar_otp'));

COMMIT;

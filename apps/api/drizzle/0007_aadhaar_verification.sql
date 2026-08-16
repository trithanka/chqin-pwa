-- What an identity check produces, beyond "it passed".
--
-- An Aadhaar OTP check returns the holder's name, date of birth and gender —
-- exactly what a guest register needs, and what lets a walk-in stop being
-- called "Guest". Consent is recorded alongside, because agreeing to an
-- identity check is a thing you have to be able to prove happened.
--
-- Note what is NOT here: the Aadhaar number. Only a keyed hash (to recognise a
-- repeat guest) and the last four digits (all anyone should ever see).

BEGIN;

ALTER TABLE "identity_verifications"
  ADD COLUMN "subject_name"   text,
  ADD COLUMN "subject_dob"    date,
  ADD COLUMN "subject_gender" text,
  ADD COLUMN "consent"        jsonb;

COMMIT;

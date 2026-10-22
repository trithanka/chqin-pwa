-- Answers to a venue's own identity questions, for people who don't verify
-- with Aadhaar: { "<question>": "<answer>" }, as asked at the time.

ALTER TABLE "identity_verifications" ADD COLUMN IF NOT EXISTS "subject_extra" jsonb;

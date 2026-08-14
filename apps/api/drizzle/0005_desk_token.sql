-- Keep the plaintext token for desk QRs so the card can be reprinted.
--
-- Hashing exists so a database leak isn't a ring of working keys. That logic
-- holds for booking and kiosk tokens, which are per-guest and short-lived. A
-- desk QR is printed and left in public — its secrecy was never the control,
-- and forgetting it means the card can never be reproduced.

BEGIN;

ALTER TABLE "checkin_sessions" ADD COLUMN "token" text;

COMMIT;

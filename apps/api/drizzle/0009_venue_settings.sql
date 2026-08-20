-- Onboarding collects more about a property than a name and an address:
-- which services guests can ask for, the wifi and breakfast facts every guest
-- asks the desk for, the business registration, and which WhatsApp number
-- each service routes to.
--
-- One JSONB column rather than four tables: the onboarding flow is still
-- moving, and nothing reads these by query yet. Promote a key to its own
-- column the day something filters on it.

BEGIN;

ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "settings" jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;

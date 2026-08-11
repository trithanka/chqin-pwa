-- A WebAuthn ceremony needs a user handle before a credential exists, which
-- previously meant INSERTing a guest row when options were requested — so any
-- caller could fill the guests table without ever completing a ceremony.
--
-- The handle is just an opaque id, so it can be minted on the challenge row and
-- the guest created only when registration verifies.

BEGIN;

ALTER TABLE webauthn_challenges
  ADD COLUMN pending_user_handle uuid,
  ADD COLUMN pending_display_name text;

COMMIT;

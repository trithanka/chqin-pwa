-- ChqIn Admin can open a venue's dashboard as it sees it, read-only.
--
-- A view is an ordinary staff session (the venue owner's, so the screens are
-- exactly theirs) marked with the admin who opened it. The /staff guard
-- refuses every write on such a session. On delete SET NULL would turn a view
-- into a real owner session, so a deleted admin takes their views with them.

ALTER TABLE "staff_sessions" ADD COLUMN IF NOT EXISTS "admin_id" uuid REFERENCES "admin_users"("id") ON DELETE CASCADE;

-- The journey is decided at detection, before enrolment mutates the state it
-- was decided from — a first-time guest's booking gains a guest_id during
-- registration, so recomputing at check-in time would report 'returning'.
--
-- Recording the server's decision also makes the audit trail honest: what the
-- server chose, not what the row looks like afterwards.

BEGIN;

ALTER TABLE checkin_sessions
  ADD COLUMN journey text
  CHECK (journey IN ('returning', 'newDevice', 'firstTime', 'desk'));

COMMIT;

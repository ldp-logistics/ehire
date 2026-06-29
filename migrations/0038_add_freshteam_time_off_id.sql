-- Idempotent: add FreshTeam time-off id to leave_requests for migration idempotency.
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS freshteam_time_off_id varchar(32);

CREATE UNIQUE INDEX IF NOT EXISTS leave_requests_freshteam_time_off_id_idx
  ON leave_requests (freshteam_time_off_id)
  WHERE freshteam_time_off_id IS NOT NULL;

COMMENT ON COLUMN leave_requests.freshteam_time_off_id IS 'FreshTeam time_offs.id for sync/migration idempotency';

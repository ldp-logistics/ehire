-- One row per policy work-date: HR "missing check-in" digest was sent (idempotent across restarts / multi-instance).
CREATE TABLE IF NOT EXISTS attendance_hr_missing_checkin_sent (
  work_date date NOT NULL PRIMARY KEY,
  sent_at timestamptz NOT NULL DEFAULT now()
);

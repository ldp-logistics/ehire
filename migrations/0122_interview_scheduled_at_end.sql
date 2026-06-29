-- Store interview end time (from schedule From/To) for feedback timing and auto-reminders.

ALTER TABLE application_stage_history ADD COLUMN IF NOT EXISTS scheduled_at_end TIMESTAMPTZ;

COMMENT ON COLUMN application_stage_history.scheduled_at_end IS 'Interview end instant (UTC); defaults to scheduled_at + 1h when null.';

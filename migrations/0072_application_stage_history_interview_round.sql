-- Per-pipeline-stage round number (1–3) and onsite vs online for interview scheduling.
ALTER TABLE application_stage_history
  ADD COLUMN IF NOT EXISTS interview_round INTEGER,
  ADD COLUMN IF NOT EXISTS schedule_format VARCHAR(20);

COMMENT ON COLUMN application_stage_history.interview_round IS 'Round within pipeline stage (e.g. Screening round 2 vs Interview round 1).';
COMMENT ON COLUMN application_stage_history.schedule_format IS 'onsite | teams — Teams meeting created only when invite is sent for online interviews.';

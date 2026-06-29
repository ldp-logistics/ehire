-- Store Teams meeting link and interview type when scheduling an interview.
-- meeting_link: Teams join URL from Graph API (sent to candidate).
-- teams_event_id: Graph event ID (for update/cancel later if needed).
-- interview_type: e.g. Technical, HR, Screening.

ALTER TABLE application_stage_history
  ADD COLUMN IF NOT EXISTS meeting_link TEXT,
  ADD COLUMN IF NOT EXISTS teams_event_id TEXT,
  ADD COLUMN IF NOT EXISTS interview_type VARCHAR(50);

COMMENT ON COLUMN application_stage_history.meeting_link IS 'Teams meeting join URL from Microsoft Graph when interview is scheduled.';
COMMENT ON COLUMN application_stage_history.teams_event_id IS 'Microsoft Graph calendar event ID for the interview.';
COMMENT ON COLUMN application_stage_history.interview_type IS 'Interview type: Technical, HR, Screening, etc.';

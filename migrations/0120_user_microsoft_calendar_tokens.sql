-- Delegated-app OAuth tokens for interview calendar (separate from SSO login tokens).

ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_calendar_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_calendar_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_calendar_token_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN users.microsoft_calendar_refresh_token IS 'OAuth refresh token from MS_DELEGATED app; used to create interview calendar events as the scheduler.';
COMMENT ON COLUMN users.microsoft_calendar_access_token IS 'Cached delegated-app access token for interview calendar.';
COMMENT ON COLUMN users.microsoft_calendar_token_expires_at IS 'When the delegated calendar access token expires (UTC).';

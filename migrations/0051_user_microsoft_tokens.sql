-- Store Microsoft OAuth tokens for delegated calendar access (scheduler = organizer).
-- Used when user signs in with Microsoft SSO; allows creating Teams meetings in their calendar.
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_token_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN users.microsoft_refresh_token IS 'OAuth refresh token for Microsoft Graph (delegated); used to create meetings as the signed-in user.';
COMMENT ON COLUMN users.microsoft_access_token IS 'Cached access token; refreshed when expired.';
COMMENT ON COLUMN users.microsoft_token_expires_at IS 'When the cached access token expires (UTC).';

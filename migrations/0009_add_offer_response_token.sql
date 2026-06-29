-- Add response token for candidate offer response link (when offer is sent)
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS response_token varchar(255) UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS offers_response_token_unique ON offers (response_token) WHERE response_token IS NOT NULL;

COMMENT ON COLUMN offers.response_token IS 'One-time token for candidate to accept/decline offer via link. Set when status becomes sent.';

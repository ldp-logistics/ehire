-- Two-way email thread per application (sent + received).
-- Outbound: stored when user sends from UI (optionally sent via SMTP/SendGrid).
-- Inbound: stored via webhook when candidate replies (e.g. SendGrid Inbound Parse).

CREATE TABLE IF NOT EXISTS application_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id VARCHAR(255) NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('sent', 'received')),
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  cc TEXT,
  bcc TEXT,
  subject TEXT NOT NULL DEFAULT '',
  body_plain TEXT,
  body_html TEXT,
  message_id TEXT,
  in_reply_to TEXT,
  references_header TEXT,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_emails_application_id_created_at
  ON application_emails (application_id, created_at DESC);

COMMENT ON TABLE application_emails IS 'Email thread per recruitment application; direction sent (from HR) or received (from candidate).';

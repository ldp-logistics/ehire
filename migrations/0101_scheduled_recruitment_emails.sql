-- Deferred candidate emails (e.g. rejection notification after N hours/days)
CREATE TABLE scheduled_recruitment_emails (
  id VARCHAR(255) PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  application_id VARCHAR(255) NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  send_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX idx_scheduled_recruitment_emails_pending_send_at
  ON scheduled_recruitment_emails (send_at)
  WHERE status = 'pending';

CREATE UNIQUE INDEX uniq_pending_rejection_email_per_application
  ON scheduled_recruitment_emails (application_id)
  WHERE status = 'pending' AND event_key = 'recruit.application_rejected_candidate';

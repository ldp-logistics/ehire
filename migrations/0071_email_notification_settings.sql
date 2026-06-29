-- Email notification settings: one row per event key (seeded from catalog on first read)
CREATE TABLE IF NOT EXISTS email_notification_settings (
  event_key        VARCHAR(120) PRIMARY KEY,
  enabled          BOOLEAN      NOT NULL DEFAULT TRUE,
  subject_template TEXT         NOT NULL DEFAULT '',
  body_template    TEXT         NOT NULL DEFAULT '',
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Audit log for every email dispatched by the notification engine
CREATE TABLE IF NOT EXISTS email_notification_logs (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key       VARCHAR(120) NOT NULL,
  recipient_email TEXT         NOT NULL,
  subject         TEXT,
  status          VARCHAR(20)  NOT NULL DEFAULT 'sent',   -- sent | failed | skipped
  error           TEXT,
  metadata        JSONB,
  sent_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_notif_logs_event_key_idx ON email_notification_logs(event_key);
CREATE INDEX IF NOT EXISTS email_notif_logs_sent_at_idx   ON email_notification_logs(sent_at DESC);

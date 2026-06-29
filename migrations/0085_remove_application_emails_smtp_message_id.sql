-- Roll back add-column migration if it was applied manually (smtp_message_id is no longer used).
DROP INDEX IF EXISTS idx_application_emails_smtp_message_id;
ALTER TABLE application_emails DROP COLUMN IF EXISTS smtp_message_id;

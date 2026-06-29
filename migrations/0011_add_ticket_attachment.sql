-- Allow one attachment per support ticket (base64 data URL or URL string).
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

COMMENT ON COLUMN support_tickets.attachment_url IS 'Optional file: base64 data URL or stored file URL';
COMMENT ON COLUMN support_tickets.attachment_name IS 'Original file name for download display';

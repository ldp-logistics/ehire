-- Persist SharePoint URL for the final signed offer artifact (PDF preferred, else signed DOCX from fallback pipeline).
ALTER TABLE offers ADD COLUMN IF NOT EXISTS signed_document_url TEXT;

COMMENT ON COLUMN offers.signed_document_url IS 'SharePoint sharing URL of the signed offer (PDF or DOCX), uploaded after candidate e-signs.';

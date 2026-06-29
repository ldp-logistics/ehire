-- ──────────────────────────────────────────────────────────────────────────────
-- 0091 — Allow NULL docx_data for PDF-form-only offer templates
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE offer_templates
  ALTER COLUMN docx_data DROP NOT NULL;

COMMENT ON COLUMN offer_templates.docx_data IS 'Base64 or SharePoint URL for DOCX — NULL when template is PDF-form only';

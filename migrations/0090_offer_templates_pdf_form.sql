-- ──────────────────────────────────────────────────────────────────────────────
-- 0090 — PDF Form template support for offer_templates
-- ──────────────────────────────────────────────────────────────────────────────

-- template_type: 'docx' (legacy DOCX+mammoth pipeline) or 'pdf_form' (AcroForm PDF)
ALTER TABLE offer_templates
  ADD COLUMN IF NOT EXISTS template_type   VARCHAR(20)  NOT NULL DEFAULT 'docx',
  ADD COLUMN IF NOT EXISTS pdf_template_url TEXT;

COMMENT ON COLUMN offer_templates.template_type    IS '''docx'' = legacy mammoth/LibreOffice pipeline; ''pdf_form'' = AcroForm PDF fill + signature overlay';
COMMENT ON COLUMN offer_templates.pdf_template_url IS 'SharePoint URL (or base64) of the AcroForm PDF template — only set when template_type = ''pdf_form''';

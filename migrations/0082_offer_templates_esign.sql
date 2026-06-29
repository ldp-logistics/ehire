-- ──────────────────────────────────────────────────────────────────────────────
-- 0082 — Offer letter templates + e-sign fields on offers
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS offer_templates (
  id            VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  docx_data     TEXT NOT NULL,                       -- base64 encoded DOCX
  docx_filename TEXT NOT NULL DEFAULT 'template.docx',
  placeholders  JSONB DEFAULT '[]'::jsonb,           -- parsed {{tag}} list
  is_active     BOOLEAN NOT NULL DEFAULT true,
  version       INTEGER NOT NULL DEFAULT 1,
  created_by    VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_templates_active ON offer_templates (is_active);

-- Extend existing offers table for template-based e-sign flow
ALTER TABLE offers ADD COLUMN IF NOT EXISTS template_id        VARCHAR(255) REFERENCES offer_templates(id) ON DELETE SET NULL;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS template_version   INTEGER;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS variables_snapshot  JSONB;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS merged_document_url TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS esign_signature_data TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS esign_signed_at     TIMESTAMPTZ;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS esign_signer_ip     VARCHAR(100);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS esign_signer_ua     TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS esign_token_expires_at TIMESTAMPTZ;

COMMENT ON TABLE  offer_templates IS 'DOCX templates with merge placeholders for offer letters';
COMMENT ON COLUMN offer_templates.docx_data IS 'Base64 encoded DOCX content — max ~2MB file';
COMMENT ON COLUMN offer_templates.placeholders IS 'Array of discovered {{tag}} strings in the DOCX';
COMMENT ON COLUMN offers.template_id IS 'FK to the template used to generate this offer letter';
COMMENT ON COLUMN offers.variables_snapshot IS 'JSON snapshot of merge variables at send time';
COMMENT ON COLUMN offers.merged_document_url IS 'Base64 data URL of merged DOCX (post-merge, pre-sign)';
COMMENT ON COLUMN offers.esign_signature_data IS 'Base64 PNG of candidate e-signature';
COMMENT ON COLUMN offers.esign_signed_at IS 'Timestamp when candidate e-signed';
COMMENT ON COLUMN offers.esign_signer_ip IS 'IP address at time of e-signing';
COMMENT ON COLUMN offers.esign_token_expires_at IS 'When the signing link expires';

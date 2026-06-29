-- Custom fields per benefit card (OPD limit, sum insured, etc.)
ALTER TABLE benefit_cards
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

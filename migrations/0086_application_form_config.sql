-- Application form configuration (single global default, upserted by HR/admin)
CREATE TABLE IF NOT EXISTS application_form_configs (
  id          VARCHAR(50)  PRIMARY KEY DEFAULT 'default',
  config      JSONB        NOT NULL DEFAULT '{"sections":[]}',
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed the default config row so GET always returns something
INSERT INTO application_form_configs (id, config)
VALUES ('default', '{
  "sections": [
    {
      "id": "s_core",
      "title": "Submit Your Application",
      "description": null,
      "system": true,
      "fields": [
        {"id":"resume","type":"file","label":"Resume / CV","required":true,"system":true,"systemKey":"resume"},
        {"id":"firstName","type":"text","label":"First Name","required":true,"system":true,"systemKey":"firstName"},
        {"id":"middleName","type":"text","label":"Middle Name","required":false,"system":true,"systemKey":"middleName"},
        {"id":"lastName","type":"text","label":"Last Name","required":true,"system":true,"systemKey":"lastName"},
        {"id":"email","type":"email","label":"Email","required":true,"system":true,"systemKey":"email"},
        {"id":"phone","type":"text","label":"Phone","required":false,"system":false,"systemKey":"phone"},
        {"id":"linkedinUrl","type":"url","label":"LinkedIn URL","required":false,"system":false,"systemKey":"linkedinUrl"}
      ]
    }
  ]
}')
ON CONFLICT (id) DO NOTHING;

-- Store custom question answers on applications
ALTER TABLE applications ADD COLUMN IF NOT EXISTS custom_answers JSONB;

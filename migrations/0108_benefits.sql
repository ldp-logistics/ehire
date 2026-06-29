-- =====================================================================
-- 0108: Benefits module — benefit_cards + benefit_card_assignments
-- =====================================================================

CREATE TABLE IF NOT EXISTS benefit_cards (
  id              VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  title           VARCHAR(500) NOT NULL,
  category        VARCHAR(100) NOT NULL DEFAULT 'medical',
  provider        VARCHAR(255),
  description     TEXT,
  valid_from      DATE,
  valid_until     DATE,
  document_url    TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_by_name VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS benefit_card_assignments (
  id               VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  benefit_card_id  VARCHAR(255) NOT NULL REFERENCES benefit_cards(id) ON DELETE CASCADE,
  employee_id      VARCHAR(255) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status           VARCHAR(50)  NOT NULL DEFAULT 'active',
  card_number      VARCHAR(255),
  notes            TEXT,
  assigned_by      VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  assigned_by_name VARCHAR(255),
  assigned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (benefit_card_id, employee_id)
);

CREATE INDEX IF NOT EXISTS benefit_cards_is_active_idx       ON benefit_cards (is_active);
CREATE INDEX IF NOT EXISTS benefit_cards_category_idx        ON benefit_cards (category);
CREATE INDEX IF NOT EXISTS benefit_assignments_card_idx      ON benefit_card_assignments (benefit_card_id);
CREATE INDEX IF NOT EXISTS benefit_assignments_employee_idx  ON benefit_card_assignments (employee_id);
CREATE INDEX IF NOT EXISTS benefit_assignments_status_idx    ON benefit_card_assignments (status);

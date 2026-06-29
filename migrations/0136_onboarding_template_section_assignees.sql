-- Default assignees per onboarding template section (copied to record sections on initiate).

CREATE TABLE IF NOT EXISTS onboarding_template_section_assignees (
  id          VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  VARCHAR(255) NOT NULL REFERENCES onboarding_template_sections(id) ON DELETE CASCADE,
  employee_id VARCHAR(255) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(section_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_ob_tpl_section_assignees_section
  ON onboarding_template_section_assignees(section_id);

CREATE INDEX IF NOT EXISTS idx_ob_tpl_section_assignees_employee
  ON onboarding_template_section_assignees(employee_id);

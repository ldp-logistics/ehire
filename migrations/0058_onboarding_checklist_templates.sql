-- ============================================================
-- 0058: Onboarding checklist template system
-- ============================================================

-- 1. Template definitions
CREATE TABLE IF NOT EXISTS onboarding_templates (
  id             VARCHAR(255)  PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT          NOT NULL,
  description    TEXT,
  department     TEXT,
  is_active      BOOLEAN       NOT NULL DEFAULT true,
  created_by_id  VARCHAR(255)  REFERENCES employees(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 2. Sections inside a template
CREATE TABLE IF NOT EXISTS onboarding_template_sections (
  id          VARCHAR(255)  PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id VARCHAR(255)  NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
  name        TEXT          NOT NULL,
  description TEXT,
  sort_order  INTEGER       NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 3. Default tasks inside a template section
CREATE TABLE IF NOT EXISTS onboarding_template_tasks (
  id         VARCHAR(255)  PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id VARCHAR(255)  NOT NULL REFERENCES onboarding_template_sections(id) ON DELETE CASCADE,
  task_name  TEXT          NOT NULL,
  sort_order INTEGER       NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 4. Sections that were created for a specific onboarding record (copied from template at initiation)
CREATE TABLE IF NOT EXISTS onboarding_record_sections (
  id                  VARCHAR(255)  PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id           VARCHAR(255)  NOT NULL REFERENCES onboarding_records(id) ON DELETE CASCADE,
  template_section_id VARCHAR(255)  REFERENCES onboarding_template_sections(id) ON DELETE SET NULL,
  name                TEXT          NOT NULL,
  description         TEXT,
  sort_order          INTEGER       NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 5. Assignees per record section
CREATE TABLE IF NOT EXISTS onboarding_record_section_assignees (
  id          VARCHAR(255)  PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  VARCHAR(255)  NOT NULL REFERENCES onboarding_record_sections(id) ON DELETE CASCADE,
  employee_id VARCHAR(255)  NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(section_id, employee_id)
);

-- 6. Alter onboarding_records: add template_id
ALTER TABLE onboarding_records
  ADD COLUMN IF NOT EXISTS template_id VARCHAR(255) REFERENCES onboarding_templates(id) ON DELETE SET NULL;

-- 7. Alter onboarding_tasks: add section_id
ALTER TABLE onboarding_tasks
  ADD COLUMN IF NOT EXISTS section_id VARCHAR(255) REFERENCES onboarding_record_sections(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ob_template_sections_template ON onboarding_template_sections(template_id);
CREATE INDEX IF NOT EXISTS idx_ob_template_tasks_section     ON onboarding_template_tasks(section_id);
CREATE INDEX IF NOT EXISTS idx_ob_record_sections_record     ON onboarding_record_sections(record_id);
CREATE INDEX IF NOT EXISTS idx_ob_section_assignees_section  ON onboarding_record_section_assignees(section_id);
CREATE INDEX IF NOT EXISTS idx_ob_section_assignees_emp      ON onboarding_record_section_assignees(employee_id);
CREATE INDEX IF NOT EXISTS idx_ob_tasks_section              ON onboarding_tasks(section_id);

-- ============================================================
-- Seed: 6 default templates
-- ============================================================

DO $$
DECLARE
  t_basic     VARCHAR(255);
  t_fin       VARCHAR(255);
  t_ops       VARCHAR(255);
  t_sales     VARCHAR(255);
  t_it        VARCHAR(255);
  t_hr        VARCHAR(255);
  s_id        VARCHAR(255);
BEGIN

-- ── 1. Onboarding and Orientation (Basic) ────────────────────
INSERT INTO onboarding_templates (name, description, department, is_active)
VALUES ('Onboarding and Orientation (Basic)', 'General onboarding checklist for all new hires', NULL, true)
RETURNING id INTO t_basic;

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_basic, 'General Information', 'Collect and verify basic employee information', 0) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Verify employee ID and personal details', 0), (s_id, 'Collect emergency contact information', 1), (s_id, 'Confirm start date and work location', 2);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_basic, 'System Access', 'Set up accounts and access credentials', 1) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Create Company Microsoft Account', 0), (s_id, 'Set up email and calendar', 1), (s_id, 'Enable multi-factor authentication', 2);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_basic, 'Equipment', 'Assign hardware and peripherals', 2) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Assign laptop', 0), (s_id, 'Assign mouse and keyboard', 1), (s_id, 'Set up workstation or home office equipment', 2);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_basic, 'HR & Compliance', 'Complete required HR paperwork and policies', 3) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Sign employment contract', 0), (s_id, 'Review and sign code of conduct', 1), (s_id, 'Complete data privacy training', 2), (s_id, 'Enroll in benefits (health, dental, etc.)', 3);

-- ── 2. Finance – Employee Onboarding Due Diligence ───────────
INSERT INTO onboarding_templates (name, description, department, is_active)
VALUES ('Finance - Employee Onboarding Due diligence', 'Onboarding checklist for Finance department hires', 'Finance', true)
RETURNING id INTO t_fin;

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_fin, 'General Information', NULL, 0) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Verify employee ID and personal details', 0), (s_id, 'Collect bank account details for payroll', 1), (s_id, 'Confirm tax information and forms', 2);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_fin, 'Finance System Access', 'Grant access to finance tools and ERP systems', 1) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Create Company Microsoft Account', 0), (s_id, 'Grant access to accounting software (QuickBooks / SAP)', 1), (s_id, 'Set up ERP portal access', 2), (s_id, 'Enable banking portal access', 3);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_fin, 'Equipment', NULL, 2) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Assign laptop', 0), (s_id, 'Assign secure document scanner', 1);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_fin, 'Finance Compliance', 'Complete finance-specific compliance and regulatory requirements', 3) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Review financial policies and procedures', 0), (s_id, 'Complete anti-money laundering training', 1), (s_id, 'Sign data confidentiality agreement', 2), (s_id, 'Review expense and procurement policy', 3);

-- ── 3. Operations – Employee Onboarding Due Diligence ────────
INSERT INTO onboarding_templates (name, description, department, is_active)
VALUES ('Operations - Employee Onboarding Due diligence', 'Onboarding checklist for Operations department hires', 'Operations', true)
RETURNING id INTO t_ops;

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_ops, 'General Information', NULL, 0) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Verify employee ID and personal details', 0), (s_id, 'Confirm department and reporting line', 1);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_ops, 'Emails', 'Please answer with Yes or No for the Operations department emails which are required', 1) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Info Email', 0), (s_id, 'Rates Email', 1), (s_id, 'Dispatch Email', 2), (s_id, 'Accounting Email', 3);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_ops, 'Access to Company Portals', 'Please mark the portals on which the employee needs access. If anything is missing, please add a task for that.', 2) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Zoom Phone', 0), (s_id, 'Zoom Chat', 1), (s_id, 'TAI TMS', 2), (s_id, 'HubSpot CRM', 3), (s_id, 'Approval Max', 4), (s_id, 'Adobe Acrobat Reader', 5), (s_id, 'DAT', 6), (s_id, 'Amazon portal', 7), (s_id, 'All Sea Ports Portals', 8);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_ops, 'Equipment', NULL, 3) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Assign laptop', 0), (s_id, 'Assign company phone', 1);

-- ── 4. Sales & Marketing – Employee Onboarding Due Diligence ─
INSERT INTO onboarding_templates (name, description, department, is_active)
VALUES ('Sales & Marketing - Employee Onboarding Due diligence', 'Onboarding checklist for Sales & Marketing department hires', 'Sales & Marketing', true)
RETURNING id INTO t_sales;

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_sales, 'General Information', NULL, 0) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Verify employee ID and personal details', 0), (s_id, 'Confirm territory and reporting manager', 1);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_sales, 'Sales & Marketing System Access', 'Grant access to CRM and marketing tools', 1) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Create Company Microsoft Account', 0), (s_id, 'Set up HubSpot CRM access', 1), (s_id, 'Grant access to marketing automation platform', 2), (s_id, 'LinkedIn Sales Navigator account', 3), (s_id, 'Set up Slack / Teams channel access', 4);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_sales, 'Equipment', NULL, 2) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Assign laptop', 0), (s_id, 'Assign company phone (if applicable)', 1);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_sales, 'Sales Enablement', 'Provide resources and training for the role', 3) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Share sales playbook and pitch deck', 0), (s_id, 'Complete product knowledge training', 1), (s_id, 'Review commission and incentive structure', 2), (s_id, 'Introduce to key accounts or territory', 3);

-- ── 5. IT – Employee Onboarding Due Diligence ────────────────
INSERT INTO onboarding_templates (name, description, department, is_active)
VALUES ('IT - Employee Onboarding Due diligence', 'Onboarding checklist for IT department hires', 'IT', true)
RETURNING id INTO t_it;

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_it, 'General Information', NULL, 0) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Verify employee ID and personal details', 0), (s_id, 'Confirm team assignment and manager', 1);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_it, 'IT System Access', 'Grant access to development and infrastructure tools', 1) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Create Company Microsoft Account', 0), (s_id, 'Set up GitHub / GitLab account', 1), (s_id, 'Grant access to cloud infrastructure (AWS/Azure/GCP)', 2), (s_id, 'Set up VPN access', 3), (s_id, 'Grant Jira / project management access', 4), (s_id, 'Set up development environment', 5);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_it, 'Equipment', NULL, 2) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Assign laptop (developer spec)', 0), (s_id, 'Assign external monitor', 1), (s_id, 'Assign docking station and peripherals', 2);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_it, 'Security & Compliance', 'Ensure IT security standards are met', 3) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Complete cybersecurity awareness training', 0), (s_id, 'Enable full-disk encryption', 1), (s_id, 'Set up password manager', 2), (s_id, 'Review IT security policy', 3);

-- ── 6. Human Resources – Employee Onboarding Due Diligence ───
INSERT INTO onboarding_templates (name, description, department, is_active)
VALUES ('Human Resources - Employee Onboarding Due diligence', 'Onboarding checklist for Human Resources department hires', 'Human Resources', true)
RETURNING id INTO t_hr;

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_hr, 'General Information', NULL, 0) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Verify employee ID and personal details', 0), (s_id, 'Confirm HR team assignment', 1);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_hr, 'HR System Access', 'Grant access to HRMS and payroll tools', 1) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Create Company Microsoft Account', 0), (s_id, 'Grant full HRMS access', 1), (s_id, 'Set up payroll system access', 2), (s_id, 'Grant access to ATS (Recruitment platform)', 3);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_hr, 'Equipment', NULL, 2) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Assign laptop', 0);

INSERT INTO onboarding_template_sections (template_id, name, description, sort_order) VALUES (t_hr, 'HR Policies & Training', 'Review HR-specific policies and complete required training', 3) RETURNING id INTO s_id;
INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order) VALUES (s_id, 'Review all HR policies and employee handbook', 0), (s_id, 'Complete labor law compliance training', 1), (s_id, 'Complete data protection and GDPR training', 2), (s_id, 'Shadow existing HR team members for first week', 3);

END $$;

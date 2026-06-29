-- =====================================================================
-- 0015: Compensation – salary_details, banking_details, bonuses, stock_grants
-- =====================================================================

CREATE TABLE IF NOT EXISTS salary_details (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id VARCHAR(255) NOT NULL,
  annual_salary NUMERIC(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'PKR',
  start_date TIMESTAMPTZ NOT NULL,
  is_current TEXT NOT NULL DEFAULT 'true',
  reason VARCHAR(255),
  pay_rate NUMERIC(12,2),
  pay_rate_period VARCHAR(20) DEFAULT 'Monthly',
  payout_frequency VARCHAR(50) DEFAULT 'Monthly',
  pay_group VARCHAR(100),
  pay_method VARCHAR(50) DEFAULT 'Direct Deposit',
  eligible_work_hours VARCHAR(50),
  additional_details TEXT,
  notes TEXT,
  updated_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS salary_details_employee_id_idx ON salary_details (employee_id);
CREATE INDEX IF NOT EXISTS salary_details_is_current_idx ON salary_details (is_current);

CREATE TABLE IF NOT EXISTS banking_details (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id VARCHAR(255) NOT NULL,
  bank_name VARCHAR(255) NOT NULL,
  name_on_account VARCHAR(255) NOT NULL,
  bank_code VARCHAR(20),
  account_number VARCHAR(50) NOT NULL,
  iban VARCHAR(50),
  is_primary TEXT NOT NULL DEFAULT 'true',
  updated_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS banking_details_employee_id_idx ON banking_details (employee_id);

CREATE TABLE IF NOT EXISTS bonuses (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id VARCHAR(255) NOT NULL,
  bonus_type VARCHAR(100) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'PKR',
  bonus_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  updated_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bonuses_employee_id_idx ON bonuses (employee_id);

CREATE TABLE IF NOT EXISTS stock_grants (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id VARCHAR(255) NOT NULL,
  units INTEGER NOT NULL,
  grant_date TIMESTAMPTZ NOT NULL,
  vesting_schedule VARCHAR(100),
  notes TEXT,
  updated_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stock_grants_employee_id_idx ON stock_grants (employee_id);

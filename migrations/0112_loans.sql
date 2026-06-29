-- Loan Applications (employee submits; HR reviews)
CREATE TABLE IF NOT EXISTS loan_applications (
  id                VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       VARCHAR(255) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  loan_type         VARCHAR(50)  NOT NULL CHECK (loan_type IN ('salary_advance', 'personal_loan')),
  requested_amount  NUMERIC(14, 2) NOT NULL,
  currency          VARCHAR(10) NOT NULL DEFAULT 'PKR',
  requested_tenure  INTEGER NOT NULL,         -- months
  reason            TEXT NOT NULL,
  supporting_note   TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  applied_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  reviewed_by       VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMP WITH TIME ZONE,
  rejection_reason  TEXT,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Loan Records (active / completed / paused loans; created on approval OR manually added)
CREATE TABLE IF NOT EXISTS loan_records (
  id                   VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id       VARCHAR(255) REFERENCES loan_applications(id) ON DELETE SET NULL,
  employee_id          VARCHAR(255) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  loan_type            VARCHAR(50)  NOT NULL CHECK (loan_type IN ('salary_advance', 'personal_loan', 'other')),
  total_amount         NUMERIC(14, 2) NOT NULL,
  currency             VARCHAR(10) NOT NULL DEFAULT 'PKR',
  approved_tenure      INTEGER NOT NULL,        -- months
  monthly_deduction    NUMERIC(14, 2) NOT NULL,
  disbursement_date    DATE,
  effective_start_date DATE NOT NULL,
  months_paid          INTEGER NOT NULL DEFAULT 0,
  outstanding_balance  NUMERIC(14, 2) NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'completed', 'paused')),
  hr_notes             TEXT,
  created_by           VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Loan Payments (each monthly deduction entry)
CREATE TABLE IF NOT EXISTS loan_payments (
  id              VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_record_id  VARCHAR(255) NOT NULL REFERENCES loan_records(id) ON DELETE CASCADE,
  amount          NUMERIC(14, 2) NOT NULL,
  payment_date    DATE NOT NULL,
  salary_month    VARCHAR(7),   -- e.g. "2025-06"
  notes           TEXT,
  added_by        VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS loan_applications_employee_id_idx ON loan_applications(employee_id);
CREATE INDEX IF NOT EXISTS loan_applications_status_idx      ON loan_applications(status);
CREATE INDEX IF NOT EXISTS loan_records_employee_id_idx      ON loan_records(employee_id);
CREATE INDEX IF NOT EXISTS loan_records_status_idx           ON loan_records(status);
CREATE INDEX IF NOT EXISTS loan_payments_loan_record_id_idx  ON loan_payments(loan_record_id);

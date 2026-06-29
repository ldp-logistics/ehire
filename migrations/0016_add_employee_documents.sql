-- Employee documents (e.g. from tentative verification) — shown on employee profile Documents tab
CREATE TABLE IF NOT EXISTS employee_documents (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id VARCHAR(255) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,
  display_name TEXT,
  file_url TEXT,
  file_name TEXT,
  source VARCHAR(50) NOT NULL DEFAULT 'tentative_verification',
  tentative_document_id VARCHAR(255),
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_docs_employee_id ON employee_documents (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_docs_source ON employee_documents (source);

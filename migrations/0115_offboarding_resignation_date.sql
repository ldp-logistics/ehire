-- Resignation date on offboarding (when the employee submitted resignation), separate from exit/last working day.

ALTER TABLE offboarding_records
  ADD COLUMN IF NOT EXISTS resignation_date DATE;

-- Backfill existing records: employee profile → initiated_at (resignation) → created_at
UPDATE offboarding_records o
SET resignation_date = COALESCE(
  (SELECT e.resignation_date::date FROM employees e WHERE e.id = o.employee_id),
  CASE WHEN o.offboarding_type::text = 'resignation' THEN o.initiated_at::date END,
  o.created_at::date
)
WHERE o.resignation_date IS NULL;

-- Sync employee resignation_date from offboarding where still missing
UPDATE employees e
SET resignation_date = o.resignation_date
FROM offboarding_records o
WHERE e.id = o.employee_id
  AND o.resignation_date IS NOT NULL
  AND e.resignation_date IS NULL;

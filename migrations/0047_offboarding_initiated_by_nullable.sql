-- Allow initiated_by to be NULL when offboarding is initiated by a user
-- who has no employee record (e.g. admin/HR-only account).
-- FK still references employees.id; NULL is valid and does not violate it.
ALTER TABLE offboarding_records
  ALTER COLUMN initiated_by DROP NOT NULL;

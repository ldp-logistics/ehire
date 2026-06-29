-- Personal mobile / phone (distinct from work_phone / office extension).
ALTER TABLE employees ADD COLUMN IF NOT EXISTS personal_phone varchar(50);
COMMENT ON COLUMN employees.personal_phone IS 'Personal mobile or home phone; work/office number stays in work_phone';

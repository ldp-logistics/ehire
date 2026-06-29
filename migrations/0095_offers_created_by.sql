-- Track who created the offer (for in-app notifications after HR approves a limited-recruiter draft).
ALTER TABLE offers ADD COLUMN IF NOT EXISTS created_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN offers.created_by IS 'User id of the employee who created the offer row (auth users.id).';

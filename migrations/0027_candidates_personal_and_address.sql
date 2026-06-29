-- Collect personal details and home address at application so they can prefill employee profile on hire.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender varchar(50),
  ADD COLUMN IF NOT EXISTS marital_status varchar(50),
  ADD COLUMN IF NOT EXISTS blood_group varchar(10),
  ADD COLUMN IF NOT EXISTS personal_email varchar(255),
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS zip_code varchar(20);

COMMENT ON COLUMN candidates.personal_email IS 'Personal email; used to prefill employee personal_email on hire';
COMMENT ON COLUMN candidates.date_of_birth IS 'Date of birth; prefills employee dob on hire';
COMMENT ON COLUMN candidates.street IS 'Home address; prefills employee address on hire';

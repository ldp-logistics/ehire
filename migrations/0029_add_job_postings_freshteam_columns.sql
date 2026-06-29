-- FreshTeam migration: link job_postings to FreshTeam so candidate migration can map applicants to jobs.
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS experience_level varchar(50),
  ADD COLUMN IF NOT EXISTS remote boolean,
  ADD COLUMN IF NOT EXISTS freshteam_job_id varchar(32);

CREATE INDEX IF NOT EXISTS job_postings_freshteam_job_id_idx ON job_postings(freshteam_job_id) WHERE freshteam_job_id IS NOT NULL;

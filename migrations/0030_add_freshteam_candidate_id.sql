-- Link candidates to FreshTeam by id so we can link applications without re-fetching candidate.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS freshteam_candidate_id varchar(32);

CREATE INDEX IF NOT EXISTS candidates_freshteam_candidate_id_idx ON candidates(freshteam_candidate_id) WHERE freshteam_candidate_id IS NOT NULL;

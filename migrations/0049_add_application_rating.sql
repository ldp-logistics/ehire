-- HR rating for applicants (1-5) to track fit for the job.
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS rating INTEGER;

ALTER TABLE applications
  ADD CONSTRAINT applications_rating_check CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));

COMMENT ON COLUMN applications.rating IS 'HR rating 1-5 for candidate fit; null = not rated yet.';

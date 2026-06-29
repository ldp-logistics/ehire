-- Retire "tentative" pipeline stage: hiring continues verbally_accepted → offer → hired.
UPDATE applications
SET stage = 'verbally_accepted',
    stage_updated_at = COALESCE(stage_updated_at, NOW())
WHERE stage = 'tentative';

-- Recruitment workflow: verbal acceptance, tentative-before-offer, offer approval.
-- Idempotent: safe to run multiple times.

-- 1) New application stage: verbally_accepted
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'application_stage' AND e.enumlabel = 'verbally_accepted'
  ) THEN
    ALTER TYPE application_stage ADD VALUE 'verbally_accepted';
  END IF;
END $$;

-- 2) applications.verbal_acceptance_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'applications' AND column_name = 'verbal_acceptance_at'
  ) THEN
    ALTER TABLE applications ADD COLUMN verbal_acceptance_at timestamp with time zone NULL;
  END IF;
END $$;

-- 3) offers: approval_status, approved_at, approved_by
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE offers ADD COLUMN approval_status varchar(50) NOT NULL DEFAULT 'pending';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE offers ADD COLUMN approved_at timestamp with time zone NULL;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE offers ADD COLUMN approved_by varchar(255) NULL REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Backward compat: existing offers that were already sent or accepted treated as approved
UPDATE offers SET approval_status = 'approved', approved_at = COALESCE(responded_at, sent_at, created_at), approved_by = NULL
WHERE approval_status = 'pending' AND (status = 'accepted' OR sent_at IS NOT NULL);

-- 4) Recruitment audit log (VERBAL_ACCEPTANCE_MARKED, OFFER_APPROVED, OFFER_REJECTED)
CREATE TABLE IF NOT EXISTS recruitment_audit_log (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type varchar(50) NOT NULL,
  entity_id varchar(255) NOT NULL,
  action varchar(50) NOT NULL,
  performed_by varchar(255) NULL REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recruitment_audit_entity ON recruitment_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_audit_action ON recruitment_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_recruitment_audit_created ON recruitment_audit_log(created_at);

-- Allow HR to mark a required document as "send later" without blocking tentative clearance.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  ALTER TYPE tentative_doc_status ADD VALUE 'deferred';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

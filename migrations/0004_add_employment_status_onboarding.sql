-- Add "onboarding" to employment_status enum for Freshteam-aligned lifecycle
DO $$ BEGIN
  ALTER TYPE "public"."employment_status" ADD VALUE 'onboarding';
EXCEPTION
  WHEN duplicate_object THEN NULL; -- already exists
END $$;

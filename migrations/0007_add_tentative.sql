-- Migration: Add Tentative Hiring tables
-- Flow: Offer Accepted → Tentative → Cleared → Confirm Hire → Employee Created
-- V2 Notes: Background verification APIs can be added without schema changes.

-- Add "tentative" to application_stage enum
ALTER TYPE "application_stage" ADD VALUE IF NOT EXISTS 'tentative' BEFORE 'hired';

-- Enums
DO $$ BEGIN
  CREATE TYPE "tentative_status" AS ENUM ('pending', 'cleared', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "tentative_doc_type" AS ENUM (
    'cnic_front', 'cnic_back', 'professional_photo',
    'passport', 'drivers_license',
    'degree_transcript',
    'experience_certificate', 'salary_slip', 'resignation_acceptance', 'internship_certificate'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "tentative_doc_status" AS ENUM ('pending', 'uploaded', 'verified', 'rejected', 'not_applicable');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Tentative Records
CREATE TABLE IF NOT EXISTS "tentative_records" (
  "id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  "application_id" varchar(255) NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "candidate_id" varchar(255) NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE,
  "status" "tentative_status" NOT NULL DEFAULT 'pending',
  "is_first_job" boolean NOT NULL DEFAULT false,
  "portal_token" varchar(255) NOT NULL DEFAULT gen_random_uuid(),
  "initiated_by" varchar(255),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "cleared_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "failed_reason" text
);

CREATE INDEX IF NOT EXISTS "idx_tentative_application" ON "tentative_records" ("application_id");
CREATE INDEX IF NOT EXISTS "idx_tentative_candidate" ON "tentative_records" ("candidate_id");
CREATE INDEX IF NOT EXISTS "idx_tentative_token" ON "tentative_records" ("portal_token");

-- Tentative Documents (append-only mindset — never delete rows)
CREATE TABLE IF NOT EXISTS "tentative_documents" (
  "id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tentative_record_id" varchar(255) NOT NULL REFERENCES "tentative_records"("id") ON DELETE CASCADE,
  "document_type" "tentative_doc_type" NOT NULL,
  "required" boolean NOT NULL DEFAULT true,
  "status" "tentative_doc_status" NOT NULL DEFAULT 'pending',
  "file_url" text,
  "file_name" text,
  "rejection_reason" text,
  "verified_by" varchar(255),
  "verified_at" timestamp with time zone,
  "uploaded_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_tentative_doc_record" ON "tentative_documents" ("tentative_record_id");
CREATE INDEX IF NOT EXISTS "idx_tentative_doc_type" ON "tentative_documents" ("document_type");

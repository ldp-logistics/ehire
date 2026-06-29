-- Migration: Add Time & Attendance tables
-- Tables: shifts, employee_shifts, attendance_records, attendance_audit
-- V2 Note: "biometric" source enum value is reserved but not implemented.
-- No biometric device logic or device ID columns — those will be added in V2 without schema changes.

-- Enums
DO $$ BEGIN
  CREATE TYPE "attendance_source" AS ENUM ('manual', 'web', 'mobile', 'biometric');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "attendance_status" AS ENUM ('present', 'late', 'half_day', 'absent');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "attendance_audit_action" AS ENUM ('create', 'update', 'delete');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Shifts table
CREATE TABLE IF NOT EXISTS "shifts" (
  "id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "start_time" time NOT NULL,
  "end_time" time NOT NULL,
  "grace_minutes" integer NOT NULL DEFAULT 15,
  "weekly_pattern" jsonb NOT NULL DEFAULT '[true,true,true,true,true,false,false]',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Employee Shifts (assignment table)
CREATE TABLE IF NOT EXISTS "employee_shifts" (
  "id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" varchar(255) NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "shift_id" varchar(255) NOT NULL REFERENCES "shifts"("id") ON DELETE CASCADE,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_employee_shifts_employee" ON "employee_shifts" ("employee_id");
CREATE INDEX IF NOT EXISTS "idx_employee_shifts_shift" ON "employee_shifts" ("shift_id");

-- Attendance Records (source-agnostic)
CREATE TABLE IF NOT EXISTS "attendance_records" (
  "id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" varchar(255) NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "check_in_time" timestamp with time zone,
  "check_out_time" timestamp with time zone,
  "source" "attendance_source" NOT NULL DEFAULT 'web',
  "status" "attendance_status" NOT NULL DEFAULT 'present',
  "remarks" text,
  "created_by" varchar(255),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_attendance_employee" ON "attendance_records" ("employee_id");
CREATE INDEX IF NOT EXISTS "idx_attendance_date" ON "attendance_records" ("date");
CREATE INDEX IF NOT EXISTS "idx_attendance_employee_date" ON "attendance_records" ("employee_id", "date");

-- Attendance Audit (append-only)
CREATE TABLE IF NOT EXISTS "attendance_audit" (
  "id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  "attendance_id" varchar(255) NOT NULL REFERENCES "attendance_records"("id") ON DELETE CASCADE,
  "action" "attendance_audit_action" NOT NULL,
  "performed_by" varchar(255),
  "reason" text,
  "changes" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_audit_attendance" ON "attendance_audit" ("attendance_id");

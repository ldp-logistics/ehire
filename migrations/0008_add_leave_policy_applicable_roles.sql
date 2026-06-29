-- Add applicable_roles to leave_policies (which roles can use this policy for leave; empty = all)
ALTER TABLE "leave_policies" ADD COLUMN IF NOT EXISTS "applicable_roles" jsonb DEFAULT '[]' NOT NULL;

-- Onboarding module: onboarding_records and onboarding_tasks
CREATE TYPE "public"."onboarding_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TABLE "onboarding_records" (
	"id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar(255),
	"owner_id" varchar(255),
	"hire_name" text,
	"hire_role" text,
	"hire_department" text,
	"hire_email" varchar(255),
	"start_date" timestamp with time zone,
	"status" "onboarding_status" DEFAULT 'in_progress' NOT NULL,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "onboarding_tasks" (
	"id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"onboarding_record_id" varchar(255) NOT NULL,
	"task_name" text NOT NULL,
	"category" text DEFAULT 'Company-wide' NOT NULL,
	"completed" text DEFAULT 'false' NOT NULL,
	"assignment_details" text,
	"completed_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "onboarding_records" ADD CONSTRAINT "onboarding_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_records" ADD CONSTRAINT "onboarding_records_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_onboarding_record_id_onboarding_records_id_fk" FOREIGN KEY ("onboarding_record_id") REFERENCES "public"."onboarding_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_records_employee_id_idx" ON "onboarding_records" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "onboarding_records_owner_id_idx" ON "onboarding_records" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "onboarding_records_status_idx" ON "onboarding_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "onboarding_records_start_date_idx" ON "onboarding_records" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "onboarding_tasks_record_id_idx" ON "onboarding_tasks" USING btree ("onboarding_record_id");--> statement-breakpoint
CREATE INDEX "onboarding_tasks_completed_idx" ON "onboarding_tasks" USING btree ("completed");

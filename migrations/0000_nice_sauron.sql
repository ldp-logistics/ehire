CREATE TYPE "public"."employee_source" AS ENUM('manual', 'freshteam', 'sso');--> statement-breakpoint
CREATE TYPE "public"."employee_type" AS ENUM('full_time', 'part_time', 'contractor', 'intern', 'temporary');--> statement-breakpoint
CREATE TYPE "public"."employment_status" AS ENUM('active', 'on_leave', 'terminated', 'resigned');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other', 'prefer_not_to_say');--> statement-breakpoint
CREATE TYPE "public"."marital_status" AS ENUM('single', 'married', 'divorced', 'widowed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'hr', 'manager', 'employee');--> statement-breakpoint
CREATE TYPE "public"."change_request_category" AS ENUM('personal_details', 'address', 'contact', 'dependents', 'emergency_contacts', 'bank_details');--> statement-breakpoint
CREATE TYPE "public"."change_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."procurement_status" AS ENUM('received', 'pending', 'partial', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stock_category" AS ENUM('Hardware', 'Components', 'Storage', 'Network', 'Display', 'Systems', 'Peripherals', 'Other');--> statement-breakpoint
CREATE TYPE "public"."system_status" AS ENUM('assigned', 'home', 'repair', 'available', 'decommissioned');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TABLE "employees" (
	"id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar(50) NOT NULL,
	"work_email" varchar(255) NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text NOT NULL,
	"avatar" text,
	"job_title" text NOT NULL,
	"department" text NOT NULL,
	"sub_department" text,
	"business_unit" text,
	"primary_team" text,
	"cost_center" text,
	"grade" text,
	"job_category" text,
	"location" text,
	"manager_id" varchar(255),
	"manager_email" varchar(255),
	"hr_email" varchar(255),
	"employment_status" "employment_status" DEFAULT 'active' NOT NULL,
	"employee_type" "employee_type" DEFAULT 'full_time',
	"shift" text,
	"personal_email" varchar(255),
	"work_phone" varchar(50),
	"dob" date,
	"gender" "gender",
	"marital_status" "marital_status",
	"blood_group" varchar(10),
	"street" text,
	"city" text,
	"state" text,
	"country" text,
	"zip_code" varchar(20),
	"comm_street" text,
	"comm_city" text,
	"comm_state" text,
	"comm_country" text,
	"comm_zip_code" varchar(20),
	"join_date" timestamp with time zone NOT NULL,
	"probation_start_date" timestamp with time zone,
	"probation_end_date" timestamp with time zone,
	"confirmation_date" timestamp with time zone,
	"notice_period" varchar(50),
	"resignation_date" timestamp with time zone,
	"exit_date" timestamp with time zone,
	"exit_type" text,
	"resignation_reason" text,
	"eligible_for_rehire" varchar(10),
	"custom_field_1" text,
	"custom_field_2" text,
	"source" "employee_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text,
	"employee_id" varchar(255),
	"role" "user_role" DEFAULT 'employee' NOT NULL,
	"sso_provider" varchar(50),
	"sso_id" varchar(255),
	"is_active" text DEFAULT 'true' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" varchar(255) NOT NULL,
	"employee_id" varchar(255) NOT NULL,
	"category" "change_request_category" NOT NULL,
	"field_name" varchar(100) NOT NULL,
	"old_value" text,
	"new_value" text NOT NULL,
	"change_data" jsonb,
	"status" "change_request_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar(255),
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_audit_log" (
	"id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" varchar(255) NOT NULL,
	"action" varchar(50) NOT NULL,
	"changes" text,
	"user_id" varchar(255),
	"user_email" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assigned_systems" (
	"id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" varchar(100) NOT NULL,
	"user_id" varchar(255),
	"user_name" text NOT NULL,
	"user_email" varchar(255),
	"ram" text,
	"storage" text,
	"processor" text,
	"generation" text,
	"status" "system_status" DEFAULT 'assigned' NOT NULL,
	"assigned_date" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" varchar(100) NOT NULL,
	"vendor" text NOT NULL,
	"purchase_date" timestamp with time zone NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"items" text NOT NULL,
	"file_name" text,
	"file_type" varchar(100),
	"file_path" text,
	"file_data" text,
	"status" "invoice_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procurement_items" (
	"id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"vendor" text NOT NULL,
	"purchase_date" timestamp with time zone NOT NULL,
	"status" "procurement_status" DEFAULT 'pending' NOT NULL,
	"assigned_to" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "received_items" (
	"id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"received_date" timestamp with time zone NOT NULL,
	"category" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_items" (
	"id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "stock_category" DEFAULT 'Other' NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"available" integer DEFAULT 0 NOT NULL,
	"faulty" integer DEFAULT 0 NOT NULL,
	"description" text,
	"min_stock" integer DEFAULT 5 NOT NULL,
	"location" text DEFAULT 'IT Storage',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_number" varchar(50) NOT NULL,
	"asset_id" varchar(255),
	"asset_name" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" "ticket_priority" DEFAULT 'medium' NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"created_by_id" varchar(255),
	"created_by_name" text NOT NULL,
	"created_by_email" varchar(255),
	"created_by_department" text,
	"assigned_to_id" varchar(255),
	"assigned_to_name" text,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assigned_systems" ADD CONSTRAINT "assigned_systems_user_id_employees_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_asset_id_assigned_systems_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assigned_systems"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_id_employees_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_work_email_unique" ON "employees" USING btree ("work_email");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_employee_id_unique" ON "employees" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employees_manager_id_idx" ON "employees" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "employees_department_idx" ON "employees" USING btree ("department");--> statement-breakpoint
CREATE INDEX "employees_employment_status_idx" ON "employees" USING btree ("employment_status");--> statement-breakpoint
CREATE INDEX "employees_location_idx" ON "employees" USING btree ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "change_requests_requester_idx" ON "change_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "change_requests_employee_idx" ON "change_requests" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "change_requests_status_idx" ON "change_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "asset_audit_log_entity_type_idx" ON "asset_audit_log" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "asset_audit_log_entity_id_idx" ON "asset_audit_log" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "asset_audit_log_user_id_idx" ON "asset_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "asset_audit_log_created_at_idx" ON "asset_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "assigned_systems_asset_id_unique" ON "assigned_systems" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "assigned_systems_user_id_idx" ON "assigned_systems" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "assigned_systems_status_idx" ON "assigned_systems" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_invoice_number_unique" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_vendor_idx" ON "invoices" USING btree ("vendor");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_purchase_date_idx" ON "invoices" USING btree ("purchase_date");--> statement-breakpoint
CREATE INDEX "procurement_items_vendor_idx" ON "procurement_items" USING btree ("vendor");--> statement-breakpoint
CREATE INDEX "procurement_items_status_idx" ON "procurement_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "procurement_items_purchase_date_idx" ON "procurement_items" USING btree ("purchase_date");--> statement-breakpoint
CREATE INDEX "received_items_category_idx" ON "received_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "received_items_received_date_idx" ON "received_items" USING btree ("received_date");--> statement-breakpoint
CREATE INDEX "stock_items_category_idx" ON "stock_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "stock_items_name_idx" ON "stock_items" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "support_tickets_ticket_number_unique" ON "support_tickets" USING btree ("ticket_number");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "support_tickets_priority_idx" ON "support_tickets" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "support_tickets_created_by_id_idx" ON "support_tickets" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "support_tickets_assigned_to_id_idx" ON "support_tickets" USING btree ("assigned_to_id");
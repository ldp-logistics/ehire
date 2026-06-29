-- Re-add Invoices section for asset management (purchase invoices for IT/asset tracking).

CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'paid', 'overdue', 'cancelled');

CREATE TABLE "invoices" (
  "id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_number" varchar(100) NOT NULL,
  "vendor" text NOT NULL,
  "purchase_date" timestamp with time zone NOT NULL,
  "total_amount" numeric(12, 2) DEFAULT 0 NOT NULL,
  "items" text NOT NULL,
  "file_name" text,
  "file_type" varchar(100),
  "file_path" text,
  "status" "invoice_status" DEFAULT 'pending' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "invoices_invoice_number_unique" ON "invoices" USING btree ("invoice_number");
CREATE INDEX "invoices_vendor_idx" ON "invoices" USING btree ("vendor");
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");
CREATE INDEX "invoices_purchase_date_idx" ON "invoices" USING btree ("purchase_date");

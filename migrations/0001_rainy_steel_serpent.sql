CREATE TYPE "public"."ticket_comment_author_role" AS ENUM('employee', 'it_support', 'admin');--> statement-breakpoint
CREATE TABLE "ticket_comments" (
	"id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"author_id" varchar(255),
	"author_name" text NOT NULL,
	"author_email" varchar(255),
	"author_role" "ticket_comment_author_role" DEFAULT 'employee' NOT NULL,
	"is_status_update" text DEFAULT 'false',
	"old_status" "ticket_status",
	"new_status" "ticket_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_author_id_employees_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_comments_ticket_id_idx" ON "ticket_comments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_comments_author_id_idx" ON "ticket_comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "ticket_comments_created_at_idx" ON "ticket_comments" USING btree ("created_at");
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, pgEnum, jsonb, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";
import { employees } from "./employees";

// Enum for change request status
export const changeRequestStatusEnum = pgEnum("change_request_status", [
  "pending",    // Awaiting review
  "approved",   // Approved and applied
  "rejected",   // Rejected by HR/Admin
]);

// Enum for change request category
export const changeRequestCategoryEnum = pgEnum("change_request_category", [
  "personal_details",   // DOB, marital status, etc.
  "address",            // Home address
  "contact",            // Phone, personal email
  "dependents",         // Dependent information
  "emergency_contacts", // Emergency contact info
  "bank_details",       // Banking information
]);

export const changeRequests = pgTable(
  "change_requests",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    
    // Who requested
    requesterId: varchar("requester_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "restrict" }), // User who made request
    employeeId: varchar("employee_id", { length: 255 }).notNull().references(() => employees.id, { onDelete: "cascade" }),   // Employee record being changed
    
    // What's being changed
    category: changeRequestCategoryEnum("category").notNull(),
    fieldName: varchar("field_name", { length: 100 }).notNull(),     // e.g., "dob", "city"
    oldValue: text("old_value"),                                      // Previous value
    newValue: text("new_value").notNull(),                           // Requested new value
    
    // For complex changes (multiple fields at once)
    changeData: jsonb("change_data"), // { field1: newVal1, field2: newVal2, ... }
    
    // Status
    status: changeRequestStatusEnum("status").notNull().default("pending"),
    
    // Approval tracking
    reviewedBy: varchar("reviewed_by", { length: 255 }).references(() => users.id, { onDelete: "set null" }),  // User who approved/rejected
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),                    // Reason for rejection, etc.
    
    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    requesterIdx: index("change_requests_requester_idx").on(table.requesterId),
    employeeIdx: index("change_requests_employee_idx").on(table.employeeId),
    statusIdx: index("change_requests_status_idx").on(table.status),
  })
);

// Relations
export const changeRequestsRelations = relations(changeRequests, ({ one }) => ({
  requester: one(users, {
    fields: [changeRequests.requesterId],
    references: [users.id],
    relationName: "requester",
  }),
  employee: one(employees, {
    fields: [changeRequests.employeeId],
    references: [employees.id],
  }),
  reviewer: one(users, {
    fields: [changeRequests.reviewedBy],
    references: [users.id],
    relationName: "reviewer",
  }),
}));

// Zod schemas
export const insertChangeRequestSchema = createInsertSchema(changeRequests, {
  category: z.enum(["personal_details", "address", "contact", "dependents", "emergency_contacts", "bank_details"]),
  fieldName: z.string().min(1),
  newValue: z.string(),
});

export const updateChangeRequestSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewNotes: z.string().optional(),
});

export type InsertChangeRequest = z.infer<typeof insertChangeRequestSchema>;
export type ChangeRequest = typeof changeRequests.$inferSelect;

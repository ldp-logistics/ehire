import { sql } from "drizzle-orm";
import { pgTable, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { employees } from "./employees";

/**
 * Documents linked to an employee (e.g. from tentative verification).
 * When a candidate is confirmed hire, verified tentative_documents are copied here so they appear on the employee profile.
 */
export const employeeDocuments = pgTable(
  "employee_documents",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id", { length: 255 })
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    documentType: varchar("document_type", { length: 100 }).notNull(),
    displayName: text("display_name"),
    fileUrl: text("file_url"),
    fileName: text("file_name"),
    source: varchar("source", { length: 50 }).notNull().default("tentative_verification"),
    tentativeDocumentId: varchar("tentative_document_id", { length: 255 }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_employee_docs_employee_id").on(table.employeeId),
    index("idx_employee_docs_source").on(table.source),
  ]
);

export const employeeDocumentsRelations = relations(employeeDocuments, ({ one }) => ({
  employee: one(employees, { fields: [employeeDocuments.employeeId], references: [employees.id] }),
}));

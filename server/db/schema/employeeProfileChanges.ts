import { sql } from "drizzle-orm";
import { pgTable, varchar, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { employees } from "./employees";
import { users } from "./users";

/**
 * Audit log for employee profile updates (PATCH /api/employees/:id).
 * Each row = one save; changed_fields lists which fields were updated.
 * Used by GET /api/employees/:id/timeline to show "Profile updated" events.
 */
export const employeeProfileChanges = pgTable(
  "employee_profile_changes",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id", { length: 255 })
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    changedBy: varchar("changed_by", { length: 255 }).notNull().references(() => users.id, { onDelete: "restrict" }), // user id who made the update
    changedFields: jsonb("changed_fields").$type<string[]>().notNull(), // e.g. ["department", "job_title", "manager_id"]
  },
  (table) => ({
    employeeIdx: index("employee_profile_changes_employee_id_idx").on(table.employeeId),
    changedAtIdx: index("employee_profile_changes_changed_at_idx").on(table.changedAt),
  })
);

export const employeeProfileChangesRelations = relations(employeeProfileChanges, ({ one }) => ({
  employee: one(employees, { fields: [employeeProfileChanges.employeeId], references: [employees.id] }),
  changedByUser: one(users, { fields: [employeeProfileChanges.changedBy], references: [users.id] }),
}));

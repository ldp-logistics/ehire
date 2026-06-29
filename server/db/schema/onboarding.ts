import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, index, pgEnum, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { employees } from "./employees";
import { users } from "./users";

// Enum for onboarding status
export const onboardingStatusEnum = pgEnum("onboarding_status", ["in_progress", "completed"]);

export const onboardingRecords = pgTable(
  "onboarding_records",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    // Link to employee (nullable when hire is pre-employee)
    employeeId: varchar("employee_id", { length: 255 }).references(() => employees.id, { onDelete: "set null" }),

    // Owner (IT Admin) who manages this onboarding
    ownerId: varchar("owner_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),

    // Pre-employee info (when employee_id is null)
    hireName: text("hire_name"),
    hireRole: text("hire_role"),
    hireDepartment: text("hire_department"),
    hireEmail: varchar("hire_email", { length: 255 }),
    startDate: timestamp("start_date", { withTimezone: true }),

    // Status & progress
    status: onboardingStatusEnum("status").notNull().default("in_progress"),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdIdx: index("onboarding_records_employee_id_idx").on(table.employeeId),
    ownerIdIdx: index("onboarding_records_owner_id_idx").on(table.ownerId),
    statusIdx: index("onboarding_records_status_idx").on(table.status),
    startDateIdx: index("onboarding_records_start_date_idx").on(table.startDate),
  })
);

export const onboardingTasks = pgTable(
  "onboarding_tasks",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    onboardingRecordId: varchar("onboarding_record_id", { length: 255 })
      .notNull()
      .references(() => onboardingRecords.id, { onDelete: "cascade" }),

    taskName: text("task_name").notNull(),
    category: text("category").notNull().default("Company-wide"),
    completed: boolean("completed").notNull().default(false),
    assignmentDetails: text("assignment_details"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    recordIdIdx: index("onboarding_tasks_record_id_idx").on(table.onboardingRecordId),
    completedIdx: index("onboarding_tasks_completed_idx").on(table.completed),
  })
);

// Relations
export const onboardingRecordsRelations = relations(onboardingRecords, ({ one, many }) => ({
  employee: one(employees, {
    fields: [onboardingRecords.employeeId],
    references: [employees.id],
  }),
  owner: one(users, {
    fields: [onboardingRecords.ownerId],
    references: [users.id],
  }),
  tasks: many(onboardingTasks),
}));

export const onboardingTasksRelations = relations(onboardingTasks, ({ one }) => ({
  onboardingRecord: one(onboardingRecords, {
    fields: [onboardingTasks.onboardingRecordId],
    references: [onboardingRecords.id],
  }),
}));

// Zod schemas
export const insertOnboardingRecordSchema = createInsertSchema(onboardingRecords, {
  employeeId: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  hireName: z.string().optional().nullable(),
  hireRole: z.string().optional().nullable(),
  hireDepartment: z.string().optional().nullable(),
  hireEmail: z.string().email().optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  status: z.enum(["in_progress", "completed"]).optional(),
  completedAt: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const insertOnboardingTaskSchema = createInsertSchema(onboardingTasks, {
  taskName: z.string().min(1, "Task name is required"),
  category: z.string().optional(),
  completed: z.boolean().optional(),
  assignmentDetails: z.string().optional().nullable(),
  completedAt: z.coerce.date().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export type OnboardingRecord = typeof onboardingRecords.$inferSelect;
export type InsertOnboardingRecord = z.infer<typeof insertOnboardingRecordSchema>;
export type OnboardingTask = typeof onboardingTasks.$inferSelect;
export type InsertOnboardingTask = z.infer<typeof insertOnboardingTaskSchema>;

import { sql } from "drizzle-orm";
import {
  pgTable, text, varchar, timestamp, pgEnum, index,
  integer, boolean, date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { employees } from "./employees";

// ==================== ENUMS ====================

export const offboardingTypeEnum = pgEnum("offboarding_type", [
  "resignation",
  "termination",
  "contract_end",
]);

export const offboardingStatusEnum = pgEnum("offboarding_status", [
  "initiated",
  "in_notice",
  "completed",
  "cancelled",
]);

export const offboardingTaskTypeEnum = pgEnum("offboarding_task_type", [
  "asset_return",
  "handover",
  "knowledge_transfer",
  "final_settlement",
  "exit_interview",
]);

export const offboardingTaskStatusEnum = pgEnum("offboarding_task_status", [
  "pending",
  "completed",
  "waived",
]);

// ==================== OFFBOARDING RECORDS TABLE ====================

/**
 * One record per offboarding event.
 * employee_id is unique-per-active-offboarding — a cancelled record
 * frees the employee for future offboarding.
 */
export const offboardingRecords = pgTable(
  "offboarding_records",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    employeeId: varchar("employee_id", { length: 255 })
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    initiatedBy: varchar("initiated_by", { length: 255 })
      .references(() => employees.id, { onDelete: "set null" }), // nullable when initiator has no employee (e.g. admin/HR-only user)

    offboardingType: offboardingTypeEnum("offboarding_type").notNull(),
    reason: text("reason"),

    noticeRequired: boolean("notice_required").notNull().default(false),
    noticePeriodDays: integer("notice_period_days"),

    initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Date the employee submitted resignation (may be before exit / last working day). */
    resignationDate: date("resignation_date"),
    exitDate: date("exit_date").notNull(),

    status: offboardingStatusEnum("status").notNull().default("initiated"),

    completedAt: timestamp("completed_at", { withTimezone: true }),
    remarks: text("remarks"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdx: index("offboarding_records_employee_id_idx").on(table.employeeId),
    statusIdx: index("offboarding_records_status_idx").on(table.status),
    exitDateIdx: index("offboarding_records_exit_date_idx").on(table.exitDate),
  })
);

// ==================== OFFBOARDING TASKS TABLE ====================

/**
 * Checklist items generated on offboarding initiation.
 * Asset-return tasks are auto-created from assigned_systems.
 */
export const offboardingTasks = pgTable(
  "offboarding_tasks",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    offboardingId: varchar("offboarding_id", { length: 255 })
      .notNull()
      .references(() => offboardingRecords.id, { onDelete: "cascade" }),

    taskType: offboardingTaskTypeEnum("task_type").notNull(),

    title: text("title").notNull(),

    assignedTo: varchar("assigned_to", { length: 255 })
      .references(() => employees.id, { onDelete: "set null" }),

    status: offboardingTaskStatusEnum("status").notNull().default("pending"),

    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),

    /**
     * For asset_return tasks, stores the assigned_system ID so we can
     * update the asset status on completion.
     */
    relatedAssetId: varchar("related_asset_id", { length: 255 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    offboardingIdx: index("offboarding_tasks_offboarding_id_idx").on(table.offboardingId),
    statusIdx: index("offboarding_tasks_status_idx").on(table.status),
  })
);

// ==================== OFFBOARDING AUDIT LOG ====================

/**
 * Append-only audit trail for offboarding actions:
 * initiation, exit date changes, task updates, completion, cancellation.
 */
export const offboardingAuditLog = pgTable(
  "offboarding_audit_log",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    offboardingId: varchar("offboarding_id", { length: 255 })
      .notNull()
      .references(() => offboardingRecords.id, { onDelete: "cascade" }),

    action: varchar("action", { length: 50 }).notNull(), // initiate, update_exit_date, complete_task, waive_task, complete, cancel
    performedBy: varchar("performed_by", { length: 255 }),
    details: text("details"), // Human-readable description
    previousValue: text("previous_value"),
    newValue: text("new_value"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    offboardingIdx: index("offboarding_audit_offboarding_id_idx").on(table.offboardingId),
    actionIdx: index("offboarding_audit_action_idx").on(table.action),
  })
);

// ==================== RELATIONS ====================

export const offboardingRecordsRelations = relations(offboardingRecords, ({ one, many }) => ({
  employee: one(employees, {
    fields: [offboardingRecords.employeeId],
    references: [employees.id],
    relationName: "offboardingEmployee",
  }),
  initiator: one(employees, {
    fields: [offboardingRecords.initiatedBy],
    references: [employees.id],
    relationName: "offboardingInitiator",
  }),
  tasks: many(offboardingTasks),
  auditLog: many(offboardingAuditLog),
}));

export const offboardingTasksRelations = relations(offboardingTasks, ({ one }) => ({
  offboarding: one(offboardingRecords, {
    fields: [offboardingTasks.offboardingId],
    references: [offboardingRecords.id],
  }),
  assignee: one(employees, {
    fields: [offboardingTasks.assignedTo],
    references: [employees.id],
  }),
}));

export const offboardingAuditLogRelations = relations(offboardingAuditLog, ({ one }) => ({
  offboarding: one(offboardingRecords, {
    fields: [offboardingAuditLog.offboardingId],
    references: [offboardingRecords.id],
  }),
}));

// ==================== ZOD SCHEMAS ====================

export const insertOffboardingRecordSchema = createInsertSchema(offboardingRecords, {
  employeeId: z.string().min(1, "Employee is required"),
  initiatedBy: z.string().min(1, "Initiator is required").optional().nullable(),
  offboardingType: z.enum(["resignation", "termination", "contract_end"]),
  reason: z.string().optional().nullable(),
  noticeRequired: z.boolean(),
  noticePeriodDays: z.coerce.number().int().min(0).optional().nullable(),
  exitDate: z.string().min(1, "Exit date is required"),
  status: z.enum(["initiated", "in_notice", "completed", "cancelled"]).optional(),
  remarks: z.string().optional().nullable(),
});

export const insertOffboardingTaskSchema = createInsertSchema(offboardingTasks, {
  offboardingId: z.string().min(1),
  taskType: z.enum(["asset_return", "handover", "knowledge_transfer", "final_settlement", "exit_interview"]),
  title: z.string().min(1),
  assignedTo: z.string().optional().nullable(),
  status: z.enum(["pending", "completed", "waived"]).optional(),
  notes: z.string().optional().nullable(),
  relatedAssetId: z.string().optional().nullable(),
});

// ==================== TYPES ====================

export type OffboardingRecord = typeof offboardingRecords.$inferSelect;
export type InsertOffboardingRecord = z.infer<typeof insertOffboardingRecordSchema>;
export type OffboardingTask = typeof offboardingTasks.$inferSelect;
export type InsertOffboardingTask = z.infer<typeof insertOffboardingTaskSchema>;
export type OffboardingAuditLog = typeof offboardingAuditLog.$inferSelect;

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, pgEnum, index, integer, time, boolean, date, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { employees } from "./employees";

// ==================== ENUMS ====================

/**
 * Attendance source tracks HOW the record was created.
 * "biometric" is reserved for V2 — no device logic is implemented yet,
 * but including it now means the enum won't need a migration later.
 */
export const attendanceSourceEnum = pgEnum("attendance_source", [
  "manual",   // HR/Admin manual entry
  "web",      // Employee self-service via browser
  "mobile",   // Future mobile app
  "biometric" // V2: biometric device ingest
]);

/**
 * Attendance status is derived from shift timing comparison,
 * but stored for query performance. Updated on check-out or daily cron.
 */
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "late",
  "half_day",
  "absent",
  "weekend",
  "holiday",
  "short_hours",
  "missed_checkout",
  "invalid_punch",
]);

export const attendanceAuditActionEnum = pgEnum("attendance_audit_action", [
  "create",
  "update",
  "delete",
]);

/** Legal / payroll audit (migration 0081); immutable rows */
export const attendanceAuditLogActionEnum = pgEnum("attendance_audit_log_action", [
  "create",
  "update",
  "auto_checkout",
  "manual_edit",
]);

// ==================== SHIFTS TABLE ====================

export const shifts = pgTable(
  "shifts",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),                          // e.g. "Morning Shift"
    startTime: time("start_time").notNull(),               // e.g. "09:00"
    endTime: time("end_time").notNull(),                   // e.g. "17:00"
    graceMinutes: integer("grace_minutes").notNull().default(15),
    /**
     * Weekly pattern as JSON array of booleans [Mon..Sun].
     * e.g. [true,true,true,true,true,false,false] = Mon-Fri
     */
    weeklyPattern: jsonb("weekly_pattern").notNull().default(sql`'[true,true,true,true,true,false,false]'`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

// ==================== EMPLOYEE SHIFTS TABLE ====================

export const employeeShifts = pgTable(
  "employee_shifts",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id", { length: 255 }).notNull().references(() => employees.id, { onDelete: "cascade" }),
    shiftId: varchar("shift_id", { length: 255 }).notNull().references(() => shifts.id, { onDelete: "cascade" }),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),                     // null = still active
    /** When true, use shift start/end/grace/weekly pattern instead of org_timesheet_policy hours */
    useShiftOverride: boolean("use_shift_override").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_employee_shifts_employee").on(table.employeeId),
    index("idx_employee_shifts_shift").on(table.shiftId),
  ]
);

// ==================== ATTENDANCE RECORDS TABLE ====================

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id", { length: 255 }).notNull().references(() => employees.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    checkInTime: timestamp("check_in_time", { withTimezone: true }),
    checkOutTime: timestamp("check_out_time", { withTimezone: true }),
    /**
     * Source is device-agnostic — "biometric" reserved for V2.
     * When biometric devices are integrated, they POST to /attendance/ingest
     * with source="biometric" and the same schema works unchanged.
     */
    source: attendanceSourceEnum("source").notNull().default("web"),
    /**
     * Status is derived from shift timing but stored for fast reporting.
     * Recalculated on check-in (late detection) and check-out (half_day).
     */
    status: attendanceStatusEnum("status").notNull().default("present"),
    remarks: text("remarks"),
    createdBy: varchar("created_by", { length: 255 }),     // user ID of who created
    /** Frozen timing rules at check-in; status/checkout use this when set */
    policySnapshot: jsonb("policy_snapshot"),
    isAutoCheckout: boolean("is_auto_checkout").notNull().default(false),
    missedCheckout: boolean("missed_checkout").notNull().default(false),
    autoCheckoutAt: timestamp("auto_checkout_at", { withTimezone: true }),
    isOvertimeApproved: boolean("is_overtime_approved").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: varchar("deleted_by_user_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_attendance_employee").on(table.employeeId),
    index("idx_attendance_date").on(table.date),
    index("idx_attendance_employee_date").on(table.employeeId, table.date),
  ]
);

/** Org-wide calendar (global or per ISO country code). */
export const orgHolidays = pgTable(
  "org_holidays",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`(gen_random_uuid())::text`),
    holidayDate: date("holiday_date").notNull(),
    countryCode: varchar("country_code", { length: 2 }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_org_holidays_date").on(table.holidayDate),
    index("idx_org_holidays_date_country").on(table.holidayDate, table.countryCode),
  ]
);

// ==================== ATTENDANCE AUDIT TABLE ====================

/**
 * Append-only audit trail. Every create/update to attendance_records
 * gets a corresponding row here for compliance.
 */
export const attendanceAudit = pgTable(
  "attendance_audit",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    attendanceId: varchar("attendance_id", { length: 255 }).notNull().references(() => attendanceRecords.id, { onDelete: "cascade" }),
    action: attendanceAuditActionEnum("action").notNull(),
    performedBy: varchar("performed_by", { length: 255 }),
    reason: text("reason"),
    changes: jsonb("changes"),                             // { field: [old, new] }
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_attendance").on(table.attendanceId),
  ]
);

export const attendanceAuditLogs = pgTable(
  "attendance_audit_logs",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`(gen_random_uuid())::text`),
    attendanceId: varchar("attendance_id", { length: 255 }).notNull()
      .references(() => attendanceRecords.id, { onDelete: "cascade" }),
    action: attendanceAuditLogActionEnum("action").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    changedByUserId: varchar("changed_by_user_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_attendance_audit_logs_attendance").on(table.attendanceId, table.createdAt)]
);

// ==================== RELATIONS ====================

export const shiftsRelations = relations(shifts, ({ many }) => ({
  employeeShifts: many(employeeShifts),
}));

export const employeeShiftsRelations = relations(employeeShifts, ({ one }) => ({
  employee: one(employees, { fields: [employeeShifts.employeeId], references: [employees.id] }),
  shift: one(shifts, { fields: [employeeShifts.shiftId], references: [shifts.id] }),
}));

export const attendanceRecordsRelations = relations(attendanceRecords, ({ one, many }) => ({
  employee: one(employees, { fields: [attendanceRecords.employeeId], references: [employees.id] }),
  auditTrail: many(attendanceAudit),
  legalAuditLogs: many(attendanceAuditLogs),
}));

export const attendanceAuditRelations = relations(attendanceAudit, ({ one }) => ({
  attendance: one(attendanceRecords, { fields: [attendanceAudit.attendanceId], references: [attendanceRecords.id] }),
}));

export const attendanceAuditLogsRelations = relations(attendanceAuditLogs, ({ one }) => ({
  attendance: one(attendanceRecords, { fields: [attendanceAuditLogs.attendanceId], references: [attendanceRecords.id] }),
}));

// ==================== INSERT SCHEMAS ====================

export const insertShiftSchema = createInsertSchema(shifts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmployeeShiftSchema = createInsertSchema(employeeShifts).omit({
  id: true,
  createdAt: true,
});

export const insertAttendanceRecordSchema = createInsertSchema(attendanceRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

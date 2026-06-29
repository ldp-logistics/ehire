import { sql } from "drizzle-orm";
import {
  pgTable, text, varchar, timestamp, pgEnum, index, uniqueIndex,
  integer, boolean, date, jsonb, decimal,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { employees } from "./employees";

// ==================== ENUMS ====================

export const leaveAccrualTypeEnum = pgEnum("leave_accrual_type", [
  "monthly",
  "yearly",
  "none",
]);

export const leaveRequestStatusEnum = pgEnum("leave_request_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export const leaveDayTypeEnum = pgEnum("leave_day_type", [
  "full",
  "half",
  "first_half",
  "second_half",
]);

export const leaveApprovalStatusEnum = pgEnum("leave_approval_status", [
  "pending",
  "approved",
  "rejected",
]);

export const leaveApproverRoleEnum = pgEnum("leave_approver_role", [
  "manager",
  "hr",
  "admin",
]);

// ==================== LEAVE POLICIES TABLE ====================

/**
 * A policy defines who it applies to (by department and/or employment type).
 * Multiple policies can exist; assignment logic picks the best match.
 */
export const leavePolicies = pgTable(
  "leave_policies",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    name: text("name").notNull(),

    /** JSON array of department names this policy applies to. Empty = all departments. */
    applicableDepartments: jsonb("applicable_departments").notNull().default(sql`'[]'`),

    /** JSON array of employee types. Empty = all types. */
    applicableEmploymentTypes: jsonb("applicable_employment_types").notNull().default(sql`'[]'`),

    /** JSON array of user roles that can use this policy for leave. Empty = all roles (employee, manager, hr, admin). */
    applicableRoles: jsonb("applicable_roles").notNull().default(sql`'[]'`),

    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"), // null = no end

    /** Optional display year e.g. 2025 for "Leave Policy 2025". */
    policyYear: integer("policy_year"),

    isActive: boolean("is_active").notNull().default(true),

    /** Whether this is the fallback/default policy when no other policy matches. */
    isDefault: boolean("is_default").notNull().default(false),

    /** Time-off unit: 'days' | 'hours'. Affects display and accrual math for hourly staff. */
    unit: varchar("unit", { length: 10 }).notNull().default("days"),

    /**
     * JSON array of weekday numbers that count as working days (0=Sun…6=Sat).
     * Default [1,2,3,4,5] = Mon–Fri. Set [0,1,2,3,4] for Sun–Thu (Middle East).
     */
    workweek: jsonb("workweek").notNull().default(sql`'[1,2,3,4,5]'`),

    /** Optional named holiday calendar (e.g. "Pakistan Holidays"). Informational for now; drives getHolidaysBetween scope later. */
    holidayCalendarName: text("holiday_calendar_name"),

    /** Policy period start month (1–12). Default 1 = January. Affects year-end reset logic. */
    periodStartMonth: integer("period_start_month").notNull().default(1),

    createdBy: varchar("created_by", { length: 255 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    activeIdx: index("leave_policies_active_idx").on(table.isActive),
    defaultIdx: index("leave_policies_default_idx").on(table.isDefault),
  })
);

// ==================== LEAVE TYPES TABLE ====================

/**
 * Belongs to a leave_policy. Defines the rules for a specific leave category.
 * e.g. "Annual Leave", "Sick Leave", "WFH", "Unpaid Leave", etc.
 */
export const leaveTypes = pgTable(
  "leave_types",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    policyId: varchar("policy_id", { length: 255 })
      .notNull()
      .references(() => leavePolicies.id, { onDelete: "cascade" }),

    name: text("name").notNull(), // Annual, Sick, Casual, Unpaid, WFH, etc.
    paid: boolean("paid").notNull().default(true),

    accrualType: leaveAccrualTypeEnum("accrual_type").notNull().default("yearly"),
    /** Rate per accrual period. e.g. 1.75 per month = 21 per year. Null if accrual_type = none. */
    accrualRate: decimal("accrual_rate", { precision: 6, scale: 2 }),

    maxBalance: integer("max_balance").notNull().default(21),

    carryForwardAllowed: boolean("carry_forward_allowed").notNull().default(false),
    /** Max days carried forward. Null = unlimited. */
    maxCarryForward: integer("max_carry_forward"),

    requiresDocument: boolean("requires_document").notNull().default(false),
    requiresApproval: boolean("requires_approval").notNull().default(true),

    /**
     * JSON rules for auto-approval. Null = no auto-approve.
     * Example: { "maxDays": 1, "dayTypes": ["full","half"] }
     * If request matches, it auto-approves without manager step.
     */
    autoApproveRules: jsonb("auto_approve_rules"),

    /**
     * Whether HR approval is always required (in addition to manager).
     * Used for certain leave types or notice-period restrictions.
     */
    hrApprovalRequired: boolean("hr_approval_required").notNull().default(false),

    /** Min consecutive days for this leave type (e.g. 5 for annual). Null = no minimum. */
    minDays: integer("min_days"),
    /** Max consecutive days per request. Null = no max. */
    maxDaysPerRequest: integer("max_days_per_request"),

    /** Whether this leave type is blocked during notice period. */
    blockedDuringNotice: boolean("blocked_during_notice").notNull().default(false),

    // ── Accrual rules ──
    /** Pro-rate balance for employees joining mid-period or leaving before period end. */
    prorationRequired: boolean("proration_required").notNull().default(false),

    // ── Balance rules ──
    /** Allow employees to submit requests even when balance is 0 (negative/advance balance). */
    allowNegativeBalance: boolean("allow_negative_balance").notNull().default(false),
    /** Days after which carried-over balance expires into the new period. Null = no expiry. */
    carryoverExpiryDays: integer("carryover_expiry_days"),

    // ── Request rules ──
    /** Max days in the past an employee can back-date a request. Null = no restriction. */
    backdatingLimitDays: integer("backdating_limit_days"),
    /** Minimum days' notice required before leave starts. Null = no restriction. */
    minNoticeDays: integer("min_notice_days"),
    /**
     * If set, a supporting document is mandatory when total_days > this value.
     * Works alongside requires_document (either condition triggers the requirement).
     */
    mandatoryAttachmentAboveDays: integer("mandatory_attachment_above_days"),
    /** Whether HR/Admin must also attach a document when applying on behalf of an employee. */
    mandatoryAttachmentOnBehalf: boolean("mandatory_attachment_on_behalf").notNull().default(false),

    // ── Additional rules ──
    /** Waiting period after join date (in days) before this leave type can be used. Null = no waiting period. */
    waitingPeriodDays: integer("waiting_period_days"),

    /**
     * Compensation / comp-off leave: balance starts at 0, HR or manager adds days when employee
     * works on a holiday or off day. No auto accrual, no carry forward, no encashment.
     */
    isCompensationLeave: boolean("is_compensation_leave").notNull().default(false),

    color: varchar("color", { length: 20 }).default("#3b82f6"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    policyIdx: index("leave_types_policy_id_idx").on(table.policyId),
  })
);

// ==================== EMPLOYEE LEAVE BALANCES TABLE ====================

/**
 * Auto-generated per employee per leave type.
 * Balance is updated on accrual, leave approval, cancellation, and HR override.
 */
export const employeeLeaveBalances = pgTable(
  "employee_leave_balances",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    employeeId: varchar("employee_id", { length: 255 })
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    leaveTypeId: varchar("leave_type_id", { length: 255 })
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "cascade" }),

    balance: decimal("balance", { precision: 6, scale: 2 }).notNull().default("0"),
    used: decimal("used", { precision: 6, scale: 2 }).notNull().default("0"),

    lastAccrualAt: timestamp("last_accrual_at", { withTimezone: true }),
    /** Set when year-end reset was last run for this balance (idempotency). */
    lastResetAt: timestamp("last_reset_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdx: index("leave_balances_employee_id_idx").on(table.employeeId),
    leaveTypeIdx: index("leave_balances_leave_type_id_idx").on(table.leaveTypeId),
    uniqueBalance: uniqueIndex("leave_balances_employee_leave_type_unique").on(table.employeeId, table.leaveTypeId),
  })
);

// ==================== LEAVE REQUESTS TABLE ====================

/**
 * Core transactional table. One row per leave request.
 * May span multiple days. Balance is deducted on approval, restored on cancellation.
 */
export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    employeeId: varchar("employee_id", { length: 255 })
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    leaveTypeId: varchar("leave_type_id", { length: 255 })
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "cascade" }),

    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    dayType: leaveDayTypeEnum("day_type").notNull().default("full"),

    /** Calculated number of leave days (half = 0.5, full = 1.0 per day) */
    totalDays: decimal("total_days", { precision: 5, scale: 1 }).notNull(),

    reason: text("reason"),
    attachmentUrl: text("attachment_url"),

    status: leaveRequestStatusEnum("status").notNull().default("pending"),

    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: varchar("decided_by", { length: 255 }),
    rejectionReason: text("rejection_reason"),

    /** FreshTeam time_offs.id for migration idempotency and re-sync. */
    freshteamTimeOffId: varchar("freshteam_time_off_id", { length: 32 }),

    /** Snapshot at apply time: policyName, leaveTypeName, maxBalance, paid, requiresApproval. Display only. */
    policySnapshot: jsonb("policy_snapshot"),

    /** pending | synced | failed — for attendance sync retry. */
    attendanceSyncStatus: varchar("attendance_sync_status", { length: 20 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdx: index("leave_requests_employee_id_idx").on(table.employeeId),
    statusIdx: index("leave_requests_status_idx").on(table.status),
    dateRangeIdx: index("leave_requests_date_range_idx").on(table.startDate, table.endDate),
    freshteamTimeOffIdIdx: index("leave_requests_freshteam_time_off_id_idx").on(table.freshteamTimeOffId),
  })
);

// ==================== LEAVE APPROVALS TABLE ====================

/**
 * Tracks the approval chain. One row per approver per request.
 * Manager first, then HR/admin if required.
 */
export const leaveApprovals = pgTable(
  "leave_approvals",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    leaveRequestId: varchar("leave_request_id", { length: 255 })
      .notNull()
      .references(() => leaveRequests.id, { onDelete: "cascade" }),

    approverId: varchar("approver_id", { length: 255 })
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    approverRole: leaveApproverRoleEnum("approver_role").notNull(),

    status: leaveApprovalStatusEnum("status").notNull().default("pending"),

    actionedAt: timestamp("actioned_at", { withTimezone: true }),
    remarks: text("remarks"),

    /** Order in the approval chain (1 = first, 2 = second, etc.) */
    stepOrder: integer("step_order").notNull().default(1),

    /** When HR/Admin acts on behalf of approver_id, who actually acted (employee id). */
    actedById: varchar("acted_by_id", { length: 255 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    requestIdx: index("leave_approvals_request_id_idx").on(table.leaveRequestId),
    approverIdx: index("leave_approvals_approver_id_idx").on(table.approverId),
    statusIdx: index("leave_approvals_status_idx").on(table.status),
  })
);

// ==================== LEAVE AUDIT LOG ====================

/**
 * Append-only audit trail for leave operations:
 * policy changes, balance adjustments, request actions, approval actions.
 */
export const leaveAuditLog = pgTable(
  "leave_audit_log",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    entityType: varchar("entity_type", { length: 50 }).notNull(), // policy, type, balance, request, approval
    entityId: varchar("entity_id", { length: 255 }).notNull(),
    action: varchar("action", { length: 50 }).notNull(), // create, update, approve, reject, cancel, adjust, accrue
    performedBy: varchar("performed_by", { length: 255 }),

    metadata: jsonb("metadata"), // Context-specific details

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    entityTypeIdx: index("leave_audit_entity_type_idx").on(table.entityType),
    entityIdIdx: index("leave_audit_entity_id_idx").on(table.entityId),
    actionIdx: index("leave_audit_action_idx").on(table.action),
  })
);

// ==================== YEAR-END SNAPSHOTS (audit/reporting) ====================

export const leaveYearEndSnapshots = pgTable(
  "leave_year_end_snapshots",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id", { length: 255 }).notNull().references(() => employees.id, { onDelete: "cascade" }),
    leaveTypeId: varchar("leave_type_id", { length: 255 }).notNull().references(() => leaveTypes.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    balance: decimal("balance", { precision: 6, scale: 2 }).notNull().default("0"),
    used: decimal("used", { precision: 6, scale: 2 }).notNull().default("0"),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeYearIdx: index("leave_year_end_snapshots_employee_year_idx").on(table.employeeId, table.year),
    leaveTypeYearIdx: index("leave_year_end_snapshots_leave_type_year_idx").on(table.leaveTypeId, table.year),
  })
);

// ==================== HOLIDAYS (business-day calculation) ====================

export const leaveHolidays = pgTable(
  "leave_holidays",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    date: date("date").notNull(),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dateUnique: uniqueIndex("leave_holidays_date_key").on(table.date),
  })
);

// ==================== RELATIONS ====================

export const leavePoliciesRelations = relations(leavePolicies, ({ many }) => ({
  leaveTypes: many(leaveTypes),
}));

export const leaveTypesRelations = relations(leaveTypes, ({ one, many }) => ({
  policy: one(leavePolicies, {
    fields: [leaveTypes.policyId],
    references: [leavePolicies.id],
  }),
  balances: many(employeeLeaveBalances),
  requests: many(leaveRequests),
}));

export const employeeLeaveBalancesRelations = relations(employeeLeaveBalances, ({ one }) => ({
  employee: one(employees, {
    fields: [employeeLeaveBalances.employeeId],
    references: [employees.id],
  }),
  leaveType: one(leaveTypes, {
    fields: [employeeLeaveBalances.leaveTypeId],
    references: [leaveTypes.id],
  }),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ one, many }) => ({
  employee: one(employees, {
    fields: [leaveRequests.employeeId],
    references: [employees.id],
  }),
  leaveType: one(leaveTypes, {
    fields: [leaveRequests.leaveTypeId],
    references: [leaveTypes.id],
  }),
  approvals: many(leaveApprovals),
}));

export const leaveApprovalsRelations = relations(leaveApprovals, ({ one }) => ({
  request: one(leaveRequests, {
    fields: [leaveApprovals.leaveRequestId],
    references: [leaveRequests.id],
  }),
  approver: one(employees, {
    fields: [leaveApprovals.approverId],
    references: [employees.id],
  }),
}));

// ==================== ZOD SCHEMAS ====================

export const insertLeavePolicySchema = createInsertSchema(leavePolicies, {
  name: z.string().min(1, "Policy name is required"),
  applicableDepartments: z.any().optional(),
  applicableEmploymentTypes: z.any().optional(),
  applicableRoles: z.any().optional(),
  effectiveFrom: z.string().min(1, "Effective from date is required"),
  effectiveTo: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  unit: z.enum(["days", "hours"]).optional(),
  workweek: z.any().optional(),
  holidayCalendarName: z.string().optional().nullable(),
  periodStartMonth: z.coerce.number().int().min(1).max(12).optional(),
});

export const insertLeaveTypeSchema = createInsertSchema(leaveTypes, {
  policyId: z.string().min(1),
  name: z.string().min(1, "Leave type name is required"),
  paid: z.boolean(),
  accrualType: z.enum(["monthly", "yearly", "none"]),
  accrualRate: z.coerce.number().optional().nullable(),
  maxBalance: z.coerce.number().int().min(0),
  carryForwardAllowed: z.boolean().optional(),
  maxCarryForward: z.coerce.number().int().optional().nullable(),
  requiresDocument: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  autoApproveRules: z.any().optional().nullable(),
  hrApprovalRequired: z.boolean().optional(),
  minDays: z.coerce.number().int().optional().nullable(),
  maxDaysPerRequest: z.coerce.number().int().optional().nullable(),
  blockedDuringNotice: z.boolean().optional(),
  prorationRequired: z.boolean().optional(),
  allowNegativeBalance: z.boolean().optional(),
  carryoverExpiryDays: z.coerce.number().int().optional().nullable(),
  backdatingLimitDays: z.coerce.number().int().optional().nullable(),
  minNoticeDays: z.coerce.number().int().optional().nullable(),
  mandatoryAttachmentAboveDays: z.coerce.number().int().optional().nullable(),
  mandatoryAttachmentOnBehalf: z.boolean().optional(),
  waitingPeriodDays: z.coerce.number().int().optional().nullable(),
  isCompensationLeave: z.boolean().optional(),
  color: z.string().optional().nullable(),
});

export const insertLeaveRequestSchema = createInsertSchema(leaveRequests, {
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  dayType: z.enum(["full", "half", "first_half", "second_half"]),
  totalDays: z.coerce.number().min(0.5),
  reason: z.string().optional().nullable(),
  attachmentUrl: z.string().optional().nullable(),
});

// ==================== TYPES ====================

export type LeavePolicy = typeof leavePolicies.$inferSelect;
export type InsertLeavePolicy = z.infer<typeof insertLeavePolicySchema>;
export type LeaveType = typeof leaveTypes.$inferSelect;
export type InsertLeaveType = z.infer<typeof insertLeaveTypeSchema>;
export type EmployeeLeaveBalance = typeof employeeLeaveBalances.$inferSelect;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type InsertLeaveRequest = z.infer<typeof insertLeaveRequestSchema>;
export type LeaveApproval = typeof leaveApprovals.$inferSelect;
export type LeaveAuditLog = typeof leaveAuditLog.$inferSelect;

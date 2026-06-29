import { sql } from "drizzle-orm";
import { pgTable, varchar, text, timestamp, numeric, integer, index, jsonb, boolean } from "drizzle-orm/pg-core";
import { z } from "zod";
import { employees } from "./employees";

// ==================== SALARY DETAILS ====================
// Each row = one salary revision for an employee (history preserved)
export const salaryDetails = pgTable(
  "salary_details",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id", { length: 255 }).notNull().references(() => employees.id, { onDelete: "cascade" }),

    // Overview
    annualSalary: numeric("annual_salary", { precision: 12, scale: 2 }).notNull(),
    /** Monthly base (structured breakdown); NULL = legacy FreshTeam import until HR updates */
    baseSalaryMonthly: numeric("base_salary_monthly", { precision: 12, scale: 2 }),
    /** Monthly allowances total (structured breakdown) */
    allowancesMonthly: numeric("allowances_monthly", { precision: 12, scale: 2 }),
    /** [{ label, amount, includeInGross }] — monthly amounts */
    additionalAllowances: jsonb("additional_allowances").notNull().default([]),
    currency: varchar("currency", { length: 10 }).notNull().default("PKR"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    reason: varchar("reason", { length: 255 }), // e.g. "New Inductee", "Annual Appraisal", "Promotion"

    // Additional Details
    payRate: numeric("pay_rate", { precision: 12, scale: 2 }),
    payRatePeriod: varchar("pay_rate_period", { length: 20 }).default("Monthly"), // Monthly, Hourly, Daily
    payoutFrequency: varchar("payout_frequency", { length: 50 }).default("Monthly"),
    payGroup: varchar("pay_group", { length: 100 }),
    payMethod: varchar("pay_method", { length: 50 }).default("Direct Deposit"),
    eligibleWorkHours: varchar("eligible_work_hours", { length: 50 }),
    additionalDetails: text("additional_details"), // e.g. "Base: 63000 Fuel: 7000 probation End: 2 May 2026"
    notes: text("notes"),

    // Who updated
    updatedBy: varchar("updated_by", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdx: index("salary_details_employee_id_idx").on(table.employeeId),
    currentIdx: index("salary_details_is_current_idx").on(table.isCurrent),
  })
);

// ==================== BANKING DETAILS ====================
export const bankingDetails = pgTable(
  "banking_details",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id", { length: 255 }).notNull().references(() => employees.id, { onDelete: "cascade" }),

    bankName: varchar("bank_name", { length: 255 }).notNull(),
    nameOnAccount: varchar("name_on_account", { length: 255 }).notNull(),
    bankCode: varchar("bank_code", { length: 20 }),
    accountNumber: varchar("account_number", { length: 50 }).notNull(),
    iban: varchar("iban", { length: 50 }),
    isPrimary: boolean("is_primary").notNull().default(true),

    updatedBy: varchar("updated_by", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdx: index("banking_details_employee_id_idx").on(table.employeeId),
  })
);

// ==================== BONUSES ====================
export const bonuses = pgTable(
  "bonuses",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id", { length: 255 }).notNull().references(() => employees.id, { onDelete: "cascade" }),

    bonusType: varchar("bonus_type", { length: 100 }).notNull(), // Performance, Holiday, Signing, Spot, etc.
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("PKR"),
    bonusDate: timestamp("bonus_date", { withTimezone: true }).notNull(),
    notes: text("notes"),

    updatedBy: varchar("updated_by", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdx: index("bonuses_employee_id_idx").on(table.employeeId),
  })
);

// ==================== STOCK GRANTS ====================
export const stockGrants = pgTable(
  "stock_grants",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id", { length: 255 }).notNull().references(() => employees.id, { onDelete: "cascade" }),

    units: integer("units").notNull(),
    grantDate: timestamp("grant_date", { withTimezone: true }).notNull(),
    vestingSchedule: varchar("vesting_schedule", { length: 100 }), // e.g. "4 years quarterly"
    notes: text("notes"),

    updatedBy: varchar("updated_by", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdx: index("stock_grants_employee_id_idx").on(table.employeeId),
  })
);

// ==================== ZOD SCHEMAS ====================

export const additionalAllowanceSchema = z.object({
  label: z.string(),
  amount: z.union([z.string(), z.number()]),
  includeInGross: z.boolean().optional(),
});

export const insertSalaryDetailSchema = z.object({
  employeeId: z.string(),
  annualSalary: z.string().or(z.number()).optional(),
  baseSalaryMonthly: z.string().or(z.number()).optional().nullable(),
  allowancesMonthly: z.string().or(z.number()).optional().nullable(),
  additionalAllowances: z.array(additionalAllowanceSchema).optional(),
  currency: z.string().optional(),
  startDate: z.string(),
  reason: z.string().optional().nullable(),
  payRate: z.string().or(z.number()).optional().nullable(),
  payRatePeriod: z.string().optional().nullable(),
  payoutFrequency: z.string().optional().nullable(),
  payGroup: z.string().optional().nullable(),
  payMethod: z.string().optional().nullable(),
  eligibleWorkHours: z.string().optional().nullable(),
  additionalDetails: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const insertBankingDetailSchema = z.object({
  employeeId: z.string(),
  bankName: z.string().min(1),
  nameOnAccount: z.string().min(1),
  bankCode: z.string().optional().nullable(),
  accountNumber: z.string().min(1),
  iban: z.string().optional().nullable(),
  isPrimary: z.boolean().optional(),
});

export const insertBonusSchema = z.object({
  employeeId: z.string(),
  bonusType: z.string().min(1),
  amount: z.string().or(z.number()),
  currency: z.string().optional(),
  bonusDate: z.string(),
  notes: z.string().optional().nullable(),
});

export const insertStockGrantSchema = z.object({
  employeeId: z.string(),
  units: z.number().int().positive(),
  grantDate: z.string(),
  vestingSchedule: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Full schemas for PATCH (update) — same as insert minus employeeId (frontend sends full record when editing)
export const updateSalaryDetailSchema = insertSalaryDetailSchema.omit({ employeeId: true }).extend({
  isCurrent: z.boolean().optional(),
});
export const updateBankingDetailSchema = insertBankingDetailSchema.omit({ employeeId: true });
export const updateStockGrantSchema = insertStockGrantSchema.omit({ employeeId: true });
export const updateBonusSchema = insertBonusSchema.omit({ employeeId: true });

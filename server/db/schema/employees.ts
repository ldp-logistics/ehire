import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, pgEnum, index, uniqueIndex, date } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enum for employee source
export const employeeSourceEnum = pgEnum("employee_source", ["manual", "freshteam", "sso"]);

// Enum for employment status
export const employmentStatusEnum = pgEnum("employment_status", [
  "active",
  "onboarding",
  "on_leave",
  "terminated",
  "resigned",
  "offboarded",
]);

// Enum for employee type
export const employeeTypeEnum = pgEnum("employee_type", [
  "full_time",
  "part_time",
  "contractor",
  "intern",
  "temporary",
]);

// Enum for gender
export const genderEnum = pgEnum("gender", ["male", "female", "other", "prefer_not_to_say"]);

// Enum for marital status
export const maritalStatusEnum = pgEnum("marital_status", ["single", "married", "divorced", "widowed"]);

export const employees = pgTable(
  "employees",
  {
    // Primary key
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    
    // Core Identifiers
    employeeId: varchar("employee_id", { length: 50 }).notNull(),
    workEmail: varchar("work_email", { length: 255 }).notNull(),
    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    lastName: text("last_name").notNull(),
    /** Pseudonym / office name (optional); directory display: "Legal first last (pseudonym)". */
    nickname: text("nickname"),
    avatar: text("avatar"),
    
    // Work Details
    jobTitle: text("job_title").notNull(),
    department: text("department").notNull(),
    subDepartment: text("sub_department"),
    businessUnit: text("business_unit"),
    primaryTeam: text("primary_team"),
    costCenter: text("cost_center"),
    grade: text("grade"),
    jobCategory: text("job_category"),
    location: text("location"),
    managerId: varchar("manager_id", { length: 255 }),
    managerEmail: varchar("manager_email", { length: 255 }),
    hrEmail: varchar("hr_email", { length: 255 }),
    
    // Status & Type
    employmentStatus: employmentStatusEnum("employment_status").notNull().default("active"),
    employeeType: employeeTypeEnum("employee_type").default("full_time"),
    shift: text("shift"),
    
    // Contact Info
    personalEmail: varchar("personal_email", { length: 255 }),
    personalPhone: varchar("personal_phone", { length: 50 }),
    workPhone: varchar("work_phone", { length: 50 }),
    
    // Personal Details
    dob: date("dob"),
    gender: genderEnum("gender"),
    maritalStatus: maritalStatusEnum("marital_status"),
    bloodGroup: varchar("blood_group", { length: 10 }),
    
    // Permanent Address
    street: text("street"),
    city: text("city"),
    state: text("state"),
    country: text("country"),
    zipCode: varchar("zip_code", { length: 20 }),
    
    // Communication Address
    commStreet: text("comm_street"),
    commCity: text("comm_city"),
    commState: text("comm_state"),
    commCountry: text("comm_country"),
    commZipCode: varchar("comm_zip_code", { length: 20 }),
    
    // Important Dates
    joinDate: timestamp("join_date", { withTimezone: true }).notNull(),
    probationStartDate: timestamp("probation_start_date", { withTimezone: true }),
    probationEndDate: timestamp("probation_end_date", { withTimezone: true }),
    /** Optional status from migration 0018 (e.g. 'active', 'cleared'). Kept in sync so db:push does not drop it. */
    probationStatus: text("probation_status"),
    confirmationDate: timestamp("confirmation_date", { withTimezone: true }),
    noticePeriod: varchar("notice_period", { length: 50 }),
    
    // Exit Info
    resignationDate: timestamp("resignation_date", { withTimezone: true }),
    exitDate: timestamp("exit_date", { withTimezone: true }),
    exitType: text("exit_type"),
    resignationReason: text("resignation_reason"),
    eligibleForRehire: varchar("eligible_for_rehire", { length: 10 }),
    
    // Custom Fields
    customField1: text("custom_field_1"),
    customField2: text("custom_field_2"),
    
    // System Fields
    source: employeeSourceEnum("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    workEmailUnique: uniqueIndex("employees_work_email_unique").on(table.workEmail),
    employeeIdUnique: uniqueIndex("employees_employee_id_unique").on(table.employeeId),
    managerIdIdx: index("employees_manager_id_idx").on(table.managerId),
    departmentIdx: index("employees_department_idx").on(table.department),
    employmentStatusIdx: index("employees_employment_status_idx").on(table.employmentStatus),
    locationIdx: index("employees_location_idx").on(table.location),
  })
);

// Probation reminder tracking (migration 0018). Prevents duplicate day_7/day_3/day_1 emails.
export const probationReminders = pgTable(
  "probation_reminders",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id", { length: 255 }).notNull().references(() => employees.id, { onDelete: "cascade" }),
    reminderType: text("reminder_type").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdx: index("idx_probation_reminders_employee").on(table.employeeId),
    sentAtIdx: index("idx_probation_reminders_sent_at").on(table.sentAt),
    uniqueEmployeeReminder: uniqueIndex("probation_reminders_employee_id_reminder_type_unique").on(table.employeeId, table.reminderType),
  })
);

// Dependents & emergency contacts (employee-owned rows; APIs live under /api/employees)
export const emergencyContacts = pgTable(
  "emergency_contacts",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id", { length: 255 }).notNull().references(() => employees.id, { onDelete: "cascade" }),

    fullName: varchar("full_name", { length: 255 }).notNull(),
    relationship: varchar("relationship", { length: 100 }),
    phone: varchar("phone", { length: 50 }),
    email: varchar("email", { length: 255 }),
    address: text("address"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdx: index("emergency_contacts_employee_id_idx").on(table.employeeId),
  })
);

export const dependents = pgTable(
  "dependents",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id", { length: 255 }).notNull().references(() => employees.id, { onDelete: "cascade" }),

    fullName: varchar("full_name", { length: 255 }).notNull(),
    relationship: varchar("relationship", { length: 100 }),
    dateOfBirth: timestamp("date_of_birth", { withTimezone: true }),
    gender: varchar("gender", { length: 20 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdx: index("dependents_employee_id_idx").on(table.employeeId),
  })
);

// Self-referencing relation for manager (employee_documents defined in employeeDocuments.ts)
export const employeesRelations = relations(employees, ({ one, many }) => ({
  manager: one(employees, {
    fields: [employees.managerId],
    references: [employees.id],
    relationName: "manager",
  }),
  directReports: many(employees, {
    relationName: "manager",
  }),
}));

// Zod schema for inserting employees
export const insertEmployeeSchema = createInsertSchema(employees, {
  employeeId: z.string().min(1),
  workEmail: z.string().email(),
  firstName: z.string().min(1),
  middleName: z.string().optional().nullable(),
  lastName: z.string().min(1),
  nickname: z.string().optional().nullable(),
  avatar: z.string().url().optional().nullable(),
  jobTitle: z.string().min(1),
  department: z.string().min(1),
  subDepartment: z.string().optional().nullable(),
  businessUnit: z.string().optional().nullable(),
  primaryTeam: z.string().optional().nullable(),
  costCenter: z.string().optional().nullable(),
  grade: z.string().optional().nullable(),
  jobCategory: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
  managerEmail: z.string().email().optional().nullable(),
  hrEmail: z.string().email().optional().nullable(),
  employmentStatus: z.enum(["active", "onboarding", "on_leave", "terminated", "resigned", "offboarded"]).optional(),
  employeeType: z.enum(["full_time", "part_time", "contractor", "intern", "temporary"]).optional().nullable(),
  shift: z.string().optional().nullable(),
  personalEmail: z.string().email().optional().nullable(),
  personalPhone: z.string().optional().nullable(),
  workPhone: z.string().optional().nullable(),
  dob: z.string().optional().nullable(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional().nullable(),
  maritalStatus: z.enum(["single", "married", "divorced", "widowed"]).optional().nullable(),
  bloodGroup: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  commStreet: z.string().optional().nullable(),
  commCity: z.string().optional().nullable(),
  commState: z.string().optional().nullable(),
  commCountry: z.string().optional().nullable(),
  commZipCode: z.string().optional().nullable(),
  joinDate: z.coerce.date(),
  probationStartDate: z.coerce.date().optional().nullable(),
  probationEndDate: z.coerce.date().optional().nullable(),
  confirmationDate: z.coerce.date().optional().nullable(),
  noticePeriod: z.string().optional().nullable(),
  resignationDate: z.coerce.date().optional().nullable(),
  exitDate: z.coerce.date().optional().nullable(),
  exitType: z.string().optional().nullable(),
  resignationReason: z.string().optional().nullable(),
  eligibleForRehire: z.string().optional().nullable(),
  customField1: z.string().optional().nullable(),
  customField2: z.string().optional().nullable(),
  source: z.enum(["manual", "freshteam", "sso"]).optional(),
});

export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

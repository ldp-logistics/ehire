import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, pgEnum, index, integer, decimal, uniqueIndex, jsonb, date, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { employees } from "./employees";
import { users } from "./users";

// ==================== ENUMS ====================

export const jobPostingStatusEnum = pgEnum("job_posting_status", [
  "draft",
  "published",
  "paused",
  "closed",
  "archived",
]);

export const applicationStageEnum = pgEnum("application_stage", [
  "applied",
  "longlisted",
  "screening",
  "shortlisted",
  "assessment",
  "interview",
  "verbally_accepted",
  "offer",
  "tentative",
  "hired",
  "rejected",
]);

export const offerStatusEnum = pgEnum("offer_status", [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "withdrawn",
]);

// ==================== CANDIDATES TABLE ====================

export const candidates = pgTable(
  "candidates",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    lastName: text("last_name").notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }),
    linkedinUrl: text("linkedin_url"),

    currentCompany: text("current_company"),
    currentTitle: text("current_title"),
    experienceYears: integer("experience_years"),

    currentSalary: decimal("current_salary"),
    expectedSalary: decimal("expected_salary"),
    salaryCurrency: varchar("salary_currency", { length: 10 }),

    resumeUrl: text("resume_url"), // stored file path or base64 data URL; nullable for manual add (e.g. email applicants)
    resumeFilename: text("resume_filename"),

    // Personal details & address — collected at application, prefill employee on hire
    dateOfBirth: date("date_of_birth"),
    gender: varchar("gender", { length: 50 }),
    maritalStatus: varchar("marital_status", { length: 50 }),
    bloodGroup: varchar("blood_group", { length: 10 }),
    personalEmail: varchar("personal_email", { length: 255 }),
    street: text("street"),
    city: text("city"),
    state: text("state"),
    country: text("country"),
    zipCode: varchar("zip_code", { length: 20 }),

    source: text("source"), // "career_page", "linkedin", "referral", "freshteam", etc.
    notes: text("notes"),
    /** Tags from FreshTeam or internal labels; stored as JSON array of strings. */
    tags: jsonb("tags"),

    /** FreshTeam candidate id; used to link applicants to our candidate without re-fetching. */
    freshteamCandidateId: varchar("freshteam_candidate_id", { length: 32 }),

    /** Region for talent-pool-only candidates (no application yet). */
    regionCode: varchar("region_code", { length: 10 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex("candidates_email_unique").on(table.email),
    nameIdx: index("candidates_name_idx").on(table.firstName, table.lastName),
    freshteamCandidateIdIdx: index("candidates_freshteam_candidate_id_idx").on(table.freshteamCandidateId),
    regionCodeIdx: index("candidates_region_code_idx").on(table.regionCode),
  })
);

// ==================== JOB POSTINGS TABLE ====================

export const jobPostings = pgTable(
  "job_postings",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    title: text("title").notNull(),
    department: text("department").notNull(),
    location: text("location"),
    employmentType: varchar("employment_type", { length: 30 }), // full_time, part_time, contract, intern

    description: text("description"),
    requirements: text("requirements"),

    salaryRangeMin: decimal("salary_range_min"),
    salaryRangeMax: decimal("salary_range_max"),
    salaryCurrency: varchar("salary_currency", { length: 10 }),

    headcount: integer("headcount").notNull().default(1),

    // Legacy single hiring manager — kept for backward compat
    hiringManagerId: varchar("hiring_manager_id", { length: 255 }).references(() => employees.id, { onDelete: "set null" }),

    /**
     * Multiple hiring managers stored as JSON array of employee IDs.
     * e.g. ["uuid-1", "uuid-2"]
     * When populated, this takes precedence over hiringManagerId.
     */
    hiringManagerIds: jsonb("hiring_manager_ids"),

    status: jobPostingStatusEnum("status").notNull().default("draft"),
    publishedChannels: jsonb("published_channels"), // e.g. ["career_page","linkedin","indeed"]

    /** Experience level from FreshTeam / job boards: e.g. "Entry Level", "Mid-Senior Level". */
    experienceLevel: varchar("experience_level", { length: 50 }),
    /** Whether the job is remote (FreshTeam: remote boolean). */
    remote: boolean("remote"),

    /** FreshTeam job posting id; used to map applicants to our job during candidate migration. */
    freshteamJobId: varchar("freshteam_job_id", { length: 32 }),

    publishedAt: timestamp("published_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

    /** Auth user who created this job (applicants list owner). */
    createdBy: varchar("created_by", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
    /** Auth user who last updated this job. */
    updatedBy: varchar("updated_by", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    statusIdx: index("job_postings_status_idx").on(table.status),
    departmentIdx: index("job_postings_department_idx").on(table.department),
    freshteamJobIdIdx: index("job_postings_freshteam_job_id_idx").on(table.freshteamJobId),
  })
);

// ==================== APPLICATIONS TABLE ====================

export const applications = pgTable(
  "applications",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    candidateId: varchar("candidate_id", { length: 255 })
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),

    jobId: varchar("job_id", { length: 255 })
      .notNull()
      .references(() => jobPostings.id, { onDelete: "cascade" }),

    stage: applicationStageEnum("stage").notNull().default("applied"),
    stageUpdatedAt: timestamp("stage_updated_at", { withTimezone: true }),

    verbalAcceptanceAt: timestamp("verbal_acceptance_at", { withTimezone: true }),

    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),

    /** HR rating 1–5 for candidate fit; null = not rated yet. */
    rating: integer("rating"),

    coverLetter: text("cover_letter"),
    referralSource: text("referral_source"),
    rejectReason: text("reject_reason"),

    // Set after hire conversion
    employeeId: varchar("employee_id", { length: 255 }).references(() => employees.id, { onDelete: "set null" }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    candidateJobUnique: uniqueIndex("applications_candidate_job_unique").on(table.candidateId, table.jobId),
    candidateIdx: index("applications_candidate_id_idx").on(table.candidateId),
    jobIdx: index("applications_job_id_idx").on(table.jobId),
    stageIdx: index("applications_stage_idx").on(table.stage),
  })
);

// ==================== APPLICATION STAGE HISTORY TABLE ====================
// Append-only audit trail. On every stage change: INSERT only. Never UPDATE or DELETE.

export const applicationStageHistory = pgTable(
  "application_stage_history",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    applicationId: varchar("application_id", { length: 255 })
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),

    fromStage: text("from_stage"), // null for initial "applied"
    toStage: text("to_stage").notNull(),

    notes: text("notes"),
    movedBy: varchar("moved_by", { length: 255 }).references(() => users.id, { onDelete: "set null" }),

    // Legacy text field for display
    interviewerNames: text("interviewer_names"),
    /**
     * Array of employee IDs for interviewers.
     * Stored as JSON array: ["uuid-1", "uuid-2"]
     * Replaces text-only interviewer_names for proper linkage.
     */
    interviewerIds: jsonb("interviewer_ids"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    /** Teams meeting join URL from Microsoft Graph when interview is scheduled (migration 0046). */
    meetingLink: text("meeting_link"),
    /** Graph calendar event ID (migration 0046). */
    teamsEventId: text("teams_event_id"),
    /** Interview type: Technical, HR, Screening, etc. (migration 0046). */
    interviewType: varchar("interview_type", { length: 50 }),
    /** Round within pipeline stage (migration 0072). */
    interviewRound: integer("interview_round"),
    /** onsite | teams (migration 0072). */
    scheduleFormat: varchar("schedule_format", { length: 20 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    applicationIdx: index("stage_history_application_id_idx").on(table.applicationId),
  })
);

// ==================== OFFERS TABLE ====================

export const offers = pgTable(
  "offers",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    applicationId: varchar("application_id", { length: 255 })
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),

    salary: decimal("salary").notNull(),
    salaryCurrency: varchar("salary_currency", { length: 10 }),

    jobTitle: text("job_title").notNull(),
    department: text("department"),
    startDate: timestamp("start_date", { withTimezone: true }),
    employmentType: varchar("employment_type", { length: 30 }),

    terms: text("terms"),

    status: offerStatusEnum("status").notNull().default("draft"),

    sentAt: timestamp("sent_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),

    /** One-time token for candidate to accept/decline via link. Set when status becomes "sent". */
    responseToken: varchar("response_token", { length: 255 }),

    esignStatus: text("esign_status"), // "pending", "signed", "not_required"

    approvalStatus: varchar("approval_status", { length: 50 }).notNull().default("pending"), // pending | approved | rejected | not_requested
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: varchar("approved_by", { length: 255 }).references(() => users.id, { onDelete: "set null" }),

    /** Auth user who created this offer (for approval / notification flows). */
    createdBy: varchar("created_by", { length: 255 }).references(() => users.id, { onDelete: "set null" }),

    /** Offer letter PDF: data URL or file path. Uploaded after approval, then sent via email (nodemailer later). */
    offerLetterUrl: text("offer_letter_url"),
    offerLetterFilename: text("offer_letter_filename"),

    /** SharePoint URL of signed offer (PDF or signed DOCX) after e-sign completes. */
    signedDocumentUrl: text("signed_document_url"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    applicationUnique: uniqueIndex("offers_application_id_unique").on(table.applicationId),
    statusIdx: index("offers_status_idx").on(table.status),
    responseTokenUnique: uniqueIndex("offers_response_token_unique").on(table.responseToken),
  })
);

// ==================== APPLICATION EMAILS (migration 0045) ====================

export const emailDirectionEnum = pgEnum("email_direction", ["sent", "received"]);

export const applicationEmails = pgTable(
  "application_emails",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    applicationId: varchar("application_id", { length: 255 })
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),

    direction: emailDirectionEnum("direction").notNull(),
    fromEmail: text("from_email").notNull(),
    toEmail: text("to_email").notNull(),
    cc: text("cc"),
    bcc: text("bcc"),
    subject: text("subject").notNull().default(""),
    bodyPlain: text("body_plain"),
    bodyHtml: text("body_html"),
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    referencesHeader: text("references_header"),

    sentAt: timestamp("sent_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    applicationCreatedIdx: index("idx_application_emails_application_id_created_at").on(table.applicationId, table.createdAt),
  })
);

export type ApplicationEmail = typeof applicationEmails.$inferSelect;

// ==================== RECRUITMENT AUDIT LOG (migration 0019) ====================
export const recruitmentAuditLog = pgTable(
  "recruitment_audit_log",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: varchar("entity_id", { length: 255 }).notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    performedBy: varchar("performed_by", { length: 255 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    entityIdx: index("idx_recruitment_audit_entity").on(table.entityType, table.entityId),
    actionIdx: index("idx_recruitment_audit_action").on(table.action),
    createdIdx: index("idx_recruitment_audit_created").on(table.createdAt),
  })
);

// ==================== RELATIONS ====================

export const candidatesRelations = relations(candidates, ({ many }) => ({
  applications: many(applications),
}));

export const jobPostingsRelations = relations(jobPostings, ({ one, many }) => ({
  hiringManager: one(employees, {
    fields: [jobPostings.hiringManagerId],
    references: [employees.id],
  }),
  applications: many(applications),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  candidate: one(candidates, {
    fields: [applications.candidateId],
    references: [candidates.id],
  }),
  job: one(jobPostings, {
    fields: [applications.jobId],
    references: [jobPostings.id],
  }),
  employee: one(employees, {
    fields: [applications.employeeId],
    references: [employees.id],
  }),
  stageHistory: many(applicationStageHistory),
  emails: many(applicationEmails),
}));

export const applicationStageHistoryRelations = relations(applicationStageHistory, ({ one }) => ({
  application: one(applications, {
    fields: [applicationStageHistory.applicationId],
    references: [applications.id],
  }),
  movedByUser: one(users, {
    fields: [applicationStageHistory.movedBy],
    references: [users.id],
  }),
}));

export const applicationEmailsRelations = relations(applicationEmails, ({ one }) => ({
  application: one(applications, {
    fields: [applicationEmails.applicationId],
    references: [applications.id],
  }),
}));

export const offersRelations = relations(offers, ({ one }) => ({
  application: one(applications, {
    fields: [offers.applicationId],
    references: [applications.id],
  }),
}));

// ==================== ZOD SCHEMAS ====================

export const insertCandidateSchema = createInsertSchema(candidates, {
  firstName: z.string().min(1, "First name is required"),
  middleName: z.string().optional().nullable(),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional().nullable(),
  linkedinUrl: z.string().optional().nullable(),
  currentCompany: z.string().optional().nullable(),
  currentTitle: z.string().optional().nullable(),
  experienceYears: z.coerce.number().int().optional().nullable(),
  currentSalary: z.coerce.number().optional().nullable(),
  expectedSalary: z.coerce.number().optional().nullable(),
  salaryCurrency: z.string().optional().nullable(),
  resumeUrl: z.string().optional().nullable(), // optional for manual add (e.g. email applicants); stored as '' when missing
  resumeFilename: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  maritalStatus: z.string().optional().nullable(),
  bloodGroup: z.string().optional().nullable(),
  personalEmail: z.preprocess((val) => (val === "" ? undefined : val), z.string().email().optional().nullable()),
  street: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.any().optional().nullable(),
});

export const insertJobPostingSchema = createInsertSchema(jobPostings, {
  title: z.string().min(1, "Title is required"),
  department: z.string().min(1, "Department is required"),
  location: z.string().optional().nullable(),
  employmentType: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  requirements: z.string().optional().nullable(),
  salaryRangeMin: z.coerce.number().optional().nullable(),
  salaryRangeMax: z.coerce.number().optional().nullable(),
  salaryCurrency: z.string().optional().nullable(),
  headcount: z.coerce.number().int().optional(),
  hiringManagerId: z.string().optional().nullable(),
  hiringManagerIds: z.any().optional().nullable(),
  status: z.enum(["draft", "published", "paused", "closed", "archived"]).optional(),
  publishedChannels: z.any().optional().nullable(),
  experienceLevel: z.string().optional().nullable(),
  remote: z.boolean().optional().nullable(),
  publishedAt: z.coerce.date().optional().nullable(),
  closedAt: z.coerce.date().optional().nullable(),
}).omit({ id: true, createdAt: true, updatedAt: true, createdBy: true });

export const insertApplicationSchema = createInsertSchema(applications, {
  candidateId: z.string().min(1),
  jobId: z.string().min(1),
  stage: z.enum(["applied", "longlisted", "screening", "shortlisted", "assessment", "interview", "verbally_accepted", "offer", "tentative", "hired", "rejected"]).optional(),
  coverLetter: z.string().optional().nullable(),
  referralSource: z.string().optional().nullable(),
}).extend({
  // Custom / repeatable answers from the job-specific application form (stored as JSONB)
  customAnswers: z.record(z.unknown()).optional().nullable(),
});

export const insertOfferSchema = createInsertSchema(offers, {
  applicationId: z.string().min(1),
  salary: z.coerce.number().min(0, "Salary is required"),
  salaryCurrency: z.string().optional().nullable(),
  jobTitle: z.string().min(1, "Job title is required"),
  department: z.string().optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  employmentType: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "withdrawn"]).optional(),
  esignStatus: z.string().optional().nullable(),
  approvalStatus: z.enum(["pending", "approved", "rejected", "not_requested"]).optional(),
});

// ==================== INTERVIEW FEEDBACK TABLE ====================

export const interviewFeedback = pgTable(
  "interview_feedback",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    historyId: varchar("history_id", { length: 255 })
      .notNull()
      .references(() => applicationStageHistory.id, { onDelete: "cascade" }),

    applicationId: varchar("application_id", { length: 255 })
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),

    reviewerEmployeeId: varchar("reviewer_employee_id", { length: 255 })
      .references(() => employees.id, { onDelete: "set null" }),

    reviewerName: varchar("reviewer_name", { length: 255 }),
    reviewerEmail: varchar("reviewer_email", { length: 255 }),

    /** pending | draft | submitted | no_show */
    status: varchar("status", { length: 20 }).notNull().default("pending"),

    overallRating: integer("overall_rating"),
    overallComments: text("overall_comments"),

    /** [{criterion: string, rating: 1-5|null, note: string}] */
    scorecard: jsonb("scorecard").notNull().default([]),

    testReportUrl: text("test_report_url"),
    testReportFilename: varchar("test_report_filename", { length: 255 }),

    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    historyIdx: index("idx_interview_feedback_history_id").on(table.historyId),
    applicationIdx: index("idx_interview_feedback_application_id").on(table.applicationId),
    reviewerIdx: index("idx_interview_feedback_reviewer").on(table.reviewerEmployeeId),
  })
);

// ==================== TYPES ====================

export type Candidate = typeof candidates.$inferSelect;
export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
export type JobPosting = typeof jobPostings.$inferSelect;
export type InsertJobPosting = z.infer<typeof insertJobPostingSchema>;
export type Application = typeof applications.$inferSelect;
export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type ApplicationStageHistory = typeof applicationStageHistory.$inferSelect;
export type Offer = typeof offers.$inferSelect;
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type InterviewFeedback = typeof interviewFeedback.$inferSelect;

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, pgEnum, index, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { candidates, applications } from "./recruitment";

// ==================== ENUMS ====================

export const tentativeStatusEnum = pgEnum("tentative_status", [
  "pending",   // Document collection in progress
  "cleared",   // All required docs verified — ready for hire
  "failed",    // HR rejected / compliance failure
  "cancelled", // Application moved out of tentative stage (no longer active)
]);

export const tentativeDocTypeEnum = pgEnum("tentative_doc_type", [
  // Mandatory — always required
  "cnic_front",
  "cnic_back",
  "professional_photo",
  // Optional identity
  "passport",
  "drivers_license",
  // Academic
  "degree_transcript",
  // Employment history (conditional on is_first_job)
  "experience_certificate",
  "salary_slip",
  "resignation_acceptance",
  "internship_certificate",
]);

export const tentativeDocStatusEnum = pgEnum("tentative_doc_status", [
  "pending",         // Awaiting upload
  "uploaded",        // Candidate uploaded, awaiting HR review
  "verified",        // HR verified
  "rejected",        // HR rejected (with reason)
  "not_applicable",  // Auto-set for first-job candidates where appropriate
  "deferred",        // HR allows candidate to send later — does not block clearance
]);

// ==================== TENTATIVE RECORDS TABLE ====================

export const tentativeRecords = pgTable(
  "tentative_records",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    applicationId: varchar("application_id", { length: 255 })
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    candidateId: varchar("candidate_id", { length: 255 })
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    status: tentativeStatusEnum("status").notNull().default("pending"),
    isFirstJob: boolean("is_first_job").notNull().default(false),
    /**
     * Secure token for candidate portal access.
     * Candidate receives a link like /tentative-portal/:token
     * No login required — token-based authentication.
     */
    portalToken: varchar("portal_token", { length: 255 })
      .notNull()
      .default(sql`gen_random_uuid()`),
    initiatedBy: varchar("initiated_by", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    failedReason: text("failed_reason"),
  },
  (table) => [
    index("idx_tentative_application").on(table.applicationId),
    index("idx_tentative_candidate").on(table.candidateId),
    index("idx_tentative_token").on(table.portalToken),
  ]
);

// ==================== TENTATIVE DOCUMENTS TABLE ====================

/**
 * Append-only mindset: rows are never deleted.
 * Status transitions: pending → uploaded → verified/rejected
 * Rejected docs can be re-uploaded (status → uploaded again).
 */
export const tentativeDocuments = pgTable(
  "tentative_documents",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    tentativeRecordId: varchar("tentative_record_id", { length: 255 })
      .notNull()
      .references(() => tentativeRecords.id, { onDelete: "cascade" }),
    documentType: tentativeDocTypeEnum("document_type").notNull(),
    required: boolean("required").notNull().default(true),
    status: tentativeDocStatusEnum("status").notNull().default("pending"),
    fileUrl: text("file_url"),
    fileName: text("file_name"),
    rejectionReason: text("rejection_reason"),
    verifiedBy: varchar("verified_by", { length: 255 }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_tentative_doc_record").on(table.tentativeRecordId),
    index("idx_tentative_doc_type").on(table.documentType),
  ]
);

// ==================== RELATIONS ====================

export const tentativeRecordsRelations = relations(tentativeRecords, ({ one, many }) => ({
  application: one(applications, {
    fields: [tentativeRecords.applicationId],
    references: [applications.id],
  }),
  candidate: one(candidates, {
    fields: [tentativeRecords.candidateId],
    references: [candidates.id],
  }),
  documents: many(tentativeDocuments),
}));

export const tentativeDocumentsRelations = relations(tentativeDocuments, ({ one }) => ({
  tentativeRecord: one(tentativeRecords, {
    fields: [tentativeDocuments.tentativeRecordId],
    references: [tentativeRecords.id],
  }),
}));

// ==================== ZOD SCHEMAS ====================

export const insertTentativeRecordSchema = createInsertSchema(tentativeRecords).omit({
  id: true,
  createdAt: true,
  clearedAt: true,
  failedAt: true,
  failedReason: true,
  portalToken: true,
});

export const insertTentativeDocumentSchema = createInsertSchema(tentativeDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  verifiedAt: true,
  uploadedAt: true,
});

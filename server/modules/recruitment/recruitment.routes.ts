import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { requireAuth, requireRole, requireBreakGlassAdmin, optionalAuth } from "../../middleware/auth.js";
import { requireSameRegion } from "../../middleware/regionAccess.js";
import { RecruitmentController } from "./RecruitmentController.js";

// 20 submissions per IP per 15 minutes — prevents career-page spam
const publicSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions. Please wait a few minutes and try again." },
});

// Inbound email webhook — called by Resend (one IP), but capped to prevent abuse
const inboundEmailLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded" },
});

const router = Router();
const ctrl = new RecruitmentController();
// Large `text` / `html` / raw `email` fields from SendGrid need a high field limit (default is small).
const inboundFormParser = multer({
  storage: multer.memoryStorage(),
  limits: { fieldSize: 25 * 1024 * 1024, fileSize: 25 * 1024 * 1024 },
});
// Full ATS access: admin, hr, recruiter
const adminHR = requireRole(["admin", "hr", "recruiter"]);
// Recruitment read access (scoping for manager/hiring/limited/employee panelists enforced in service layer)
const recruitRead = requireRole(["admin", "hr", "recruiter", "manager", "hiring_manager", "limited_recruiter", "employee"]);
// Panelists may comment on assigned applicants; HR/recruiter retain full comment access
const recruitCommentWrite = requireRole(["admin", "hr", "recruiter", "limited_recruiter", "employee"]);
// Offer approvals: admin, hr, manager, recruiter, hiring_manager
const adminHRManager = requireRole(["admin", "hr", "manager", "recruiter", "hiring_manager"]);
// Mutation access for limited_recruiter (job-scoping enforced in service layer)
const adminHRLimitedRecruiter = requireRole(["admin", "hr", "recruiter", "limited_recruiter"]);

// ── FreshTeam migrations ──────────────────────────────────────────────────────
router.post("/migrate-freshteam-jobs",        requireAuth, requireBreakGlassAdmin, ctrl.migrateFreshteamJobs);
router.post("/sync-freshteam-job-audit",      requireAuth, requireBreakGlassAdmin, ctrl.syncFreshteamJobAudit);
router.post("/migrate-freshteam-candidates",  requireAuth, requireBreakGlassAdmin, ctrl.migrateFreshteamCandidates);

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get("/stats",                           requireAuth, recruitRead, ctrl.getStats);
router.get("/interviews/scheduled",            requireAuth, recruitRead, ctrl.listScheduledInterviews);
router.get("/interviewer-assignments",         requireAuth, ctrl.listMyInterviewerAssignments);

// ── Candidates ────────────────────────────────────────────────────────────────
router.get("/candidates/filter-options",       requireAuth, recruitRead, ctrl.getCandidateFilterOptions);
router.get("/candidates",                      requireAuth, recruitRead, ctrl.listCandidates);
router.post("/candidates/manual",                publicSubmitLimiter, requireAuth, adminHRLimitedRecruiter, ctrl.createCandidateManual);
router.post("/candidates",                     publicSubmitLimiter, optionalAuth, ctrl.createCandidate);
router.get("/candidates/:id/resume",           requireAuth, recruitRead, ctrl.getCandidateResume);
router.get("/candidates/:id",                  requireAuth, recruitRead, ctrl.getCandidateById);
router.patch("/candidates/:id",               requireAuth, adminHRLimitedRecruiter, ctrl.updateCandidate);
router.delete("/candidates/:id",              requireAuth, adminHR, ctrl.deleteCandidate);

// ── Job Postings ──────────────────────────────────────────────────────────────
router.get("/assignable-users",                requireAuth, recruitRead, ctrl.listAssignableUsers);
router.get("/jobs/filter-options",             requireAuth, recruitRead, ctrl.getJobFilterOptions);
router.get("/jobs/published",                  ctrl.getPublishedJobs);
router.get("/jobs",                            requireAuth, recruitRead, ctrl.listJobs);
router.post("/jobs",                           requireAuth, adminHR, ctrl.createJob);
// Per-job application form (public GET for career page; PUT requires admin/hr)
router.get("/jobs/:id/application-form",       ctrl.getJobApplicationFormConfig);
router.put("/jobs/:id/application-form",       requireAuth, requireRole(["admin", "hr"]), ctrl.saveJobApplicationFormConfig);
router.post("/jobs/:id/generate-linkedin-post", requireAuth, adminHR, ctrl.generateLinkedInPost);
router.get("/jobs/:id",                        requireAuth, recruitRead, requireSameRegion("job"), ctrl.getJobById);
router.patch("/jobs/:id",                      requireAuth, adminHR, requireSameRegion("job"), ctrl.updateJob);
router.delete("/jobs/:id",                     requireAuth, requireRole(["admin", "hr"]), requireSameRegion("job"), ctrl.deleteJob);

// ── Applications ──────────────────────────────────────────────────────────────
router.get("/applications",                    requireAuth, recruitRead, ctrl.listApplications);
router.post("/applications",                   publicSubmitLimiter, ctrl.createApplication);
router.get("/applications/:id",                requireAuth, recruitRead, requireSameRegion("application"), ctrl.getApplicationById);
router.patch("/applications/:id/stage",        requireAuth, adminHRLimitedRecruiter, requireSameRegion("application"), ctrl.updateApplicationStage);
router.post("/applications/:id/restore-workflow-stage", requireAuth, adminHRLimitedRecruiter, ctrl.restoreWorkflowStage);
router.post("/applications/:id/interviews",    requireAuth, adminHRLimitedRecruiter, ctrl.addInterviewRound);
router.patch("/applications/:id/rating",       requireAuth, adminHRLimitedRecruiter, ctrl.updateApplicationRating);
router.delete("/applications/:id",            requireAuth, adminHR, requireSameRegion("application"), ctrl.deleteApplication);
router.get("/applications/:id/history",        requireAuth, recruitRead, ctrl.getApplicationHistory);
router.get("/applications/:id/audit-log",      requireAuth, recruitRead, ctrl.getApplicationAuditLog);
router.get("/applications/:id/interview-schedule/preview", requireAuth, adminHRLimitedRecruiter, ctrl.getInterviewSchedulePreview);
router.post("/applications/:id/interview-schedule/send", requireAuth, adminHRLimitedRecruiter, ctrl.sendInterviewSchedule);

// Interview feedback
const feedbackUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const interviewerOrHR = requireRole(["admin", "hr", "recruiter", "manager", "hiring_manager", "limited_recruiter", "employee"]);
router.get("/applications/:id/interviews",                                  requireAuth, recruitRead, ctrl.getApplicationInterviews);
router.get("/applications/:id/interviews/:historyId/feedback",              requireAuth, recruitRead, ctrl.getInterviewFeedback);
router.post("/applications/:id/interviews/:historyId/feedback",             requireAuth, interviewerOrHR, ctrl.submitInterviewFeedback);
router.post("/applications/:id/interviews/:historyId/remind",               requireAuth, adminHRLimitedRecruiter, ctrl.sendInterviewFeedbackReminder);
router.patch("/applications/:id/interviews/:historyId",                     requireAuth, adminHRLimitedRecruiter, ctrl.editInterview);
router.post("/applications/:id/interviews/:historyId/cancel",               requireAuth, adminHRLimitedRecruiter, ctrl.cancelInterview);
router.post("/applications/:id/interviews/:historyId/no-show",              requireAuth, adminHRLimitedRecruiter, ctrl.markInterviewNoShow);
router.post("/applications/:id/interviews/:historyId/test-report",          requireAuth, interviewerOrHR, feedbackUpload.single("file"), ctrl.uploadInterviewTestReport);

// Application emails
router.get("/applications/:id/emails",         requireAuth, recruitRead, ctrl.listApplicationEmails);
router.post("/applications/:id/emails",        requireAuth, adminHR, ctrl.sendApplicationEmail);
router.delete("/applications/:id/emails/:emailId", requireAuth, adminHR, ctrl.deleteApplicationEmail);

// Application comments
const commentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
router.get("/applications/:id/comments",       requireAuth, recruitRead, ctrl.listApplicationComments);
router.post("/applications/:id/comments",      requireAuth, recruitCommentWrite, ctrl.createApplicationComment);
router.delete("/applications/:id/comments/:commentId", requireAuth, adminHRLimitedRecruiter, ctrl.deleteApplicationComment);
router.get("/applications/:id/mentionable",    requireAuth, recruitRead, ctrl.getMentionableUsers);
router.post("/applications/:id/comment-attachment", requireAuth, adminHRLimitedRecruiter, commentUpload.single("file"), ctrl.uploadCommentAttachment);

// Hire conversion
router.post("/applications/:id/hire",          requireAuth, adminHR, requireSameRegion("application"), ctrl.hireCandidate);

// ── Offers ────────────────────────────────────────────────────────────────────
router.get("/offers",                          requireAuth, recruitRead, ctrl.listOffers);
router.post("/offers",                         requireAuth, adminHRLimitedRecruiter, ctrl.createOffer);
router.patch("/offers/:id/approve",            requireAuth, adminHRManager, ctrl.approveOffer);
router.patch("/offers/:id/reject",             requireAuth, adminHRManager, ctrl.rejectOffer);
router.post("/offers/:id/request-approval",    requireAuth, adminHRLimitedRecruiter, ctrl.requestOfferApproval);
router.post("/offers/:id/upload-letter",       requireAuth, adminHRLimitedRecruiter, ctrl.uploadOfferLetter);
router.post("/offers/:id/set-manual-doc",      requireAuth, adminHRLimitedRecruiter, ctrl.setManualOfferDoc);
router.get("/offers/:id/signed-pdf",           requireAuth, recruitRead, ctrl.getOfferSignedPdf);
router.get("/offers/:id/letter",               requireAuth, recruitRead, ctrl.getOfferLetter);
router.get("/offers/:id/link",                 requireAuth, recruitRead, ctrl.getOfferLink);
router.post("/offers/:id/merge-template",      requireAuth, adminHRLimitedRecruiter, ctrl.mergeOfferTemplate);
router.get("/offers/:id/variables",            requireAuth, recruitRead, ctrl.getOfferVariables);
router.get("/offers/:id",                      requireAuth, recruitRead, ctrl.getOffer);
router.patch("/offers/:id",                    requireAuth, adminHRLimitedRecruiter, ctrl.updateOffer);

// ── Offer response & e-sign (public / candidate-facing) ──────────────────────
router.get("/offer-response/:token",           ctrl.getOfferByToken);
router.post("/offer-response/:token",          ctrl.offerResponseDeprecated);
router.get("/offer-sign/:token",               ctrl.getOfferSigningPage);
router.get("/offer-sign/:token/pdf",           ctrl.getOfferSigningPdf);
router.post("/offer-sign/:token/submit",       ctrl.submitEsign);
router.post("/offer-sign/:token/decline",      ctrl.declineOfferByToken);

// ── Application Form Config ────────────────────────────────────────────────────
// Public GET (career page needs it without auth); PUT requires admin/hr
router.get("/application-form",                ctrl.getApplicationFormConfig);
router.put("/application-form",                requireAuth, requireRole(["admin", "hr"]), ctrl.saveApplicationFormConfig);
// One-shot: copy live default form to every job (same DB as the running app)
router.post("/application-form/sync-to-all-jobs", requireAuth, requireRole(["admin", "hr"]), ctrl.syncApplicationFormToAllJobs);

// ── Inbound email webhook (no auth — called by provider like SendGrid) ─────────
// SendGrid Inbound Parse posts multipart/form-data, so parse form fields here.
router.post("/inbound-email",                  inboundEmailLimiter, inboundFormParser.any(), ctrl.handleInboundEmail);

export default router;

import crypto from "node:crypto";
import { RecruitmentRepository } from "./RecruitmentRepository.js";
import {
  notifyEmail,
  getEmailsByRolesForRegion,
  getRenderedNotificationTemplate,
  wrapInEmailFrame,
  resolveNotificationFromAddress,
  resolvePublicAppUrlForTemplates,
  normalizePublicAppUrl,
  emailCtaButtonHtml,
  escapeHtmlForEmail,
  plainTextRecruitmentEmailToHtml,
} from "../../lib/emailNotifications.js";
import type { NotifyContext, Recipient } from "../../lib/emailNotifications.js";
import { NotFoundError, ValidationError, ConflictError } from "../../core/types/index.js";
import {
  parseDataUrl,
  uploadFileToSharePoint,
  isSharePointAvatarConfigured,
  getAvatarContentBySharingUrl,
  getMissingSharePointEnvVars,
} from "../../lib/sharepoint.js";
import { sendEmail, isEmailConfigured } from "../../lib/email.js";
import { createMeetingAsUser } from "../../services/teamsGraph.js";
import { AuthService, MS_INTERVIEW_CALENDAR_OAUTH_ENABLED } from "../auth/AuthService.js";
import { EmployeeService } from "../employees/EmployeeService.js";
import { resolvePolicy, assertJobAccess, assignedJobFilter, type UserPolicy } from "../../lib/policy.js";
import { effectiveRegionsFor, getJobRegion, getUserRegion, isValidRegionCode } from "../../lib/regionAccess.js";
import { hasAnyRole } from "../../lib/rbac.js";
import { mapToEmployeeType } from "../../../shared/employeeTypes.js";
import type { SystemRole } from "../../lib/rbac.js";
import { inferRegionFromLocationString } from "../../lib/employeeRegionSql.js";
import type { UserPayload } from "../../middleware/auth.js";
import { fetchResumeBuffer, downloadResumeAsDataUrl, isFreshTeamConfigured, listJobPostings, getJobPosting, listApplicantsForJob, getApplicant, getCandidate, sleep, getFreshTeamDelayMs, getFreshTeamOrigin, freshteamMigrationPlaceholderEmail, isFreshTeamJobPublishedStatus, mapFreshTeamJobStatusToHrms, headcountFromFreshTeamJob, recruiterEmailsFromFreshTeamJob, formatFreshTeamJobLocation, inferRegionCodeFromJobLocation, parseFreshTeamJobAudit } from "../../lib/freshteamApi.js";
import { insertCandidateSchema, insertJobPostingSchema, insertApplicationSchema, insertOfferSchema } from "../../db/schema/recruitment.js";
import { simpleParser } from "mailparser";
import { buildInterviewScheduleTimeFields, tryParseInterviewScheduleInstant, resolveInterviewScheduleIana, assertInterviewScheduleEndAfterStart, INTERVIEW_OUTLOOK_CALENDAR_IANA } from "../../lib/orgInterviewTime.js";
import { formatLeaveAppliedAt } from "../../../shared/dateTimeFormat.js";
import { trimOnsiteInterviewLocation } from "../../../shared/interviewOnsiteLocation.js";
import {
  formatOnsiteLocationForEmailHtml,
  replaceInterviewLocationInEmailHtml,
  replaceInterviewersListInInviteHtml,
} from "../../lib/interviewLocationEmail.js";
import {
  buildInterviewCalendarEventHtml,
  buildInterviewCalendarSubject,
  buildRecruitmentInterviewUrls,
  type InterviewCalendarEventDetails,
} from "../../lib/interviewCalendarEvent.js";
import type { CreateInterviewMeetingParams } from "../../services/teamsGraph.js";
import { getDefaultTz, parseLocalToUtc } from "../../lib/timezone.js";
import { emitRefreshAll } from "../../lib/notificationEvents.js";
import {
  deriveWorkflowFloorStage,
  enrichApplicationWorkflowFields,
  shouldBlockStageRegression,
} from "./workflowStage.js";

/** HR + recruiter emails scoped to a job's region (includes global_* / super-region grants). */
async function recruitmentTeamRecipients(
  jobId: string | null | undefined,
  roles: string[] = ["hr", "recruiter"],
): Promise<Recipient[]> {
  if (!jobId) return [];
  const region = await getJobRegion(jobId);
  return getEmailsByRolesForRegion(roles, region);
}

/** Guard against double-run of FreshTeam candidate migration. */
let freshteamCandidateMigrationInProgress = false;

function maskPlaceholderResumeUrl(url: string | null | undefined): string {
  const u = (url ?? "").trim();
  if (!u || u === "data:application/octet-stream;base64," || u === "data:application/octet-stream;base64") return "";
  if (u.startsWith("data:application/octet-stream;base64,") && u.replace(/\s/g, "").length < 60) return "";
  return u;
}

/**
 * Include the user who schedules as the first panel member (co-organizer) when they have an employee record.
 * Keeps Teams invites, emails, history, and feedback slots aligned with the scheduler on the panel.
 */
async function mergeSchedulerIntoInterviewerIds(
  repo: RecruitmentRepository,
  userId: string,
  interviewerIds: string[],
): Promise<string[]> {
  try {
    const emp = await repo.getEmployeeByUserId(userId);
    if (emp?.id && !interviewerIds.includes(emp.id)) {
      return [emp.id, ...interviewerIds];
    }
  } catch {
    /* ignore */
  }
  return interviewerIds;
}

/** ISO datetime string → Date if valid and within allowed window; otherwise null (send immediately). Throws ValidationError if present but invalid. */
function parseRejectCandidateNotifyAt(raw: unknown, rawTimezone: unknown): Date | null {
  if (raw == null) return null;
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  const tzCandidate = typeof rawTimezone === "string" ? rawTimezone.trim() : "";
  const tz = tzCandidate || getDefaultTz();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
  } catch {
    throw new ValidationError("Invalid timezone selected for scheduled candidate email.");
  }

  // Accept either ISO instant (legacy) or datetime-local "YYYY-MM-DDTHH:mm"
  let d: Date;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const [datePart, timePart] = s.split("T");
    d = parseLocalToUtc(datePart, timePart, tz);
  } else {
    d = new Date(s);
  }
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError("Invalid scheduled send time for candidate email.");
  }
  const now = Date.now();
  const minAheadMs = 60 * 1000;
  const maxAheadMs = 366 * 24 * 60 * 60 * 1000;
  if (d.getTime() < now + minAheadMs) {
    throw new ValidationError("Scheduled candidate email must be at least 1 minute in the future.");
  }
  if (d.getTime() > now + maxAheadMs) {
    throw new ValidationError("Scheduled candidate email cannot be more than one year in the future.");
  }
  return d;
}

const MICROSOFT_CALENDAR_CONNECT_REQUIRED =
  "Microsoft Calendar is not connected. Connect it once, then schedule again.";

/** Outlook calendar invite on the scheduler's mailbox — Teams (online meeting) and Onsite (location + invites). */
async function createInterviewOutlookEvent(opts: {
  format: "onsite" | "teams";
  start: Date;
  end: Date;
  iana: string;
  userId: string;
  attendeeEmails: string[];
  candidateEmail: string;
  calendarHtml: string;
  subject: string;
  locationPlain?: string | null;
  schedulerEmailLower?: string | null;
}): Promise<{ joinUrl: string | null; eventId: string | null; error?: string }> {
  if (!MS_INTERVIEW_CALENDAR_OAUTH_ENABLED) {
    return { joinUrl: null, eventId: null, error: "Interview calendar is not configured (MS_DELEGATED_CLIENT_ID)." };
  }

  const params: CreateInterviewMeetingParams = {
    start: opts.start,
    end: opts.end,
    subject: opts.subject,
    interviewerEmails: opts.attendeeEmails,
    candidateEmail: opts.candidateEmail,
    body: opts.calendarHtml,
    // Graph/Outlook display zone (US Eastern); opts.iana is only for schedule emails.
    ianaTimeZone: INTERVIEW_OUTLOOK_CALENDAR_IANA,
    isOnlineMeeting: opts.format === "teams",
    locationDisplay: opts.format === "onsite" ? opts.locationPlain ?? null : null,
    organizerEmailLower: opts.schedulerEmailLower ?? null,
  };

  const authService = new AuthService();
  const userToken = await authService.getValidInterviewCalendarAccessToken(opts.userId);
  if (!userToken) {
    return { joinUrl: null, eventId: null, error: MICROSOFT_CALENDAR_CONNECT_REQUIRED };
  }

  const meetingResult = await createMeetingAsUser(userToken, params);

  if (!meetingResult.success) {
    return { joinUrl: null, eventId: null, error: meetingResult.error ?? "Calendar event could not be created" };
  }
  if (opts.format === "teams" && !meetingResult.joinUrl && !meetingResult.eventId) {
    return {
      joinUrl: null,
      eventId: null,
      error: meetingResult.error ?? "Teams meeting could not be created",
    };
  }
  return {
    joinUrl: meetingResult.joinUrl ?? null,
    eventId: meetingResult.eventId ?? null,
  };
}

function buildInterviewCalendarDetails(input: {
  format: "onsite" | "teams";
  pipelineStage: "screening" | "interview";
  round: number;
  candidateName: string;
  jobTitle: string;
  jobDepartment?: string | null;
  candidateEmail?: string | null;
  candidatePhone?: string | null;
  applicationId: string;
  jobId: string;
  candidateId: string;
  interviewerNamesStr: string;
  location?: string | null;
  notes?: string | null;
  teamsJoinUrl?: string | null;
}): InterviewCalendarEventDetails {
  const appUrl = (resolvePublicAppUrlForTemplates() ?? "").replace(/\/$/, "");
  const urls = buildRecruitmentInterviewUrls(appUrl, input.applicationId, input.jobId, input.candidateId);
  return {
    candidateName: input.candidateName,
    jobTitle: input.jobTitle,
    jobDepartment: input.jobDepartment,
    pipelineStage: input.pipelineStage,
    round: input.round,
    format: input.format,
    candidateEmail: input.candidateEmail,
    candidatePhone: input.candidatePhone,
    profileUrl: urls.profileUrl,
    pipelineUrl: urls.pipelineUrl,
    commentsUrl: urls.commentsUrl,
    interviewsUrl: urls.interviewsUrl,
    interviewerNames: input.interviewerNamesStr,
    locationPlain: input.location ?? null,
    notes: input.notes ?? null,
    teamsJoinUrl: input.teamsJoinUrl ?? null,
  };
}

async function ensureSchedulerEmailOnMeeting(
  repo: RecruitmentRepository,
  userId: string,
  interviewerEmails: string[],
): Promise<string[]> {
  const normalized = interviewerEmails.map((e) => String(e).trim()).filter(Boolean);
  const seen = new Set(normalized.map((e) => e.toLowerCase()));

  const emp = await repo.getEmployeeByUserId(userId);
  const work = emp?.work_email?.trim();
  if (work && !seen.has(work.toLowerCase())) {
    return [work, ...normalized];
  }
  const login = await repo.getUserEmail(userId);
  const u = login?.trim();
  if (u && !seen.has(u.toLowerCase())) {
    return [u, ...normalized];
  }
  return normalized;
}

async function resolveSchedulerEmailLower(repo: RecruitmentRepository, userId: string): Promise<string | null> {
  const emp = await repo.getEmployeeByUserId(userId);
  const work = emp?.work_email?.trim();
  if (work) return work.toLowerCase();
  const login = await repo.getUserEmail(userId);
  return login?.trim().toLowerCase() || null;
}

function parseHmIds(j: any): string[] {
  const raw = j.hiring_manager_ids ?? j.hiring_manager_id;
  if (Array.isArray(raw)) return raw.filter((id): id is string => typeof id === "string");
  if (j.hiring_manager_id && typeof j.hiring_manager_id === "string") return [j.hiring_manager_id];
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p.filter((id:unknown): id is string => typeof id === "string") : []; } catch { return []; }
  }
  return [];
}

/** Multi-value params: use repeated keys (location=a&location=b). Single string is one whole value (locations may contain commas). */
function parseMultiParam(q: string | string[] | undefined): string[] {
  if (q == null || q === "") return [];
  if (Array.isArray(q)) return q.map((v) => String(v).trim()).filter(Boolean);
  const s = String(q).trim();
  return s ? [s] : [];
}

/** Replace {{teams_join_link}} in composed HTML after Teams is created (or leave empty for onsite). */
function injectTeamsLinkPlaceholders(html: string, teamsBlockHtml: string): string {
  if (!html) return "";
  return html.replace(/\{\{teams_join_link\}\}/gi, teamsBlockHtml);
}

function htmlToPlainText(html: string | null | undefined): string | null {
  if (html == null || typeof html !== "string" || !html.trim()) return null;
  let text = html.replace(/<br\s*\/?>/gi,"\n").replace(/<\/p>/gi,"\n").replace(/<\/div>/gi,"\n").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  text = text.replace(/\n{3,}/g,"\n\n").replace(/[ \t]+/g," ").trim();
  return text || null;
}

function extractMessageIdsFromHeaders(headersRaw: string | null | undefined): string[] {
  if (!headersRaw || typeof headersRaw !== "string") return [];
  const lines = headersRaw.split(/\r?\n/);
  const ids: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*(in-reply-to|references|message-id)\s*:\s*(.+)$/i);
    if (!m) continue;
    const value = m[2]?.trim();
    if (!value) continue;
    const headerIds = value.match(/<[^>]+>/g);
    if (headerIds && headerIds.length > 0) ids.push(...headerIds);
  }
  return Array.from(new Set(ids));
}

/** "Name <user@host>" or bare address — return normalized addr for DB matching. */
function extractEmailAddressFromHeader(fromHeader: string): string {
  const s = (fromHeader ?? "").trim();
  if (!s) return "";
  const angle = s.match(/<([^>]+@[^>]+)>/);
  if (angle) return angle[1].trim().toLowerCase();
  if (/^[^\s<]+@[^\s>]+$/.test(s)) return s.toLowerCase();
  return s;
}

/** SendGrid often URL-encodes `text` / `html` form fields. */
function maybeDecodeUrlEncodedInboundField(s: string): string {
  if (!s || !/%[0-9A-Fa-f]{2}/.test(s)) return s;
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

function pickInboundTextHtml(body: Record<string, unknown>): { textPlain: string; textHtml: string } {
  const data = (body.data as Record<string, unknown>) || body;
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = data[k] ?? body[k];
      if (v != null && String(v).trim()) return String(v);
    }
    return "";
  };
  let textPlain = pick("text", "plain", "stripped-text", "stripped_text", "body");
  let textHtml = pick("html", "stripped-html", "stripped_html");
  textPlain = maybeDecodeUrlEncodedInboundField(textPlain);
  textHtml = maybeDecodeUrlEncodedInboundField(textHtml);
  if (!textPlain.trim() && textHtml.trim()) {
    const plain = htmlToPlainText(textHtml);
    if (plain) textPlain = plain;
  }
  return { textPlain, textHtml };
}

function mapFtStageToOur(stage?: string): string {
  if (!stage) return "applied";
  const s = stage.toLowerCase();
  if (s.includes("hired") || s.includes("offer_accepted")) return "hired";
  if (s.includes("offer")) return "offer";
  if (s.includes("interview")) return "interview";
  if (s.includes("shortlist") || s.includes("shortlisted")) return "shortlisted";
  if (s.includes("screen") || s.includes("phone")) return "screening";
  if (s.includes("longlist") || s.includes("longlisted")) return "longlisted";
  if (s.includes("reject")) return "rejected";
  return "applied";
}

function emailFromApplicantSummary(appSummary: any, candidate?: any): string {
  const nested = appSummary?.candidate ?? appSummary?.candidate_details;
  return String(candidate?.email ?? nested?.email ?? appSummary?.email ?? "")
    .trim()
    .toLowerCase();
}

/** Resolve HRMS job id for an applicant (loop job id, or applicant.job_id on the FT record). */
function resolveOurJobIdForApplicant(
  ourJobMap: Map<string, string>,
  ftJobIdFromLoop: string,
  applicant: any,
  fallbackOurJobId: string
): string {
  const fromLoop = ourJobMap.get(String(ftJobIdFromLoop));
  if (fromLoop) return fromLoop;
  const ftJobOnApplicant = applicant?.job_id ?? applicant?.job_posting_id;
  if (ftJobOnApplicant != null) {
    const fromApplicant = ourJobMap.get(String(ftJobOnApplicant));
    if (fromApplicant) return fromApplicant;
  }
  return fallbackOurJobId;
}

/** Collect FT applicant record ids from GET /candidates/:id (field names vary by API version). */
function applicantIdsFromFtCandidate(ftCand: Record<string, unknown>): number[] {
  const ids = new Set<number>();
  const add = (v: unknown) => {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) ids.add(n);
  };
  const rawIds = ftCand.applicant_ids;
  if (Array.isArray(rawIds)) for (const id of rawIds) add(id);
  const applicants = ftCand.applicants;
  if (Array.isArray(applicants)) {
    for (const a of applicants) {
      if (a && typeof a === "object") add((a as { id?: unknown }).id);
    }
  }
  return Array.from(ids);
}

export type MigrateFreshteamCandidatesOptions = {
  /** Only link existing candidates to jobs (no resume download / new candidate create). */
  phase2Only?: boolean;
  /** Process first N applicants as link-only, then full import (resume, profile). */
  phase2ResumeAfterProcessed?: number;
  /**
   * After job applicant sync, link orphans via GET /candidates/:id applicant_ids
   * (covers archived / moved-to-pool when job applicant lists omit them).
   */
  backfillOrphans?: boolean;
  /** Only FT-linked jobs that have zero applications in HRMS (newly imported jobs). */
  onlyZeroApplicantJobs?: boolean;
  /** Restrict sync to these FreshTeam job posting ids (must be linked in HRMS). */
  ftJobIds?: string[];
};

function deriveResumeFilenameFromUrl(url: string): string {
  try { const u = new URL(url); const parts = u.pathname.split("/"); return parts[parts.length-1] || "resume.pdf"; } catch { return "resume.pdf"; }
}

/**
 * Resumes are stored only as URLs in the DB (SharePoint). We never store base64 data URLs.
 * - If resume is a data URL and SharePoint is configured → upload to SharePoint, return URL.
 * - If resume is a data URL and SharePoint is NOT configured → reject (resume storage not available).
 * - If resume is already a URL (e.g. existing SharePoint link) or empty → return as-is.
 */
async function uploadResumeIfNeeded(resumeUrl: string, candidateId?: string | number): Promise<string> {
  const isDataUrl = typeof resumeUrl === "string" && resumeUrl.trim().startsWith("data:");
  const useSharePoint = isSharePointAvatarConfigured();

  if (!isDataUrl) return resumeUrl ?? "";

  if (!useSharePoint) {
    throw new ValidationError(
      "Resume upload is not available right now. Please save your resume and contact HR, or try again later."
    );
  }

  const parsed = parseDataUrl(resumeUrl);
  if (!parsed) throw new ValidationError("Invalid resume file format (could not parse data URL).");

  const ext = parsed.contentType.toLowerCase().includes("pdf") ? "pdf" : "png";
  const idPart = candidateId != null ? String(candidateId) : crypto.randomUUID();
  const fileName = `resume-${idPart}.${ext}`;
  try {
    const url = await uploadFileToSharePoint("Recruitment/Resumes", fileName, parsed.buffer, parsed.contentType);
    if (!url) throw new Error("No URL returned");
    return url;
  } catch (e) {
    console.error("SharePoint resume upload failed", e);
    throw new Error("Resume could not be saved to storage. Please try again or contact support. (SharePoint upload failed.)");
  }
}

type QueryParams = Record<string, string | string[] | undefined>;

/**
 * Fetch an offer letter and return it as a Buffer for email attachment.
 * Handles both data URLs (base64) and http(s) URLs (SharePoint / direct links).
 * Returns null if the file can't be fetched or is too large (>15 MB).
 */
async function fetchOfferLetterBuffer(url: string): Promise<Buffer | null> {
  const MAX_BYTES = 15 * 1024 * 1024; // 15 MB – well within Resend's 40 MB limit
  const u = (url ?? "").trim();
  if (!u) return null;

  // Data URL — parse directly
  if (u.startsWith("data:")) {
    const idx = u.indexOf(";base64,");
    if (idx === -1) return null;
    const b64 = u.slice(idx + 8).replace(/\s/g, "");
    const buf = Buffer.from(b64, "base64");
    return buf.length > 0 && buf.length <= MAX_BYTES ? buf : null;
  }

  // HTTP/HTTPS URL — download
  if (u.startsWith("http://") || u.startsWith("https://")) {
    const res = await fetch(u, { redirect: "follow" });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength === 0 || ab.byteLength > MAX_BYTES) return null;
    return Buffer.from(ab);
  }

  return null;
}

/** Download merged offer DOCX (or similar) for attachments — same fallbacks as offer PDF fetch. */
async function fetchMergedDocumentBuffer(url: string): Promise<Buffer | null> {
  const u = (url ?? "").trim();
  if (!u) return null;
  let buf = await fetchOfferLetterBuffer(u);
  if (!buf && /sharepoint\.com|onedrive\.live\.com/i.test(u)) {
    const sharePointResult = await getAvatarContentBySharingUrl(u);
    if (sharePointResult) buf = sharePointResult.buffer;
  }
  // Fallback: DB may store raw base64 when SharePoint is not configured (see OfferTemplateService.uploadMergedOfferArtifact).
  if (!buf && !u.startsWith("http://") && !u.startsWith("https://") && !u.startsWith("data:")) {
    try {
      const raw = Buffer.from(u, "base64");
      if (raw.length > 0 && raw.length <= 15 * 1024 * 1024) buf = raw;
    } catch {
      /* ignore */
    }
  }
  return buf;
}

function qint(v: string | string[] | undefined, fallback = 0): number {
  const n = parseInt(Array.isArray(v) ? v[0] : v ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

function qstr(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] : v ?? "";
}

/** Ensure interview invite templates get deep-link placeholders (preview context historically omitted these). */
function injectInterviewScheduleEmailPlaceholders(html: string, appUrl: string, applicationId: string, jobId: string): string {
  if (!html) return html;
  const base = appUrl.replace(/\/$/, "");
  return html
    .replace(/\{\{app_url\}\}/gi, base)
    .replace(/\{\{application_id\}\}/gi, applicationId)
    .replace(/\{\{job_id\}\}/gi, jobId);
}


export class RecruitmentService {
  private readonly r = new RecruitmentRepository();
  private readonly employeeSvc = new EmployeeService();

  private toRoleSet(user?: UserPayload): Set<string> {
    if (!user) return new Set();
    return new Set<string>([user.role, ...(user.roles ?? [])].filter(Boolean));
  }

  private uniq(ids: Array<string | null | undefined>): string[] {
    return Array.from(new Set(ids.map((v) => String(v || "").trim()).filter(Boolean)));
  }

  /** User ids only — maps legacy employee ids and drops deleted/inactive users. */
  private async resolveAssignmentUserIds(ids: string[]): Promise<string[]> {
    return this.r.resolveUserIdsForAssignments(ids);
  }

  /**
   * Rule 4: hiring_manager / limited_recruiter assignments must be in the same region as
   * the job. Cross-region assignment is only allowed for regional_super_admin users.
   * Recruiters are also scoped — they should not be assigned to a job outside their region.
   */
  private async assertAssigneesInRegion(
    jobRegion: string | null,
    assigneeUserIds: string[],
    actor?: UserPayload,
  ): Promise<void> {
    // Super region admin can cross-assign freely.
    if (actor?.isRegionalSuperAdmin) return;
    // If the job has no region, skip check (will be fail-closed at access time anyway).
    if (!jobRegion) return;
    if (assigneeUserIds.length === 0) return;

    const regionMap = await this.r.getUsersRegion(assigneeUserIds);
    const mismatched = assigneeUserIds.filter((uid) => {
      const uRegion = regionMap.get(uid);
      return uRegion != null && uRegion !== jobRegion;
    });
    if (mismatched.length > 0) {
      throw new ValidationError(
        `Cross-region assignment not allowed. Assignees must be in the same region as the job (${jobRegion}).`,
      );
    }
  }

  private async getPolicy(user?: UserPayload): Promise<UserPolicy | null> {
    if (!user) return null;
    return resolvePolicy(user);
  }

  private async assertCandidateAccess(candidateId: string, user?: UserPayload, requestedRegion?: string | null): Promise<void> {
    if (!user) return;

    const regions = effectiveRegionsFor(user, requestedRegion);
    if (regions !== null) {
      const hasRegion = await this.r.candidateHasApplicationInRegions(candidateId, regions);
      if (!hasRegion) {
        const err = new Error("You do not have access to this candidate.");
        (err as any).statusCode = 403;
        throw err;
      }
    }

    const policy = await this.getPolicy(user);
    if (!policy || policy.isOrgWideRecruit) return;
    const assigned = assignedJobFilter(policy) ?? [];
    const candidateJobIds = await this.r.getCandidateJobIds(candidateId);
    if (candidateJobIds.length === 0) return;
    if (!candidateJobIds.some((jobId) => assigned.includes(jobId))) {
      const err = new Error("You do not have access to this candidate.");
      (err as any).statusCode = 403;
      throw err;
    }
  }

  async listRecruitmentAssignableUsers() {
    const rows = await this.r.getRecruitmentAssignableUsers();
    const normalizeRoles = (raw: unknown): string[] => {
      if (Array.isArray(raw)) return raw.map((r) => String(r).trim()).filter(Boolean);
      if (typeof raw === "string" && raw.trim()) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed.map((r) => String(r).trim()).filter(Boolean);
        } catch {
          // ignore parse errors; fall back to empty grants
        }
      }
      return [];
    };
    return rows.map((u: any) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      roles: normalizeRoles(u.roles),
      employeeId: u.employee_id ?? null,
      first_name: u.first_name ?? null,
      last_name: u.last_name ?? null,
      display_name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email,
    }));
  }

  // ── Candidates ──────────────────────────────────────────────────────────────
  async listCandidates(query: QueryParams, user?: UserPayload) {
    const limit = Math.min(qint(query.limit, 50), 500);
    const offset = qint(query.offset);
    const searchRaw = qstr(query.search).trim();
    const search = searchRaw.length > 0 ? `%${searchRaw}%` : null;
    const stageFilter = Array.isArray(query.stage) ? (query.stage as string[]).filter(Boolean) : (query.stage ? [query.stage as string] : []);
    const sourceFilter = Array.isArray(query.source) ? (query.source as string[]).filter(Boolean) : (query.source ? [query.source as string] : []);
    const departmentFilter = Array.isArray(query.department) ? (query.department as string[]).filter(Boolean) : (query.department ? [query.department as string] : []);
    const jobIdFilter = Array.isArray(query.jobId) ? (query.jobId as string[]).filter(Boolean) : (query.jobId ? [query.jobId as string] : []);
    const policy = await this.getPolicy(user);
    const scopedJobIds = policy ? assignedJobFilter(policy) : null;
    const regions = user ? effectiveRegionsFor(user, query.region as string) : null;
    return this.r.listCandidates(limit, offset, search, scopedJobIds ?? undefined, stageFilter.length ? stageFilter : undefined, sourceFilter.length ? sourceFilter : undefined, departmentFilter.length ? departmentFilter : undefined, jobIdFilter.length ? jobIdFilter : undefined, regions);
  }

  async getCandidateFilterOptions(query: QueryParams, user?: UserPayload) {
    const policy = await this.getPolicy(user);
    const scopedJobIds = policy ? assignedJobFilter(policy) : null;
    const regions = user ? effectiveRegionsFor(user, query.region as string) : null;
    return this.r.getCandidateFilterOptions(scopedJobIds ?? undefined, regions);
  }

  async getCandidateById(id: string, user?: UserPayload, query?: QueryParams) {
    await this.assertCandidateAccess(id, user, query?.region as string);
    const c = await this.r.getCandidateById(id);
    if (!c) throw new NotFoundError("Candidate not found");
    const regions = user ? effectiveRegionsFor(user, query?.region as string) : null;
    let applications = c.applications;
    if (regions !== null && Array.isArray(applications)) {
      applications = applications.filter((a: any) => a.job_region_code && regions.includes(a.job_region_code));
    }
    return { ...c, applications, resume_url: maskPlaceholderResumeUrl(c.resume_url) };
  }

  async getCandidateResume(id: string, user?: UserPayload) {
    await this.assertCandidateAccess(id, user);
    const row = await this.r.getCandidateResume(id);
    if (!row) throw new NotFoundError("Candidate not found");
    return row;
  }

  private static readonly RECRUITMENT_STAFF_ROLES: SystemRole[] = ["admin", "hr", "recruiter", "limited_recruiter"];

  private isRecruitmentStaff(user: UserPayload): boolean {
    return hasAnyRole(
      { id: user.id, email: user.email, role: user.role, roles: user.roles ?? [] },
      RecruitmentService.RECRUITMENT_STAFF_ROLES,
    );
  }

  /** Region stamp for talent-pool creates. Staff manual adds must always resolve a region. */
  private async resolveCandidateRegionCode(
    user: UserPayload | undefined,
    requestedRegion: string | null | undefined,
    requireForStaff: boolean,
  ): Promise<string | null> {
    if (!user) return null;

    const regions = effectiveRegionsFor(user, requestedRegion);
    let region: string | null = null;

    if (regions !== null && regions.length === 1) {
      region = regions[0];
    } else if (regions === null) {
      if (isValidRegionCode(requestedRegion)) region = requestedRegion;
      else region = user.regionCode ?? null;
    }

    if (!region) {
      region = await getUserRegion(user.id);
    }

    if (requireForStaff && this.isRecruitmentStaff(user) && !region) {
      throw new ValidationError(
        "Could not determine your region for this candidate. Assign a branch to your user account in Access Control.",
      );
    }

    return region;
  }

  async createCandidate(
    body: any,
    user?: UserPayload,
    requestedRegion?: string | null,
    opts?: { staffManual?: boolean },
  ): Promise<{ candidate: any; isNew: boolean }> {
    const validated = insertCandidateSchema.parse(body);
    const regionCode = await this.resolveCandidateRegionCode(user, requestedRegion, opts?.staffManual === true);
    let resumeUrl: string = validated.resumeUrl ?? "";
    resumeUrl = await uploadResumeIfNeeded(resumeUrl);
    const emailNorm = (validated.email ?? "").trim().toLowerCase();
    const existing = emailNorm ? await this.r.findCandidateByEmailFull(emailNorm) : null;
    if (existing) {
      const patch: Record<string, unknown> = { ...validated, tags: validated.tags ?? null };
      if (regionCode && !(existing as { region_code?: string | null }).region_code) {
        patch.regionCode = regionCode;
      }
      const updated = await this.r.updateCandidate(existing.id, patch, resumeUrl || undefined);
      emitRefreshAll();
      return { candidate: updated, isNew: false };
    }
    const candidate = await this.r.createCandidate({ ...validated, resumeUrl, regionCode });
    emitRefreshAll();
    return { candidate, isNew: true };
  }

  async updateCandidate(id: string, body: any, user?: UserPayload) {
    await this.assertCandidateAccess(id, user);
    const existing = await this.r.getCandidateById(id);
    if (!existing) throw new NotFoundError("Candidate not found");
    let resumeUrl: string | undefined = body.resumeUrl;
    if (resumeUrl) resumeUrl = await uploadResumeIfNeeded(resumeUrl, id);
    const updated = await this.r.updateCandidate(id, body, resumeUrl);
    emitRefreshAll();
    return updated;
  }

  async deleteCandidate(id: string, user?: UserPayload) {
    await this.assertCandidateAccess(id, user);
    const r = await this.r.deleteCandidate(id);
    if (!r) throw new NotFoundError("Candidate not found");
    emitRefreshAll();
  }

  // ── Job Postings ──────────────────────────────────────────────────────────────
  async getJobFilterOptions(user?: UserPayload) {
    const policy = await this.getPolicy(user);
    const scopedJobIds = policy ? assignedJobFilter(policy) : null;
    return this.r.getJobFilterOptions(scopedJobIds ?? undefined);
  }

  async listJobs(query: QueryParams, user?: UserPayload) {
    const statuses = parseMultiParam(query.status);
    const departments = parseMultiParam(query.department);
    const locations = parseMultiParam(query.location);
    const employmentTypes = parseMultiParam(query.employmentType);
    const limit = Math.min(qint(query.limit, 200), 500);
    const offset = qint(query.offset);

    // Resolve scope filter
    let scopedJobIds: string[] | null = null;
    if (user) {
      const policy = await resolvePolicy(user);
      scopedJobIds = assignedJobFilter(policy);
    }
    const regions = user ? effectiveRegionsFor(user, (query as any).region) : null;

    const { jobs, total } = await this.r.listJobs(statuses, departments, locations, employmentTypes, limit, offset, scopedJobIds ?? undefined, regions);
    if (jobs.length === 0) return { jobs: [], total };
    const jobIds = jobs.map((j:any)=>j.id);
    const countMap = await this.r.getJobApplicationCounts(jobIds);
    const allHmIds = new Set<string>();
    const auditUserIds = new Set<string>();
    const enrichedBase = jobs.map((j:any) => {
      const hmIds = parseHmIds(j);
      hmIds.forEach((id:string)=>allHmIds.add(id));
      if (j.created_by) auditUserIds.add(String(j.created_by));
      if (j.updated_by) auditUserIds.add(String(j.updated_by));
      const counts = countMap.get(j.id) ?? {
        application_count: 0,
        hired_count: 0,
        rejected_count: 0,
        recent_applications_7d: 0,
      };
      return {
        ...j,
        application_count: counts.application_count,
        hired_count: counts.hired_count,
        rejected_count: counts.rejected_count,
        recent_applications_7d: counts.recent_applications_7d,
        hm_ids: hmIds,
      };
    });
    const [nameMap, userNameMap] = await Promise.all([
      this.r.batchResolveEmployeeNames(Array.from(allHmIds)),
      this.r.batchResolveUserDisplayNames(Array.from(auditUserIds)),
    ]);
    const enriched = enrichedBase.map((j:any) => ({
      ...j,
      hm_names: j.hm_ids.map((id:string)=>nameMap.get(id)||id),
      created_by_name: j.created_by ? (userNameMap.get(String(j.created_by)) ?? null) : null,
      updated_by_name: j.updated_by ? (userNameMap.get(String(j.updated_by)) ?? null) : null,
    }));
    return { jobs: enriched, total };
  }

  async getPublishedJobs(regionCode?: string | null) { return this.r.getPublishedJobs(regionCode); }

  async getJobById(id: string, user?: UserPayload) {
    const job = await this.r.getJobById(id);
    if (!job) throw new NotFoundError("Job posting not found");
    if (user) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, id);
    }
    const hmIds = job.hiring_manager_ids ? (Array.isArray(job.hiring_manager_ids) ? job.hiring_manager_ids : JSON.parse(job.hiring_manager_ids)) : (job.hiring_manager_id ? [job.hiring_manager_id] : []);
    const auditUserIds = [job.created_by, job.updated_by].filter(Boolean).map(String);
    const [applications, assignments] = await Promise.all([
      this.r.getJobApplications(id),
      this.r.getJobAssignments(id),
    ]);
    let recruiterUserIds = assignments.filter((a) => a.role === "recruiter").map((a) => a.user_id);
    const limitedRecruiterUserIds = assignments.filter((a) => a.role === "limited_recruiter").map((a) => a.user_id);
    if (recruiterUserIds.length === 0 && job.created_by) {
      recruiterUserIds = [String(job.created_by)];
    }
    let hiringManagerUserIds = assignments.filter((a) => a.role === "hiring_manager").map((a) => a.user_id);
    let hiringManagerLabelIds = [...hiringManagerUserIds];
    if (hiringManagerLabelIds.length === 0 && hmIds.length > 0) {
      const resolvedHmUserIds = await this.r.resolveUserIdsForAssignments(hmIds);
      hiringManagerUserIds = resolvedHmUserIds;
      hiringManagerLabelIds = resolvedHmUserIds.length > 0 ? resolvedHmUserIds : hmIds.map(String);
    }
    const labelIds = [
      ...recruiterUserIds,
      ...limitedRecruiterUserIds,
      ...hiringManagerLabelIds,
      ...auditUserIds,
    ];
    const nameMap = await this.r.batchResolveAssigneeDisplayNames(labelIds);
    const nameFor = (id: string) => nameMap.get(String(id)) || String(id);
    return {
      ...job,
      hm_names: hiringManagerLabelIds.map(nameFor),
      hm_ids: hmIds,
      applications,
      recruiter_user_ids: recruiterUserIds,
      limited_recruiter_user_ids: limitedRecruiterUserIds,
      hiring_manager_user_ids: hiringManagerUserIds,
      recruiter_names: recruiterUserIds.map(nameFor),
      limited_recruiter_names: limitedRecruiterUserIds.map(nameFor),
      created_by_name: job.created_by ? (nameMap.get(String(job.created_by)) ?? null) : null,
      updated_by_name: job.updated_by ? (nameMap.get(String(job.updated_by)) ?? null) : null,
    };
  }

  async createJob(body: any, user?: UserPayload) {
    const validated = insertJobPostingSchema.parse(body);
    const roleSet = this.toRoleSet(user);
    const creatorIsDefaultRecruiter = roleSet.has("recruiter") || roleSet.has("hr") || roleSet.has("admin");
    const recruiterUserIds = await this.resolveAssignmentUserIds(this.uniq([
      ...(Array.isArray(body.recruiterUserIds) ? body.recruiterUserIds : []),
      creatorIsDefaultRecruiter ? user?.id : undefined,
    ]));
    const limitedRecruiterUserIds = await this.resolveAssignmentUserIds(
      this.uniq(Array.isArray(body.limitedRecruiterUserIds) ? body.limitedRecruiterUserIds : []),
    );
    const hiringManagerUserIds = await this.resolveAssignmentUserIds(
      this.uniq(Array.isArray(body.hiringManagerUserIds) ? body.hiringManagerUserIds : []),
    );
    const combinedRecruiters = recruiterUserIds.length + limitedRecruiterUserIds.length;
    if (combinedRecruiters === 0) throw new ValidationError("At least one recruiter is required.");

    // Edge-case 1: branchId / location / creator region (in priority order).
    let jobRegionCode: string | null = (body.regionCode as string | undefined) ?? null;
    if (!jobRegionCode && body.branchId) {
      jobRegionCode = await this.r.getBranchRegion(body.branchId as string);
    }
    if (!jobRegionCode && validated.location) {
      jobRegionCode = inferRegionFromLocationString(validated.location) ?? null;
    }
    if (!jobRegionCode) {
      jobRegionCode = user?.regionCode ?? null;
    }

    // Rule 4: All assignees must be in the same region as the job.
    const allAssigneeIds = [...recruiterUserIds, ...limitedRecruiterUserIds, ...hiringManagerUserIds];
    await this.assertAssigneesInRegion(jobRegionCode, allAssigneeIds, user);

    const created = await this.r.createJob({
      ...validated,
      hmIds: body.hiringManagerIds,
      createdBy: user?.id ?? null,
      regionCode: jobRegionCode,
    });
    await this.r.replaceJobAssignments(
      created.id,
      [
        ...recruiterUserIds.map((userId) => ({ userId, role: "recruiter" as const })),
        ...limitedRecruiterUserIds.map((userId) => ({ userId, role: "limited_recruiter" as const })),
        ...hiringManagerUserIds.map((userId) => ({ userId, role: "hiring_manager" as const })),
      ]
    );
    void this.r.auditLog("job", created.id, "JOB_CREATED", user?.id ?? null, { title: (created as any).title ?? validated.title });
    emitRefreshAll();
    return created;
  }

  async updateJob(id: string, body: any, user?: UserPayload) {
    const existing = await this.r.getJobById(id);
    if (!existing) throw new NotFoundError("Job posting not found");
    if (user) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, id);
    }
    const updatePayload = { ...body };
    if (body.branchId || body.location != null) {
      let rc: string | null = body.branchId
        ? await this.r.getBranchRegion(String(body.branchId))
        : null;
      if (!rc) {
        const loc = body.location != null ? String(body.location) : String((existing as { location?: string }).location ?? "");
        rc = inferRegionFromLocationString(loc);
      }
      if (rc) updatePayload.regionCode = rc;
    }
    const result = await this.r.updateJob(id, { ...updatePayload, updatedBy: user?.id ?? null });
    const hasOwnershipPayload =
      body.recruiterUserIds !== undefined ||
      body.limitedRecruiterUserIds !== undefined ||
      body.hiringManagerUserIds !== undefined;
    if (hasOwnershipPayload) {
      const recruiterUserIds = await this.resolveAssignmentUserIds(
        this.uniq(Array.isArray(body.recruiterUserIds) ? body.recruiterUserIds : []),
      );
      const limitedRecruiterUserIds = await this.resolveAssignmentUserIds(
        this.uniq(Array.isArray(body.limitedRecruiterUserIds) ? body.limitedRecruiterUserIds : []),
      );
      const hiringManagerUserIds = await this.resolveAssignmentUserIds(
        this.uniq(Array.isArray(body.hiringManagerUserIds) ? body.hiringManagerUserIds : []),
      );
      if (recruiterUserIds.length + limitedRecruiterUserIds.length === 0) {
        throw new ValidationError("At least one recruiter is required.");
      }
      // Rule 4: Assignees must be in the job's region.
      const jobRegion = (existing as any).region_code ?? null;
      const allAssigneeIds = [...recruiterUserIds, ...limitedRecruiterUserIds, ...hiringManagerUserIds];
      await this.assertAssigneesInRegion(jobRegion, allAssigneeIds, user);
      await this.r.replaceJobAssignments(
        id,
        [
          ...recruiterUserIds.map((userId) => ({ userId, role: "recruiter" as const })),
          ...limitedRecruiterUserIds.map((userId) => ({ userId, role: "limited_recruiter" as const })),
          ...hiringManagerUserIds.map((userId) => ({ userId, role: "hiring_manager" as const })),
        ]
      );
    }
    void this.r.auditLog("job", id, "JOB_UPDATED", user?.id ?? null, { title: (result as any).title ?? body.title, status: body.status });
    // Email: job published notification
    if (body.status === "published" && existing.status !== "published") {
      (async()=>{try{const team=await recruitmentTeamRecipients(String((result as { id?: string }).id ?? id));const ctx={job_title:result.title||"New Opening",department:result.department||"—",location:result.location||"—",job_id:String((result as { id?: string }).id ?? id)};if(team.length)await notifyEmail("recruit.job_published",ctx,team);}catch{}})();
    }
    emitRefreshAll();
    return result;
  }

  async deleteJob(id: string, user?: UserPayload) {
    if (user) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, id);
    }
    const r = await this.r.deleteJob(id);
    if (!r) throw new NotFoundError("Job posting not found");
    void this.r.auditLog("job", id, "JOB_DELETED", user?.id ?? null);
    emitRefreshAll();
  }

  // ── Application Form Config ────────────────────────────────────────────────────
  async getApplicationFormConfig() { return this.r.getApplicationFormConfig(); }
  async saveApplicationFormConfig(config: unknown) { return this.r.saveApplicationFormConfig(config); }
  async getJobFormConfig(jobId: string) { return this.r.getJobFormConfig(jobId); }
  async saveJobFormConfig(jobId: string, config: unknown) { return this.r.saveJobFormConfig(jobId, config); }
  async syncApplicationFormToAllJobs() { return this.r.syncAllJobPostingsFormConfigFromGlobalDefault(); }

  // ── Applications ──────────────────────────────────────────────────────────────
  async listApplications(query: QueryParams, user?: UserPayload) {
    const jobId = qstr(query.jobId) || undefined;
    const candidateId = qstr(query.candidateId) || undefined;
    const hasFilter = !!jobId || !!candidateId;
    const defaultLimit = hasFilter ? 50 : 200;
    const limit = Math.min(qint(query.limit, defaultLimit), 500);
    const offset = qint(query.offset);

    let scopedJobIds: string[] | null = null;
    if (user) {
      const policy = await resolvePolicy(user);
      scopedJobIds = assignedJobFilter(policy);
      // If user requested a specific job they don't have access to → enforce
      if (jobId && scopedJobIds !== null && !scopedJobIds.includes(jobId)) {
        return { applications: [], total: 0 };
      }
    }
    const regions = user ? effectiveRegionsFor(user, (query as any).region) : null;
    // Region pre-check for a job-scoped query: hide if the job is in another region.
    if (regions !== null && jobId) {
      const jobRegion = await getJobRegion(jobId);
      if (!jobRegion || !regions.includes(jobRegion)) {
        return { applications: [], total: 0 };
      }
    }

    let applications: any[];
    let totalForJob: number | null = null;
    if (jobId) {
      const searchRaw = qstr(query.search).trim();
      const search = searchRaw.length > 0 ? `%${searchRaw}%` : null;
      const result = await this.r.listApplicationsByJob(jobId, limit, offset, search);
      applications = result.applications; totalForJob = result.total;
    } else if (candidateId) {
      await this.assertCandidateAccess(candidateId, user, query.region as string);
      applications = await this.r.listApplicationsByCandidate(candidateId, limit, offset, regions) as any[];
      if (scopedJobIds !== null) applications = applications.filter((a: any) => scopedJobIds.includes(a.job_id));
    } else {
      applications = await this.r.listApplications(limit, offset, scopedJobIds ?? undefined, regions) as any[];
    }
    const withResumeUrl = applications.map((row: any) => ({
      ...row,
      resume_url: row.resume_url ?? null,
      ...enrichApplicationWorkflowFields(row),
    }));
    return totalForJob !== null ? { applications: withResumeUrl, total: totalForJob } : withResumeUrl;
  }

  async getApplicationById(id: string, user?: UserPayload) {
    const app = await this.r.getApplicationById(id);
    if (!app) throw new NotFoundError("Application not found");
    if (user && app.job_id) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, app.job_id);
    }
    const maskedApp = { ...app, resume_url: maskPlaceholderResumeUrl(app.resume_url) };
    const [history, offerRows, tentativeRow] = await Promise.all([
      this.r.getApplicationStageHistory(id),
      this.r.getOffersByApplication(id),
      this.r.getTentativeForApplication(id),
    ]);
    const offer = offerRows[0] || null;
    const wf = enrichApplicationWorkflowFields({
      stage: app.stage,
      tentative_status: tentativeRow?.status ?? null,
      offer_id: offer?.id ?? null,
      offer_status: offer?.status ?? null,
    });
    return { ...maskedApp, stage_history: history, offer, ...wf };
  }

  async createApplication(body: any, userId: string | null, isAuthenticated: boolean, user?: UserPayload) {
    const validated = insertApplicationSchema.parse(body);
    const [candidateCheck, jobCheck] = await Promise.all([this.r.getCandidateRow(validated.candidateId), this.r.getJobPosting(validated.jobId)]);
    if (!candidateCheck) throw new NotFoundError("Candidate not found");
    if (!jobCheck) throw new NotFoundError("Job posting not found");
    if (await this.r.applicationExistsForJob(validated.candidateId, validated.jobId)) {
      throw new ConflictError("This candidate is already applied to this job.");
    }
    const allowedStatuses = isAuthenticated ? ["published", "paused"] : ["published"];
    if (!allowedStatuses.includes(jobCheck.status)) throw new ValidationError("This job is not currently accepting applications.");
    if (user) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, validated.jobId);
    }
    // Applicant inherits the job's region (career-page submissions are unauthenticated).
    const applicationRegion = (jobCheck as any).region_code ?? (await getJobRegion(validated.jobId));
    const created = await this.r.createApplication(validated, userId, applicationRegion ?? null);
    if (applicationRegion) {
      await this.r.patchCandidateRegionIfMissing(validated.candidateId, applicationRegion);
    }
    void this.r.auditLog("application", (created as any).id, "APPLICATION_CREATED", userId, { jobId: validated.jobId, candidateId: validated.candidateId });

    const isCareerPageApplication =
      !isAuthenticated || String(validated.referralSource ?? "").trim().toLowerCase() === "career_page";
    if (isCareerPageApplication) {
      (async () => {
        try {
          const full = await this.r.getApplicationById((created as { id: string }).id);
          if (!full?.candidate_email) return;
          const candidateName =
            `${full.first_name || ""} ${full.last_name || ""}`.trim() || "Applicant";
          const appUrl = resolvePublicAppUrlForTemplates();
          const ctx: NotifyContext = {
            candidate_name: candidateName,
            candidate_email: full.candidate_email,
            job_title: full.job_title || "—",
            department: full.job_department || "—",
            location: full.job_location || "—",
            application_id: String((created as { id: string }).id),
            job_id: String(validated.jobId),
            careers_url: `${appUrl}/careers`,
          };
          await notifyEmail("recruit.application_received_candidate", ctx, [
            { email: full.candidate_email, name: candidateName },
          ]);
        } catch {
          /* non-fatal */
        }
      })();
    }

    emitRefreshAll();
    return created;
  }

  /**
   * Applies a pipeline stage transition (history row, tentative cancel side-effects, audit, email).
   * `stage` may include `offer` and `tentative` for internal restore flows; public PATCH only allows manual stages.
   */
  private async applyApplicationStageTransition(id: string, stage: string, body: any, userId: string, user?: UserPayload) {
    const {
      notes,
      interviewerNames,
      interviewerIds,
      scheduledAt,
      rejectReason,
      interviewType,
      notifyCandidate,
      rejectNotifyAt,
      rejectNotifyTimezone,
    } = body;
    const existing = await this.r.getApplicationById(id);
    if (!existing) throw new NotFoundError("Application not found");
    if (user && existing.job_id) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, existing.job_id);
    }
    if (existing.stage === "hired") throw new ValidationError("Cannot change stage of a hired candidate");

    const [tentative, offerRows] = await Promise.all([this.r.getTentativeForApplication(id), this.r.getOffersByApplication(id)]);
    const offer = offerRows[0];
    const { floorStage } = deriveWorkflowFloorStage({
      tentativeStatus: tentative?.status,
      offerId: offer?.id,
      offerStatus: offer?.status,
    });
    if (shouldBlockStageRegression(stage, floorStage)) {
      throw new ValidationError(
        `That stage is behind your active workflow. The pipeline should be at "${floorStage}" or later while offer work exists. ` +
          `Use POST /applications/:id/restore-workflow-stage to realign, or reject the candidate.`,
      );
    }

    const fromStage = existing.stage;
    if (fromStage === "rejected" && stage !== "rejected") {
      await this.r.cancelPendingScheduledRecruitmentEmails(id, "recruit.application_rejected_candidate");
    }

    const { application, stageHistoryId } = await this.r.updateApplicationStage(id, stage, fromStage, { notes, interviewerNames, interviewerIds, scheduledAt, rejectReason, interviewType }, userId);
    if (stageHistoryId && Array.isArray(interviewerIds) && interviewerIds.length) {
      const filtered = interviewerIds.filter((x: unknown) => typeof x === "string" && String(x).trim()) as string[];
      if (filtered.length) {
        const seedIds = await mergeSchedulerIntoInterviewerIds(this.r, userId, filtered);
        await this.r.seedFeedbackSlotsForHistory(stageHistoryId, id, seedIds);
      }
    }
    if (fromStage === "tentative" && stage !== "tentative") {
      await this.r.cancelTentativeIfPending(id);
    }
    await this.r.auditLog("application", id, "STAGE_CHANGED", userId, {
      fromStage,
      toStage: stage,
      notes: notes ?? null,
      ...(stage === "rejected" && rejectReason ? { rejectReason: String(rejectReason) } : {}),
    });

    let rejectionEmailSendAt: Date | null = null;
    if (stage === "rejected" && notifyCandidate) {
      rejectionEmailSendAt = parseRejectCandidateNotifyAt(rejectNotifyAt, rejectNotifyTimezone);
      if (rejectionEmailSendAt) {
        const early = await this.r.getApplicationStageDetail(id);
        if (!early?.candidate_email?.trim()) {
          throw new ValidationError("Candidate has no email on file; cannot schedule a notification.");
        }
      }
    }

    (async () => {
      try {
        const detail = await this.r.getApplicationStageDetail(id);
        if (!detail) return;
        const candidateName = `${detail.first_name || ""} ${detail.last_name || ""}`.trim() || "Candidate";
        const ownerName = detail.owner_display_name || "HR Team";
        const ctx = {
          candidate_name: candidateName,
          candidate_email: detail.candidate_email || "—",
          job_title: detail.job_title || "—",
          old_stage: fromStage,
          new_stage: stage,
          doer_name: userId,
          owner_name: ownerName,
          application_id: id,
          job_id: String(existing.job_id ?? ""),
        };
        const team = await recruitmentTeamRecipients(String(existing.job_id ?? ""));
        if (stage === "verbally_accepted" && team.length) {
          await notifyEmail("candidate.verbal_acceptance", ctx, team);
        } else if (stage === "rejected") {
          if (team.length) await notifyEmail("recruit.stage_changed", ctx, team);
          if (notifyCandidate && detail.candidate_email) {
            if (rejectionEmailSendAt) {
              await this.r.cancelPendingScheduledRecruitmentEmails(id, "recruit.application_rejected_candidate");
              await this.r.insertScheduledRecruitmentEmail({
                applicationId: id,
                eventKey: "recruit.application_rejected_candidate",
                recipientEmail: detail.candidate_email,
                recipientName: candidateName,
                context: ctx,
                sendAt: rejectionEmailSendAt,
              });
            } else {
              await notifyEmail("recruit.application_rejected_candidate", ctx, [
                { email: detail.candidate_email, name: candidateName },
              ]);
            }
          }
        } else if (team.length) {
          await notifyEmail("recruit.stage_changed", ctx, team);
        }
      } catch {
        /* non-fatal */
      }
    })();

    emitRefreshAll();

    const full = await this.r.getApplicationById(id);
    const out = full ?? application;
    const [t2, o2] = await Promise.all([this.r.getTentativeForApplication(id), this.r.getOffersByApplication(id)]);
    const off = o2[0];
    return {
      ...out,
      ...enrichApplicationWorkflowFields({
        stage: out.stage,
        tentative_status: t2?.status ?? null,
        offer_id: off?.id ?? null,
        offer_status: off?.status ?? null,
      }),
    };
  }

  async updateApplicationStage(id: string, body: any, userId: string, user?: UserPayload) {
    const { stage } = body;
    if (!stage) throw new ValidationError("stage is required");
    const VALID_STAGES = ["applied", "longlisted", "screening", "shortlisted", "assessment", "interview", "verbally_accepted", "rejected"];
    if (!VALID_STAGES.includes(stage)) throw new ValidationError(`Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}`);
    if (stage === "hired") throw new ValidationError("Cannot move to Hired via stage change. Use the Hire action after the offer is approved.");
    if (stage === "tentative") throw new ValidationError("Cannot move to Tentative via stage change — that step is no longer used. Use verbal acceptance, then create an offer.");
    return this.applyApplicationStageTransition(id, stage, body, userId, user);
  }

  /** Re-align applications.stage with active offer records after an accidental backwards move. */
  async restoreWorkflowStage(id: string, userId: string, user?: UserPayload) {
    const existing = await this.r.getApplicationById(id);
    if (!existing) throw new NotFoundError("Application not found");
    if (user && existing.job_id) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, existing.job_id);
    }
    if (existing.stage === "hired") throw new ValidationError("Cannot restore — candidate is already hired.");

    const [tentative, offerRows] = await Promise.all([this.r.getTentativeForApplication(id), this.r.getOffersByApplication(id)]);
    const offer = offerRows[0];
    const { floorStage, reasons } = deriveWorkflowFloorStage({
      tentativeStatus: tentative?.status,
      offerId: offer?.id,
      offerStatus: offer?.status,
    });
    if (!floorStage) {
      throw new ValidationError("Nothing to restore — there is no active offer record to align with.");
    }
    if (existing.stage === floorStage) {
      throw new ValidationError(`Stage already matches the active workflow (${floorStage}).`);
    }

    return this.applyApplicationStageTransition(
      id,
      floorStage,
      {
        notes: `Restored pipeline to match active workflow. ${reasons.join(" ")}`,
        interviewerNames: undefined,
        interviewerIds: undefined,
        scheduledAt: undefined,
        rejectReason: null,
        interviewType: undefined,
      },
      userId,
      user,
    );
  }

  /**
   * Add an interview round to an existing application without changing its stage.
   * Used when the candidate is already at interview/screening and needs another round.
   */
  async addInterviewRound(appId: string, body: any, userId: string, user?: UserPayload) {
    const existing = await this.r.getApplicationById(appId);
    if (!existing) throw new NotFoundError("Application not found");
    if (user && existing.job_id) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, existing.job_id);
    }
    const { interviewerNames, interviewerIds, scheduledAt, interviewType, notes } = body;
    let mergedIds =
      Array.isArray(interviewerIds) && interviewerIds.length
        ? (interviewerIds.filter((x: unknown) => typeof x === "string" && String(x).trim()) as string[])
        : null;
    let mergedNames = typeof interviewerNames === "string" && interviewerNames.trim() ? interviewerNames.trim() : null;
    if (mergedIds?.length) {
      mergedIds = await mergeSchedulerIntoInterviewerIds(this.r, userId, mergedIds);
      const nameMap = await this.r.batchResolveEmployeeNames(mergedIds);
      mergedNames = mergedIds.map((iid) => nameMap.get(iid) || iid).join(", ");
    }
    const roundHistoryId = await this.r.addInterviewRound(appId, existing.stage, {
      interviewerNames: mergedNames,
      interviewerIds: mergedIds,
      scheduledAt: scheduledAt ?? null,
      interviewType: interviewType ?? null,
      notes: notes ?? null,
    }, userId);
    if (roundHistoryId && mergedIds?.length) {
      await this.r.seedFeedbackSlotsForHistory(roundHistoryId, appId, mergedIds);
    }
    void this.r.auditLog("application", appId, "INTERVIEW_ROUND_ADDED", userId, { interviewType: interviewType ?? null, scheduledAt: scheduledAt ?? null });
    // Teams + invites: use POST /applications/:id/interview-schedule/send only.
    emitRefreshAll();
    return this.r.getApplicationById(appId);
  }

  async updateApplicationRating(id: string, rating: number | null, user?: UserPayload) {
    const existing = await this.r.getApplicationById(id);
    if (!existing) throw new NotFoundError("Application not found");
    if (user && existing.job_id) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, existing.job_id);
    }
    if (rating != null && (rating < 1 || rating > 5)) throw new ValidationError("Rating must be between 1 and 5");
    const ratingResult = await this.r.updateApplicationRating(id, rating);
    void this.r.auditLog("application", id, "RATING_UPDATED", user?.id ?? null, { rating });
    emitRefreshAll();
    return ratingResult;
  }

  async deleteApplication(id: string) {
    const r = await this.r.deleteApplication(id);
    if (!r) throw new NotFoundError("Application not found");
    emitRefreshAll();
  }

  async getApplicationHistory(id: string, user?: UserPayload) {
    const app = await this.r.getApplicationById(id);
    if (!app) throw new NotFoundError("Application not found");
    if (user && app.job_id) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, app.job_id);
    }
    return this.r.getApplicationStageHistory(id);
  }

  async getApplicationAuditLog(id: string, user?: UserPayload) {
    const app = await this.r.getApplicationById(id);
    if (!app) throw new NotFoundError("Application not found");
    if (user && app.job_id) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, app.job_id);
    }
    return this.r.getApplicationAuditLog(id);
  }

  /** Defaults for the schedule dialog (from email_notification_settings / catalog). */
  async getInterviewSchedulePreview(id: string, query: Record<string, string | undefined>, user?: UserPayload) {
    const existing = await this.r.getApplicationById(id);
    if (!existing) throw new NotFoundError("Application not found");
    if (user && existing.job_id) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, existing.job_id);
    }
    const pipelineStage = query.pipelineStage === "screening" ? "screening" : query.pipelineStage === "interview" ? "interview" : "";
    if (pipelineStage !== "screening" && pipelineStage !== "interview") {
      throw new ValidationError("pipelineStage must be screening or interview");
    }
    const parsedSchedule = tryParseInterviewScheduleInstant({
      scheduledWallDate: query.scheduledWallDate,
      scheduledWallTime: query.scheduledWallTime,
      scheduledWallTimeEnd: query.scheduledWallTimeEnd,
      ianaTimezone: query.ianaTimezone,
      scheduledAt: query.scheduledAt,
    });
    if (!parsedSchedule) {
      const maxRound = await this.r.getMaxInterviewRoundForStage(id, pipelineStage);
      return {
        maxRoundThisStage: maxRound,
        candidate: null,
        panel: null,
      };
    }
    const { start, end, iana: scheduleIana } = parsedSchedule;
    const previewRangeErr = assertInterviewScheduleEndAfterStart(parsedSchedule);
    if (previewRangeErr) throw new ValidationError(previewRangeErr);
    const round = Math.min(3, Math.max(1, parseInt(String(query.round || "1"), 10) || 1));
    const format = query.format === "teams" ? "teams" : "onsite";
    let interviewerIds = (query.interviewerIds || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (interviewerIds.length === 0) throw new ValidationError("interviewerIds is required");
    if (user?.id) {
      interviewerIds = await mergeSchedulerIntoInterviewerIds(this.r, user.id, interviewerIds);
    }
    const notes = (query.notes || "").trim();
    const location = trimOnsiteInterviewLocation(String(query.location || ""));
    const nameMap = await this.r.batchResolveEmployeeNames(interviewerIds);
    const interviewerNames = interviewerIds.map((iid) => nameMap.get(iid) || iid).join(", ");
    const detail = await this.r.getApplicationStageDetail(id);
    if (!detail) throw new NotFoundError("Application not found");
    const candidateName = `${detail.first_name} ${detail.last_name}`.trim();
    const pipeline_stage = pipelineStage === "screening" ? "Screening" : "Interview";
    const teamsJoinPreview =
      format === "teams"
        ? `<p style="margin:16px 0 0;text-align:center"><span style="display:inline-block;padding:12px 28px;background:#94a3b8;color:#ffffff;border-radius:6px;font-weight:600;font-size:14px;line-height:1.25;box-shadow:0 1px 2px rgba(0,0,0,.1);font-family:'Segoe UI',Arial,sans-serif">Join Microsoft Teams</span></p><p style="text-align:center;margin:10px 0 0;font-size:12px;color:#64748b"><em>The join link is inserted when you click Send.</em></p>`
        : "";
    const appUrl = (resolvePublicAppUrlForTemplates() ?? "").replace(/\/$/, "");
    const baseCtx: NotifyContext = {
      candidate_name: candidateName,
      job_title: detail.job_title || "Position",
      pipeline_stage,
      round: String(round),
      ...buildInterviewScheduleTimeFields(start, end, scheduleIana),
      interview_format: format === "teams" ? "Microsoft Teams" : "Onsite",
      teams_join_link: teamsJoinPreview,
      interview_location: format === "onsite" && location ? formatOnsiteLocationForEmailHtml(location) : "",
      interview_notes: notes || "",
      interviewers_list: interviewerNames,
      application_id: id,
      job_id: String(existing.job_id ?? ""),
      app_url: appUrl,
    };
    const [candTpl, panelTpl] = await Promise.all([
      getRenderedNotificationTemplate("recruit.interview_invite_candidate", baseCtx),
      getRenderedNotificationTemplate("recruit.interview_invite_panel", { ...baseCtx, recipient_name: "Team" }),
    ]);
    const maxRound = await this.r.getMaxInterviewRoundForStage(id, pipelineStage);
    return {
      candidate: candTpl ?? { subject: "", body: "", enabled: true },
      panel: panelTpl ?? { subject: "", body: "", enabled: true },
      maxRoundThisStage: maxRound,
    };
  }

  /**
   * Persist schedule, optionally create Teams (online only), send candidate + panel emails.
   * Teams meeting is created only when format is teams, immediately before send.
   */
  async sendInterviewSchedule(id: string, body: any, userId: string, user?: UserPayload) {
    const pipelineStage = body.pipelineStage === "screening" ? "screening" : body.pipelineStage === "interview" ? "interview" : null;
    if (!pipelineStage) throw new ValidationError("pipelineStage must be screening or interview");
    const round = Math.min(3, Math.max(1, parseInt(String(body.round ?? "1"), 10) || 1));
    const format = body.format === "teams" ? "teams" : "onsite";
    const parsedSchedule = tryParseInterviewScheduleInstant({
      scheduledWallDate: body.scheduledWallDate != null ? String(body.scheduledWallDate) : undefined,
      scheduledWallTime: body.scheduledWallTime != null ? String(body.scheduledWallTime) : undefined,
      scheduledWallTimeEnd: body.scheduledWallTimeEnd != null ? String(body.scheduledWallTimeEnd) : undefined,
      ianaTimezone: body.ianaTimezone != null ? String(body.ianaTimezone) : undefined,
      scheduledAt: body.scheduledAt != null ? String(body.scheduledAt) : undefined,
    });
    if (!parsedSchedule) {
      throw new ValidationError("Provide date, start time, end time, and timezone, or a valid ISO scheduledAt.");
    }
    const rangeErr = assertInterviewScheduleEndAfterStart(parsedSchedule);
    if (rangeErr) throw new ValidationError(rangeErr);
    const { start, end, iana: scheduleIana } = parsedSchedule;
    const scheduledAtIso = start.toISOString();
    const scheduledAtEndIso = end.toISOString();
    let interviewerIds = Array.isArray(body.interviewerIds) ? body.interviewerIds.filter((x: unknown) => typeof x === "string" && String(x).trim()) as string[] : [];
    if (interviewerIds.length === 0) throw new ValidationError("interviewerIds is required");
    const seenIds = new Set<string>();
    interviewerIds = interviewerIds.filter((id) => {
      const k = id.trim();
      if (!k || seenIds.has(k)) return false;
      seenIds.add(k);
      return true;
    });
    interviewerIds = await mergeSchedulerIntoInterviewerIds(this.r, userId, interviewerIds);
    const candidateSubject = String(body.candidateSubject ?? "").trim();
    let candidateBodyHtml = String(body.candidateBodyHtml ?? "").trim();
    const panelSubject = String(body.panelSubject ?? "").trim();
    let panelBodyHtml = String(body.panelBodyHtml ?? "").trim();
    if (!candidateSubject || !candidateBodyHtml) throw new ValidationError("candidate email subject and body are required");
    if (!panelSubject || !panelBodyHtml) throw new ValidationError("panel email subject and body are required");
    const notes = body.notes != null ? String(body.notes).trim() : "";
    const location = body.location != null ? trimOnsiteInterviewLocation(String(body.location)) : "";

    const existing = await this.r.getApplicationById(id);
    if (!existing) throw new NotFoundError("Application not found");
    if (user && existing.job_id) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, existing.job_id);
    }
    if (existing.stage === "hired" || existing.stage === "rejected") {
      throw new ValidationError("Cannot schedule interviews for this application");
    }

    const detail = await this.r.getApplicationStageDetail(id);
    if (!detail?.candidate_email) throw new ValidationError("Candidate has no email address");

    const fromStage = existing.stage;
    const nameMap = await this.r.batchResolveEmployeeNames(interviewerIds);
    const interviewerNamesStr = interviewerIds.map((iid) => nameMap.get(iid) || iid).join(", ");
    const panelInviteEmails = await this.r.getInterviewerEmails(interviewerIds);
    if (panelInviteEmails.length === 0) throw new ValidationError("Interviewers must have work emails on file");
    const teamsAttendeeEmails = await ensureSchedulerEmailOnMeeting(this.r, userId, panelInviteEmails);

    const candidateName = `${detail.first_name} ${detail.last_name}`.trim();
    const jobTitle = detail.job_title || "Position";
    const pipelineLabel = pipelineStage === "screening" ? "Screening" : "Interview";
    const typeLabel = `${pipelineLabel} — Round ${round}`;

    let joinUrl: string | null = null;
    let eventId: string | null = null;

    const calendarSubject = buildInterviewCalendarSubject({
      candidateName,
      jobTitle,
      format,
    });
    const calendarBase = buildInterviewCalendarDetails({
      format,
      pipelineStage,
      round,
      candidateName,
      jobTitle,
      jobDepartment: existing.job_department,
      candidateEmail: detail.candidate_email,
      candidatePhone: existing.candidate_phone,
      applicationId: id,
      jobId: String(existing.job_id ?? ""),
      candidateId: String(existing.candidate_id ?? ""),
      interviewerNamesStr,
      location: format === "onsite" ? location : null,
      notes,
    });

    const schedulerEmailLower = await resolveSchedulerEmailLower(this.r, userId);
    const calendarResult = await createInterviewOutlookEvent({
      format,
      start,
      end,
      iana: scheduleIana,
      userId,
      attendeeEmails: teamsAttendeeEmails,
      candidateEmail: detail.candidate_email,
      calendarHtml: buildInterviewCalendarEventHtml(calendarBase),
      subject: calendarSubject,
      locationPlain: format === "onsite" ? location : null,
      schedulerEmailLower,
    });

    if (!calendarResult.eventId) {
      const err =
        calendarResult.error ||
        (format === "teams" ? "Teams meeting could not be created" : "Calendar invite could not be created");
      throw new ValidationError(err);
    }
    joinUrl = calendarResult.joinUrl;
    eventId = calendarResult.eventId;

    const teamsBlock =
      format === "teams" && joinUrl
        ? `<p style="margin:16px 0 0;text-align:center">${emailCtaButtonHtml(joinUrl, "Join Microsoft Teams", { backgroundColor: "#5059c9" })}</p>`
        : "";
    if (format === "onsite" && location) {
      candidateBodyHtml = replaceInterviewLocationInEmailHtml(candidateBodyHtml, location);
      panelBodyHtml = replaceInterviewLocationInEmailHtml(panelBodyHtml, location);
    }
    candidateBodyHtml = replaceInterviewersListInInviteHtml(candidateBodyHtml, interviewerNamesStr);
    panelBodyHtml = replaceInterviewersListInInviteHtml(panelBodyHtml, interviewerNamesStr);

    candidateBodyHtml = injectTeamsLinkPlaceholders(candidateBodyHtml, teamsBlock);
    panelBodyHtml = injectTeamsLinkPlaceholders(panelBodyHtml, teamsBlock);

    const appUrlForEmail = (resolvePublicAppUrlForTemplates() ?? "").replace(/\/$/, "");
    candidateBodyHtml = injectInterviewScheduleEmailPlaceholders(candidateBodyHtml, appUrlForEmail, id, String(existing.job_id ?? ""));
    panelBodyHtml = injectInterviewScheduleEmailPlaceholders(panelBodyHtml, appUrlForEmail, id, String(existing.job_id ?? ""));

    if (fromStage !== pipelineStage) {
      await this.r.setApplicationStage(id, pipelineStage);
    }
    if (fromStage === "tentative") {
      await this.r.cancelTentativeIfPending(id);
    }

    const storedNotes = format === "onsite" && location
      ? [location, notes].filter(Boolean).join("\n\n")
      : notes || null;

    const historyId = await this.r.insertInterviewScheduleHistory(
      id,
      fromStage,
      pipelineStage,
      {
        notes: storedNotes,
        interviewerNames: interviewerNamesStr || null,
        interviewerIds,
        scheduledAt: scheduledAtIso,
        scheduledAtEnd: scheduledAtEndIso,
        interviewTypeLabel: typeLabel,
        interviewerRound: round,
        scheduleFormat: format,
        meetingLink: joinUrl,
        teamsEventId: eventId,
      },
      userId,
    );

    const fromAddr =
      resolveNotificationFromAddress("recruit.interview_invite_candidate") ||
      (process.env.EMAIL_FROM ?? "").trim() ||
      "Recruitment <careers@hr.ldplogistics.com>";

    const inboundDomain = (process.env.EMAIL_INBOUND_REPLY_DOMAIN ?? "").trim();
    const useCleanReplyTo = process.env.EMAIL_REPLY_TO_CLEAN === "true";
    const replyToAddress = useCleanReplyTo ? fromAddr : inboundDomain ? `reply+${id}@${inboundDomain}` : fromAddr;

    const recruiterEmail = await this.r.getUserEmail(userId);
    const panelEmailSeen = new Set<string>();
    const uniquePanelEmails = panelInviteEmails.filter((e) => {
      const k = e.toLowerCase();
      if (panelEmailSeen.has(k)) return false;
      panelEmailSeen.add(k);
      return true;
    });
    const panelTo = uniquePanelEmails[0];
    const panelCc = [
      ...uniquePanelEmails.slice(1),
      ...(recruiterEmail && !uniquePanelEmails.some((e) => e.toLowerCase() === recruiterEmail.toLowerCase()) ? [recruiterEmail] : []),
    ].filter(Boolean);

    if (!isEmailConfigured()) {
      throw new ValidationError("Email is not configured (SENDGRID_API_KEY / EMAIL_FROM)");
    }

    const candHtml = await wrapInEmailFrame(candidateBodyHtml, candidateSubject, "recruit.interview_invite_candidate");
    const panelHtml = await wrapInEmailFrame(panelBodyHtml, panelSubject, "recruit.interview_invite_panel");
    const candPlain = htmlToPlainText(candidateBodyHtml) || candidateSubject;
    const panelPlain = htmlToPlainText(panelBodyHtml) || panelSubject;

    const candInserted = await this.r.insertApplicationEmail({
      applicationId: id,
      fromEmail: fromAddr,
      toEmail: detail.candidate_email,
      cc: null,
      bcc: null,
      subject: candidateSubject,
      body: candidateBodyHtml,
    });
    const candMsgId = inboundDomain ? `<recruitment-${candInserted.id}@${inboundDomain}>` : undefined;
    const candSend = await sendEmail({
      from: fromAddr,
      to: detail.candidate_email,
      subject: candidateSubject,
      html: candHtml,
      text: candPlain,
      replyTo: replyToAddress,
      headers: candMsgId ? { "Message-ID": candMsgId } : undefined,
    });
    if (!candSend.ok) throw new ValidationError(`Candidate email failed: ${(candSend as { message?: string }).message || "unknown"}`);
    if (inboundDomain && candMsgId) await this.r.updateEmailMessageId(candInserted.id, candMsgId);

    const panelInserted = await this.r.insertApplicationEmail({
      applicationId: id,
      fromEmail: fromAddr,
      toEmail: panelTo,
      cc: panelCc.length ? panelCc.join(", ") : null,
      bcc: null,
      subject: panelSubject,
      body: panelBodyHtml,
    });
    const panelMsgId = inboundDomain ? `<recruitment-${panelInserted.id}@${inboundDomain}>` : undefined;
    const panelSend = await sendEmail({
      from: fromAddr,
      to: panelTo,
      cc: panelCc.length ? panelCc : undefined,
      subject: panelSubject,
      html: panelHtml,
      text: panelPlain,
      replyTo: replyToAddress,
      headers: panelMsgId ? { "Message-ID": panelMsgId } : undefined,
    });
    if (!panelSend.ok) throw new ValidationError(`Panel email failed: ${(panelSend as { message?: string }).message || "unknown"}`);
    if (inboundDomain && panelMsgId) await this.r.updateEmailMessageId(panelInserted.id, panelMsgId);

    await this.r.auditLog("application", id, "INTERVIEW_SCHEDULED", userId, {
      stageHistoryId: historyId,
      pipelineStage,
      round,
      format,
    });

    if (historyId && interviewerIds.length) {
      await this.r.seedFeedbackSlotsForHistory(historyId, id, interviewerIds);
    }

    (async () => {
      try {
        if (fromStage === pipelineStage) return;
        const d = await this.r.getApplicationStageDetail(id);
        if (!d) return;
        const cName = `${d.first_name || ""} ${d.last_name || ""}`.trim() || "Candidate";
        const ctx = {
          candidate_name: cName,
          candidate_email: d.candidate_email || "—",
          job_title: d.job_title || "—",
          old_stage: fromStage,
          new_stage: pipelineStage,
          doer_name: userId,
          application_id: id,
          job_id: String(existing.job_id ?? ""),
        };
        const team = await recruitmentTeamRecipients(String(existing.job_id ?? ""));
        if (team.length) await notifyEmail("recruit.stage_changed", ctx, team);
      } catch {
        /* non-fatal */
      }
    })();

    emitRefreshAll();
    return this.r.getApplicationById(id);
  }

  // ── Application Emails ────────────────────────────────────────────────────────
  async listApplicationEmails(applicationId: string, user?: UserPayload) {
    const appCheck = await this.r.getApplicationById(applicationId);
    if (!appCheck) throw new NotFoundError("Application not found");
    if (user && appCheck.job_id) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, appCheck.job_id);
    }
    return this.r.listApplicationEmails(applicationId);
  }

  async sendApplicationEmail(applicationId: string, body: any, fromEmail: string, user?: UserPayload) {
    const appRows = await this.r.getApplicationById(applicationId);
    if (!appRows) throw new NotFoundError("Application not found");
    if (user && appRows.job_id) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, appRows.job_id);
    }
    const toEmail = (body.to && String(body.to).trim()) || appRows.candidate_email;
    if (!toEmail) throw new ValidationError("No recipient email");
    const subjectStr = body.subject != null ? String(body.subject).trim() : "";
    const bodyStr = body.body != null ? String(body.body).trim() : "";
    const MAX_ATTACHMENTS = 5, MAX_BYTES = 8 * 1024 * 1024;
    let attachments: Array<{ filename: string; content: Buffer }> | undefined;
    if (Array.isArray(body.attachments) && body.attachments.length > 0) {
      if (body.attachments.length > MAX_ATTACHMENTS) throw new ValidationError(`Maximum ${MAX_ATTACHMENTS} attachments allowed`);
      let totalBytes = 0; attachments = [];
      for (const a of body.attachments) {
        const buf = Buffer.from(typeof a?.content === "string" ? a.content : "", "base64");
        totalBytes += buf.length;
        if (totalBytes > MAX_BYTES) throw new ValidationError("Attachments exceed 8MB total");
        attachments.push({ filename: (a?.filename && String(a.filename).trim()) || "attachment", content: buf });
      }
    }
    const inserted = await this.r.insertApplicationEmail({ applicationId, fromEmail, toEmail, cc: body.cc||null, bcc: body.bcc||null, subject: subjectStr, body: bodyStr });
    let delivered = false;
    if (isEmailConfigured()) {
      const fromAddress = (process.env.EMAIL_FROM ?? "").trim() || "Recruitment <careers@hr.ldplogistics.com>";
      const inboundDomain = (process.env.EMAIL_INBOUND_REPLY_DOMAIN ?? "").trim();
      const useCleanReplyTo = process.env.EMAIL_REPLY_TO_CLEAN === "true";
      const replyToAddress = useCleanReplyTo ? fromAddress : (inboundDomain ? `reply+${applicationId}@${inboundDomain}` : fromAddress);
      const ourMessageId = inboundDomain ? `<recruitment-${inserted.id}@${inboundDomain}>` : undefined;
      let result: { ok: true; id: string } | { ok: false; message: string };
      try {
        const inner = plainTextRecruitmentEmailToHtml(bodyStr);
        const framedHtml = await wrapInEmailFrame(inner, subjectStr || "Message");
        const fromRecruitment = resolveNotificationFromAddress("recruit.stage_changed");
        result = await sendEmail({
          to: toEmail,
          subject: subjectStr,
          text: bodyStr,
          html: framedHtml,
          cc: body.cc ?? undefined,
          bcc: body.bcc ?? undefined,
          replyTo: replyToAddress,
          headers: ourMessageId ? { "Message-ID": ourMessageId } : undefined,
          attachments,
          ...(fromRecruitment ? { from: fromRecruitment } : {}),
        });
      } catch (e: any) { result = { ok: false, message: e?.message ?? String(e) }; }
      if (!result.ok) throw Object.assign(new Error((result as any).message), { statusCode: 502, userMessage: "Email saved but delivery failed" });
      delivered = true;
      if (inboundDomain && ourMessageId) await this.r.updateEmailMessageId(inserted.id, ourMessageId);
    }
    void this.r.auditLog("application", applicationId, "EMAIL_SENT", user?.id ?? null, { subject: subjectStr, toEmail });
    emitRefreshAll();
    return { ...inserted, delivered };
  }

  async handleInboundEmail(body: any) {
    const data = (body.data as Record<string, unknown>) || body;
    let applicationId = (body.applicationId ?? data.applicationId) as string | undefined;
    const toRaw = data.to ?? body.to;
    const envelopeRaw = (data.envelope ?? body.envelope) as string | undefined;
    let envelopeTo: string[] = [];
    try {
      if (typeof envelopeRaw === "string" && envelopeRaw.trim()) {
        const parsed = JSON.parse(envelopeRaw) as { to?: string[] };
        if (Array.isArray(parsed?.to)) envelopeTo = parsed.to.map((v) => String(v)).filter(Boolean);
      }
    } catch {}
    const toAddresses = Array.isArray(toRaw)
      ? (toRaw as string[])
      : toRaw != null
        ? [String(toRaw)]
        : envelopeTo;
    if (!applicationId && toAddresses.length > 0) {
      for (const addr of toAddresses) {
        const match = String(addr).match(/reply\+([a-f0-9-]{36})@/i) || String(addr).match(/^([a-f0-9-]{36})@/);
        if (match) { applicationId = match[1]; break; }
      }
    }
    const headersRaw = ((data.headers ?? body.headers) ?? "").toString();
    const fromEmail = ((data.from ?? body.from ?? body.from_email) ?? "").toString().trim();
    const toEmail = toAddresses.length > 0 ? toAddresses.map((a:any)=>String(a)).join(", ") : ((data.to ?? body.to ?? body.to_email) ?? "").toString();
    const subject = ((data.subject ?? body.subject) ?? "").toString().trim();
    const picked = pickInboundTextHtml(body as Record<string, unknown>);
    let textPlain = picked.textPlain;
    let textHtml = picked.textHtml;
    // SendGrid: "POST raw MIME" puts the full message in `email`. Parsed `text`/`html` may also be empty.
    if (!textPlain.trim() && !textHtml.trim()) {
      const rawMime = String(
        (body as Record<string, unknown>).email ??
          data.email ??
          (body as Record<string, unknown>).raw ??
          ""
      ).trim();
      if (rawMime.length > 20) {
        try {
          const parsed = await simpleParser(rawMime);
          if (parsed.text?.trim()) textPlain = parsed.text;
          textHtml = typeof parsed.html === "string" && parsed.html.trim() ? parsed.html : "";
          if (!textPlain.trim() && textHtml.trim()) {
            const plain = htmlToPlainText(textHtml);
            if (plain) textPlain = plain;
          }
        } catch {
          /* ignore */
        }
      }
    }
    const messageId = (data.message_id ?? body.message_id) as string | undefined;
    if (!fromEmail) throw Object.assign(new ValidationError("Missing from (sender) in webhook payload."), { statusCode: 400 });
    const fromAddrForMatch = extractEmailAddressFromHeader(fromEmail);
    // Try In-Reply-To matching via headers provided directly in webhook payload
    if (!applicationId && messageId) {
      const appId = await this.r.matchEmailByMessageId(messageId);
      if (appId) applicationId = appId;
    }
    if (!applicationId) {
      const headerMessageIds = extractMessageIdsFromHeaders(headersRaw);
      for (const idVal of headerMessageIds) {
        const appId = await this.r.matchEmailByMessageId(idVal);
        if (appId) { applicationId = appId; break; }
      }
    }
    // Fallback: match by sender + subject
    if (!applicationId && fromAddrForMatch && subject) {
      const normalizedSubject = subject.replace(/^\s*(Re:\s*|Fwd:\s*)+/gi,"").trim().toLowerCase();
      if (normalizedSubject) {
        const appId = await this.r.matchEmailBySenderSubject(fromAddrForMatch, normalizedSubject);
        if (appId) {
          applicationId = appId;
          console.log("[inbound-email] matched by sender+subject fallback:", applicationId);
        }
      }
    }
    if (!applicationId) {
      console.warn("[inbound-email] could not match application", {
        toSnippet: String(toEmail).slice(0, 120),
        from: fromAddrForMatch || fromEmail,
        subjectSnippet: subject.slice(0, 80),
      });
      throw Object.assign(new Error("Could not determine application"), { statusCode: 400, hint: "Reply to an email that was sent from the app (Recruitment → Emails). With EMAIL_REPLY_TO_CLEAN=true, matching uses sender+subject. Otherwise use reply+<id>@ in Reply-To (EMAIL_REPLY_TO_CLEAN=false)." });
    }
    const appCheck = await this.r.getApplicationById(applicationId);
    if (!appCheck) throw new NotFoundError("Application not found");
    await this.r.insertInboundEmail({ applicationId, fromEmail, toEmail, subject, textPlain, textHtml, messageId });
    console.log("[inbound-email] stored received message", { applicationId, from: fromAddrForMatch || fromEmail, subjectPreview: subject.slice(0, 60) });
    emitRefreshAll();
  }

  async deleteApplicationEmail(applicationId: string, emailId: string, user?: UserPayload) {
    const appRows = await this.r.getApplicationById(applicationId);
    if (!appRows) throw new NotFoundError("Application not found");
    if (user && appRows.job_id) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, appRows.job_id);
    }
    const r = await this.r.deleteApplicationEmail(emailId, applicationId);
    if (!r) throw new NotFoundError("Email not found");
  }

  // ── Offers ────────────────────────────────────────────────────────────────────
  async listOffers(user?: UserPayload) {
    const policy = await this.getPolicy(user);
    const scopedJobIds = policy ? assignedJobFilter(policy) : null;
    return this.r.listOffers(scopedJobIds ?? undefined);
  }
  async getOfferById(id: string, user?: UserPayload) {
    const offer = await this.r.getOfferById(id);
    if (!offer) return null;
    if (user && offer.application_id) {
      const app = await this.r.getApplicationById(offer.application_id);
      if (app?.job_id) {
        const policy = await resolvePolicy(user);
        assertJobAccess(policy, app.job_id);
      }
    }
    return offer;
  }

  async createOffer(body: any, userId: string, user?: UserPayload, appBaseUrl?: string) {
    const willMergeTemplate = Boolean(body?.willMergeTemplate);
    const { willMergeTemplate: _w, ...bodyForOffer } = body ?? {};
    const validated = insertOfferSchema.parse(bodyForOffer);
    const appCheck = await this.r.getApplicationById(validated.applicationId);
    if (!appCheck) throw new NotFoundError("Application not found");
    const allowedStages = new Set(["verbally_accepted", "offer", "hired", "tentative"]);
    if (!allowedStages.has(appCheck.stage)) {
      throw new ValidationError(
        "Create an offer only after verbal acceptance. Mark verbal acceptance on the pipeline, then create the offer."
      );
    }
    if (appCheck.stage !== "offer" && appCheck.stage !== "hired") await this.r.moveApplicationToOffer(validated.applicationId, appCheck.stage, userId);
    const status = validated.status || "draft";
    const sentAt = status === "sent" ? new Date() : null;
    const responseToken = status === "sent" ? crypto.randomBytes(32).toString("hex") : null;

    // Determine approval status based on creator's role.
    // limited_recruiter (without recruiter/hr/admin) → pending approval; all others → auto-approved.
    const roleSet = this.toRoleSet(user);
    const isLimitedOnly = roleSet.has("limited_recruiter") && !roleSet.has("recruiter") && !roleSet.has("hr") && !roleSet.has("admin");
    const approvalStatus = isLimitedOnly ? "not_requested" : "approved";

    const offer = await this.r.createOffer({
      ...validated,
      status,
      sentAt,
      responseToken,
      approvalStatus,
      createdBy: userId,
    });
    void this.r.auditLog("offer", offer.id, "OFFER_CREATED", userId, { applicationId: validated.applicationId, status, approvalStatus });

    const shouldEmailCandidate =
      status === "sent" &&
      approvalStatus === "approved" &&
      responseToken &&
      !willMergeTemplate;
    if (shouldEmailCandidate) {
      (async () => {
        try {
          await this._sendOfferEmail(offer.id, responseToken!, appBaseUrl);
        } catch (e) {
          console.warn("[offer-email] createOffer:", (e as Error)?.message);
        }
      })();
    }

    emitRefreshAll();
    return offer;
  }

  async updateOffer(id: string, body: any, userId: string, appBaseUrl?: string, user?: UserPayload) {
    const existing = await this.r.getOfferById(id);
    if (!existing) throw new NotFoundError("Offer not found");
    if (user && existing.application_id) {
      const app = await this.r.getApplicationById(existing.application_id);
      if (app?.job_id) {
        const policy = await resolvePolicy(user);
        assertJobAccess(policy, app.job_id);
      }
    }
    if (body.status === "sent" && existing.status === "withdrawn") throw new ValidationError("Cannot send a withdrawn offer. Create a new offer instead.");
    if (body.status === "sent" && (existing.approval_status === "pending" || existing.approval_status === "not_requested")) {
      throw new ValidationError(
        existing.approval_status === "not_requested"
          ? "Ask HR/recruiter for approval before sending this offer to the candidate."
          : "This offer is pending approval. It must be approved before it can be sent to the candidate.",
      );
    }
    let sentAt = existing.sent_at;
    let respondedAt = existing.responded_at;
    let responseToken = existing.response_token;
    const isFirstSend = body.status === "sent" && !sentAt;
    if (isFirstSend) { sentAt = new Date(); if (!responseToken) responseToken = crypto.randomBytes(32).toString("hex"); }
    if ((body.status === "accepted" || body.status === "rejected") && !respondedAt) respondedAt = new Date();
    const result = await this.r.updateOffer(id, { ...body, sentAt, respondedAt, responseToken });
    const offerUpdateAction = body.status === "sent" ? "OFFER_SENT" : body.status === "accepted" ? "OFFER_ACCEPTED_CANDIDATE" : body.status === "rejected" ? "OFFER_DECLINED_CANDIDATE" : body.status === "withdrawn" ? "OFFER_WITHDRAWN" : "OFFER_UPDATED";
    void this.r.auditLog("offer", id, offerUpdateAction, userId, { applicationId: existing.application_id, status: body.status });
    if (body.status === "rejected") {
      const appRows = await this.r.getApplicationById(existing.application_id);
      const fromStage = appRows?.stage || "offer";
      await this.r.rejectApplicationOnOfferReject(existing.application_id, fromStage, userId);
    }
    // Email: offer accepted / declined notifications
    if ((body.status === "accepted" || body.status === "rejected") && existing.status !== body.status) {
      (async()=>{try{const details=await this.r.getOfferFullDetails(existing.id);if(!details)return;const candidateName=`${details.first_name||""} ${details.last_name||""}`.trim()||"Candidate";const team=await recruitmentTeamRecipients(String(details.job_id??""));const ctx={candidate_name:candidateName,job_title:details.job_title||"—",application_id:String(details.application_id??""),job_id:String(details.job_id??"")};if(team.length)await notifyEmail(body.status==="accepted"?"recruit.offer_accepted":"recruit.offer_declined",ctx,team);}catch{}})();
    }
    if (isFirstSend) {
      (async()=>{try{const details=await this.r.getOfferFullDetails(existing.id);if(!details)return;const team=await recruitmentTeamRecipients(String(details.job_id??""));const candidateName=`${details.first_name||""} ${details.last_name||""}`.trim()||"Candidate";if(team.length)await notifyEmail("recruit.offer_sent",{candidate_name:candidateName,job_title:details.job_title||"—",doer_name:userId,application_id:String(details.application_id??""),job_id:String(details.job_id??"")},team);}catch{}})();
      if (responseToken) {
        (async () => {
          try {
            await this._sendOfferEmail(id, responseToken, appBaseUrl);
          } catch (e) {
            console.warn("[offer-email] updateOffer:", (e as Error)?.message);
          }
        })();
      }
    }
    emitRefreshAll();
    return result;
  }

  /** Builds and dispatches the offer email to the candidate. Fire-and-forget – never throws. */
  private async _sendOfferEmail(offerId: string, token: string, appBaseUrl?: string): Promise<void> {
    const details = await this.r.getOfferFullDetails(offerId);
    console.log(`[offer-email] Fetched offer details: candidateEmail=${details?.candidate_email} offerId=${offerId}`);
    if (!details?.candidate_email) {
      console.warn("[offer-email] Skipped — no candidate email found for offer", offerId);
      return;
    }

    const baseUrl = normalizePublicAppUrl(appBaseUrl ?? process.env.APP_URL ?? "");
    const hasTemplate = !!details.template_id || !!details.merged_document_url;
    const offerPath = hasTemplate ? `/offer-sign/${token}` : `/offer-response/${token}`;
    const offerLink = baseUrl ? `${baseUrl}${offerPath}` : null;

    const esc = escapeHtmlForEmail;
    const companyName = (process.env.COMPANY_NAME ?? "LDP Logistics").trim();
    const candidateName = `${details.first_name ?? ""} ${details.last_name ?? ""}`.trim() || "Candidate";
    const jobTitle = details.job_title || details.job_posting_title || "the position";
    const salary = details.salary ? `${Number(details.salary).toLocaleString()} ${details.salary_currency ?? ""}`.trim() : null;
    const startDate = details.start_date ? new Date(details.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;

    const jobTitleEsc = esc(jobTitle);
    const deptHtml = details.department ? ` in the <strong>${esc(details.department)}</strong> department` : "";
    const locHtml = details.job_location ? ` based in <strong>${esc(details.job_location)}</strong>` : "";

    const summaryRows: string[] = [];
    if (salary) {
      summaryRows.push(
        `<tr><td style="padding:6px 14px 6px 0;font-size:13px;color:#64748b;vertical-align:top">Offered salary</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#1e293b">${esc(salary)}</td></tr>`,
      );
    }
    if (startDate) {
      summaryRows.push(
        `<tr><td style="padding:6px 14px 6px 0;font-size:13px;color:#64748b">Proposed start date</td><td style="padding:6px 0;font-size:14px;color:#1e293b">${esc(startDate)}</td></tr>`,
      );
    }
    if (details.employment_type) {
      summaryRows.push(
        `<tr><td style="padding:6px 14px 6px 0;font-size:13px;color:#64748b">Employment type</td><td style="padding:6px 0;font-size:14px;color:#1e293b">${esc(details.employment_type.replace(/_/g, " "))}</td></tr>`,
      );
    }

    const termsHtml = details.terms
      ? `<div style="margin:18px 0 0;padding:14px 16px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0"><p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.06em;text-transform:uppercase">Additional terms</p><p style="margin:0;font-size:14px;color:#475569;line-height:1.55">${esc(details.terms).replace(/\n/g, "<br/>")}</p></div>`
      : "";

    const ctaBlock = offerLink
      ? `<p style="margin:28px 0 16px;text-align:center">${emailCtaButtonHtml(offerLink, "Review & respond to your offer", { backgroundColor: "#15803d" })}</p><p style="margin:0 0 20px;font-size:12px;line-height:1.5;color:#64748b;text-align:center">If the button doesn&rsquo;t work, paste this link into your browser:<br/><span style="word-break:break-all;color:#475569">${esc(offerLink)}</span></p>`
      : "";

    const summaryInner =
      summaryRows.length > 0
        ? summaryRows.join("")
        : `<tr><td colspan="2" style="padding:4px 0;font-size:13px;color:#64748b;font-style:italic">Details are in your offer letter below or attached.</td></tr>`;

    let innerBody = `
<p style="margin:0 0 16px;font-size:15px">Dear ${esc(candidateName)},</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#334155">We are pleased to extend you a formal offer of employment for the role of <strong style="color:#0f172a">${jobTitleEsc}</strong>${deptHtml}${locHtml}.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse"><tr><td style="padding:18px 20px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px"><p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#15803d;letter-spacing:0.07em;text-transform:uppercase">Offer at a glance</p><table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">${summaryInner}</table></td></tr></table>
${termsHtml}
${ctaBlock}
<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#475569">Please do not hesitate to reach out if you have any questions.</p>
<p style="margin:22px 0 0;font-size:14px;color:#64748b">Best regards,<br/><strong style="color:#334155">HR Team</strong><br/><span style="font-size:13px">${esc(companyName)}</span></p>
`.trim();

    // Attach the offer letter PDF when one is uploaded (data URL, http URL, or SharePoint link)
    const attachments: Array<{ filename: string; content: Buffer }> = [];
    if (details.offer_letter_url) {
      try {
        let buf: Buffer | null = await fetchOfferLetterBuffer(details.offer_letter_url);
        if (!buf && /sharepoint\.com|onedrive\.live\.com/i.test(details.offer_letter_url)) {
          const sharePointResult = await getAvatarContentBySharingUrl(details.offer_letter_url);
          if (sharePointResult) buf = sharePointResult.buffer;
        }
        if (buf) {
          const baseName = (details.offer_letter_filename || "offer-letter").trim();
          const filename = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName.replace(/\.[^.]+$/, "")}.pdf`;
          attachments.push({ filename, content: buf });
          console.log(`[offer-email] Attaching offer letter PDF: ${filename} (${buf.length} bytes)`);
        } else {
          console.warn("[offer-email] Could not load offer letter. Share the link manually.");
        }
      } catch (e) {
        console.warn("[offer-email] Could not attach offer letter:", (e as Error)?.message);
      }
    } else {
      console.log("[offer-email] No offer letter uploaded — email will not include a PDF attachment.");
    }

    if (attachments.length > 0) {
      innerBody = innerBody.replace(
        `<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#475569">Please do not hesitate`,
        `<p style="margin:0 0 14px;font-size:14px;color:#475569">Please find your formal offer letter attached to this email as a PDF.</p><p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#475569">Please do not hesitate`,
      );
    }

    const subject = `Your Offer Letter – ${jobTitle}`;
    const html = await wrapInEmailFrame(innerBody, subject);

    const textPlain = [
      `Dear ${candidateName},`,
      "",
      `We are pleased to extend you a formal offer of employment for the role of ${jobTitle}${details.department ? ` in the ${details.department} department` : ""}${details.job_location ? ` based in ${details.job_location}` : ""}.`,
      ...(salary ? [`Offered salary: ${salary}`] : []),
      ...(startDate ? [`Proposed start date: ${startDate}`] : []),
      ...(details.employment_type ? [`Employment type: ${details.employment_type.replace(/_/g, " ")}`] : []),
      ...(details.terms ? [`Additional terms: ${details.terms}`] : []),
      ...(offerLink
        ? [
            "",
            hasTemplate ? `Review and sign your offer: ${offerLink}` : `Respond to your offer: ${offerLink}`,
          ]
        : []),
      ...(attachments.length > 0 ? ["", "A PDF copy of the offer letter is attached to this email."] : []),
      "",
      "Best regards,",
      `HR Team — ${companyName}`,
    ].join("\n");

    const sendResult = await sendEmail({
      from: resolveNotificationFromAddress("recruit.offer_sent"),
      to: details.candidate_email,
      subject,
      html,
      text: textPlain,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    if (!sendResult.ok) {
      console.warn("[offer-email] SendGrid error:", sendResult.message);
    } else {
      console.log(`[offer-email] Offer email sent to ${details.candidate_email} (msgId: ${sendResult.id})${attachments.length > 0 ? " with PDF attachment" : ""}`);
    }
  }

  /**
   * Build signed-offer attachment as **PDF only** (never a signed .docx as the primary artifact).
   */
  private async _buildEsignAttachments(
    mergedDocumentUrl: string | null | undefined,
    signatureData: string,
    signerName = "",
    signedDate?: string,
  ): Promise<Array<{ filename: string; content: Buffer }>> {
    const attachments: Array<{ filename: string; content: Buffer }> = [];
    const mergedUrl = mergedDocumentUrl?.trim();
    if (!mergedUrl) return attachments;
    const dateStr =
      (signedDate && signedDate.trim()) ||
      new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    try {
      const { OfferTemplateService } = await import("../offer-templates/OfferTemplateService.js");
      const tmplSvc = new OfferTemplateService();
      const signedPdf = await tmplSvc.generateSignedPdf(mergedUrl, signatureData, signerName, signedDate);
      attachments.push({ filename: "signed-offer-letter.pdf", content: signedPdf });
      console.log(`[offer-email] Generated signed PDF (${signedPdf.length} bytes)`);
    } catch (e) {
      console.error("[offer-email] generateSignedPdf failed — full error:", e);
      if (e instanceof Error && e.stack) console.error(e.stack);
      console.warn("[offer-email] Signed PDF generation failed:", (e as Error)?.message);

      const buf = await fetchMergedDocumentBuffer(mergedUrl);
      if (buf?.length) {
        try {
          const { bufferIsPdf, overlaySignatureOnPdf } = await import("../offer-templates/pdfFormService.js");
          if (bufferIsPdf(buf)) {
            const signedPdf = await overlaySignatureOnPdf(buf, signatureData, signerName, dateStr);
            attachments.push({ filename: "signed-offer-letter.pdf", content: signedPdf });
            console.log(`[offer-email] Fallback: signed PDF via pdf-lib overlay (${signedPdf.length} bytes)`);
            return attachments;
          }
          const { injectSignatureIntoDocx, convertDocxToPdf } = await import("../offer-templates/pdfHelpers.js");
          const patchedDocx = await injectSignatureIntoDocx(buf, signatureData, signerName, dateStr);
          const signedPdf = await convertDocxToPdf(patchedDocx);
          attachments.push({ filename: "signed-offer-letter.pdf", content: signedPdf });
          console.log(`[offer-email] Fallback: signed PDF via inject + LibreOffice (${signedPdf.length} bytes)`);
          return attachments;
        } catch (injectErr) {
          console.warn(
            "[offer-email] Fallback PDF from merged buffer failed:",
            (injectErr as Error)?.message,
          );
        }
      }

      console.warn("[offer-email] Falling back to signature image only (no signed PDF could be built).");
      try {
        const parsed = parseDataUrl(signatureData);
        if (parsed?.buffer?.length) {
          const ext = parsed.contentType.toLowerCase().includes("png") ? "png" : "jpg";
          attachments.push({ filename: `your-signature.${ext}`, content: parsed.buffer });
        }
      } catch {
        /* ignore */
      }
    }
    return attachments;
  }

  /**
   * Candidate copy after e-sign: signed PDF when possible; otherwise signature image only (never a Word “signed” attachment).
   */
  private async _sendEsignCompleteEmailToCandidate(opts: {
    candidateEmail: string;
    candidateName: string;
    jobTitle: string;
    mergedDocumentUrl: string | null | undefined;
    signatureData: string;
    /** When set (e.g. from submitEsign), avoids generating attachments twice */
    prebuiltAttachments?: Array<{ filename: string; content: Buffer }>;
  }): Promise<void> {
    const ctx: NotifyContext = { candidate_name: opts.candidateName, job_title: opts.jobTitle, recipient_name: opts.candidateName };
    const rendered = await getRenderedNotificationTemplate("recruit.esign_complete_candidate", ctx);
    if (!rendered?.enabled) return;

    const attachments =
      opts.prebuiltAttachments !== undefined
        ? opts.prebuiltAttachments
        : await this._buildEsignAttachments(opts.mergedDocumentUrl, opts.signatureData);

    const html = await wrapInEmailFrame(rendered.body, rendered.subject, "recruit.esign_complete_candidate");
    const from = resolveNotificationFromAddress("recruit.esign_complete_candidate");
    const sendResult = await sendEmail({
      ...(from ? { from } : {}),
      to: opts.candidateEmail,
      subject: rendered.subject,
      html,
      text: rendered.body,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    if (!sendResult.ok) {
      console.warn("[offer-email] esign-complete candidate:", sendResult.message);
    } else {
      console.log(`[offer-email] E-sign complete email sent to ${opts.candidateEmail} (attachments: ${attachments.length})`);
    }
  }

  /**
   * HR + recruiters: same signed PDF as candidate, for internal records (Settings can toggle via recruit.esign_complete_hr).
   */
  private async _sendEsignCompleteEmailToHrTeam(opts: {
    attachments: Array<{ filename: string; content: Buffer }>;
    candidateName: string;
    jobTitle: string;
    applicationId: string;
    jobId: string;
  }): Promise<void> {
    const probe = await getRenderedNotificationTemplate("recruit.esign_complete_hr", {
      candidate_name: opts.candidateName,
      job_title: opts.jobTitle,
      application_id: opts.applicationId,
      job_id: opts.jobId,
      recipient_name: "",
    });
    if (!probe?.enabled) return;

    const teamRaw = await recruitmentTeamRecipients(opts.jobId);
    const seen = new Set<string>();
    const team = teamRaw.filter((r) => {
      const e = r.email.trim().toLowerCase();
      if (!e || seen.has(e)) return false;
      seen.add(e);
      return true;
    });
    if (!team.length) {
      console.warn("[offer-email] E-sign HR copy: no hr/recruiter recipients found");
      return;
    }

    for (const recipient of team) {
      const ctx: NotifyContext = {
        candidate_name: opts.candidateName,
        job_title: opts.jobTitle,
        application_id: opts.applicationId,
        job_id: opts.jobId,
        recipient_name: recipient.name ?? recipient.email,
      };
      const rendered = await getRenderedNotificationTemplate("recruit.esign_complete_hr", ctx);
      if (!rendered) continue;

      const html = await wrapInEmailFrame(rendered.body, rendered.subject, "recruit.esign_complete_hr");
      const from = resolveNotificationFromAddress("recruit.esign_complete_hr");
      const sendResult = await sendEmail({
        ...(from ? { from } : {}),
        to: recipient.email,
        subject: rendered.subject,
        html,
        text: rendered.body,
        attachments: opts.attachments.length > 0 ? opts.attachments : undefined,
      });
      if (!sendResult.ok) {
        console.warn("[offer-email] esign-complete HR:", recipient.email, sendResult.message);
      } else {
        console.log(`[offer-email] E-sign complete (HR copy) sent to ${recipient.email} (attachments: ${opts.attachments.length})`);
      }
    }
  }

  async approveOffer(id: string, userId: string, user?: UserPayload) {
    const offer = await this.r.getOfferById(id);
    if (!offer) throw new NotFoundError("Offer not found");
    if (user && offer.application_id) {
      const app = await this.r.getApplicationById(offer.application_id);
      if (app?.job_id) {
        const policy = await resolvePolicy(user);
        assertJobAccess(policy, app.job_id);
      }
    }
    if (offer.approval_status === "approved") return offer;
    if (offer.approval_status === "rejected") throw new ValidationError("Offer was rejected and cannot be approved.");
    if (offer.approval_status === "not_requested") {
      throw new ValidationError("Approval has not been requested for this offer yet.");
    }
    if (offer.approval_status !== "pending") {
      throw new ValidationError("This offer is not awaiting approval.");
    }
    const result = await this.r.approveOffer(id, userId);
    if (!result) throw new ValidationError("This offer could not be approved. It may no longer be pending.");
    await this.r.auditLog("offer", id, "OFFER_APPROVED", userId, { applicationId: offer.application_id });
    emitRefreshAll();
    return result;
  }

  /**
   * Limited recruiter: after filling the draft, notify HR/recruiter and move offer to pending approval.
   */
  async requestOfferApproval(id: string, userId: string, user?: UserPayload) {
    const offer = await this.r.getOfferById(id);
    if (!offer) throw new NotFoundError("Offer not found");
    if (String(offer.created_by || "") !== String(userId)) {
      throw new ValidationError("Only the recruiter who created this offer can request approval.");
    }
    const roleSet = this.toRoleSet(user);
    const isLimitedOnly = roleSet.has("limited_recruiter") && !roleSet.has("recruiter") && !roleSet.has("hr") && !roleSet.has("admin");
    if (!isLimitedOnly) {
      throw new ValidationError("Request approval is only used for limited-recruiter offers.");
    }
    if (user && offer.application_id) {
      const app = await this.r.getApplicationById(offer.application_id);
      if (app?.job_id) {
        const policy = await resolvePolicy(user);
        assertJobAccess(policy, app.job_id);
      }
    }
    if (offer.approval_status !== "not_requested") {
      throw new ValidationError(
        offer.approval_status === "pending"
          ? "Approval has already been requested for this offer."
          : "This offer is not in a state where approval can be requested.",
      );
    }
    const updated = await this.r.requestOfferApproval(id);
    if (!updated) throw new ValidationError("Could not request approval for this offer.");
    const appCheck = await this.r.getApplicationById(offer.application_id);
    if (appCheck) {
      (async () => {
        try {
          const team = await recruitmentTeamRecipients(String(appCheck.job_id ?? ""));
          const candidateName = `${appCheck.first_name || ""} ${appCheck.last_name || ""}`.trim() || "Candidate";
          const ctx = {
            candidate_name: candidateName,
            job_title: appCheck.job_title || "—",
            doer_name: userId,
            application_id: appCheck.id,
            job_id: String(appCheck.job_id ?? ""),
          };
          if (team.length) await notifyEmail("recruit.offer_approval_request", ctx, team);
        } catch {}
      })();
    }
    void this.r.auditLog("offer", id, "OFFER_APPROVAL_REQUESTED", userId, { applicationId: offer.application_id });
    emitRefreshAll();
    return updated;
  }

  async rejectOffer(id: string, userId: string, user?: UserPayload) {
    const offer = await this.r.getOfferById(id);
    if (!offer) throw new NotFoundError("Offer not found");
    if (user && offer.application_id) {
      const app = await this.r.getApplicationById(offer.application_id);
      if (app?.job_id) {
        const policy = await resolvePolicy(user);
        assertJobAccess(policy, app.job_id);
      }
    }
    if (offer.approval_status === "rejected") return offer;
    const result = await this.r.rejectOffer(id, userId);
    await this.r.auditLog("offer", id, "OFFER_REJECTED", userId, { applicationId: offer.application_id });
    emitRefreshAll();
    return result;
  }

  /**
   * Data URLs must be promoted to SharePoint (no large base64 in DB). Already-HTTP URLs are stored as-is.
   */
  private async persistOfferFileUrlToSharePointOrThrow(offerId: string, fileUrl: string, fileName: string): Promise<string> {
    const trimmed = String(fileUrl).trim();
    if (!trimmed) throw new ValidationError("fileUrl is required");
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    if (!trimmed.startsWith("data:")) throw new ValidationError("fileUrl must be a data URL or https URL");
    if (!isSharePointAvatarConfigured()) {
      throw new ValidationError(
        `SharePoint must be configured to store offer documents. Missing: ${getMissingSharePointEnvVars().join(", ")}`,
      );
    }
    const parsed = parseDataUrl(trimmed);
    if (!parsed?.buffer?.length) throw new ValidationError("Invalid file data");
    const baseName = (fileName && String(fileName).trim()) || "offer-letter.pdf";
    const uploadName = `offer-${offerId}-${baseName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200)}`;
    const url = await uploadFileToSharePoint("Recruitment/OfferLetters", uploadName, parsed.buffer, parsed.contentType);
    if (!url) throw new ValidationError("SharePoint upload did not return a URL. Check server logs and drive permissions.");
    return url;
  }

  async uploadOfferLetter(id: string, fileUrl: string, fileName: string, user?: UserPayload) {
    const rows = await this.r.getOfferById(id);
    if (!rows) throw new NotFoundError("Offer not found");
    if (user && rows.application_id) {
      const app = await this.r.getApplicationById(rows.application_id);
      if (app?.job_id) {
        const policy = await resolvePolicy(user);
        assertJobAccess(policy, app.job_id);
      }
    }
    if (!fileUrl || typeof fileUrl !== "string") throw new ValidationError("fileUrl (data URL) is required");
    const fileUrlToStore = await this.persistOfferFileUrlToSharePointOrThrow(id, fileUrl, fileName);
    await this.r.uploadOfferLetter(id, fileUrlToStore, (fileName && String(fileName).trim()) || "offer-letter.pdf");
    void this.r.auditLog("offer", id, "OFFER_LETTER_UPLOADED", user?.id ?? null, { fileName: (fileName && String(fileName).trim()) || "offer-letter.pdf" });
    emitRefreshAll();
  }

  /**
   * Store a manually uploaded DOCX/PDF as the merged document for e-sign.
   * - PDF: uploaded bytes as-is (AcroForm / flat PDF path at sign time).
   * - DOCX: same merge as gallery templates (`buildOfferVariables` + Docxtemplater) so
   *   `{{candidate.signature}}` becomes the ESIGN marker; unknown `{{tags}}` become empty.
   */
  async setManualOfferDoc(id: string, fileUrl: string, fileName: string, user?: UserPayload) {
    const offer = await this.r.getOfferById(id);
    if (!offer) throw new NotFoundError("Offer not found");
    if (user && offer.application_id) {
      const app = await this.r.getApplicationById(offer.application_id);
      if (app?.job_id) {
        const policy = await resolvePolicy(user);
        assertJobAccess(policy, app.job_id);
      }
    }
    if (!fileUrl || typeof fileUrl !== "string") throw new ValidationError("fileUrl (data URL) is required");
    const parsed = parseDataUrl(fileUrl);
    if (!parsed?.buffer?.length) throw new ValidationError("Invalid file data");

    const { bufferIsPdf } = await import("../offer-templates/pdfFormService.js");
    if (bufferIsPdf(parsed.buffer)) {
      const fileUrlToStore = await this.persistOfferFileUrlToSharePointOrThrow(id, fileUrl, fileName);
      await this.r.updateOffer(id, {
        mergedDocumentUrl: fileUrlToStore,
        esignStatus: "pending",
        templateId: null,
        templateVersion: null,
        variablesSnapshot: null,
      });
      await this.r.uploadOfferLetter(id, fileUrlToStore, (fileName && String(fileName).trim()) || "offer-letter.pdf");
      void this.r.auditLog("offer", id, "OFFER_DOC_UPLOADED", user?.id ?? null, {
        fileName: (fileName && String(fileName).trim()) || "offer-letter.pdf",
        manualKind: "pdf",
      });
      emitRefreshAll();
      return this.r.getOfferById(id);
    }

    const isZipOffice = parsed.buffer.length >= 4 && parsed.buffer[0] === 0x50 && parsed.buffer[1] === 0x4b;
    if (!isZipOffice) {
      throw new ValidationError("Manual offer letter must be a .docx file (ZIP package) or a PDF.");
    }

    const { OfferTemplateService } = await import("../offer-templates/OfferTemplateService.js");
    const tmplSvc = new OfferTemplateService();
    const mergedVars = await this.buildOfferVariables(id);
    let mergedBase64: string;
    try {
      mergedBase64 = tmplSvc.mergeTemplateFromBuffer(parsed.buffer, mergedVars);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new ValidationError(
        `Could not merge this document with offer fields: ${msg}. Keep merge tags only where needed (e.g. {{candidate.signature}}) or match configured template placeholders.`,
      );
    }
    const mergedUrl = await tmplSvc.uploadMergedOfferArtifact(mergedBase64, id);

    await this.r.updateOffer(id, {
      mergedDocumentUrl: mergedUrl,
      esignStatus: "pending",
      templateId: null,
      templateVersion: null,
      variablesSnapshot: mergedVars,
    });
    await this.r.uploadOfferLetter(id, mergedUrl, (fileName && String(fileName).trim()) || "offer-letter.docx");
    void this.r.auditLog("offer", id, "OFFER_DOC_UPLOADED", user?.id ?? null, {
      fileName: (fileName && String(fileName).trim()) || "offer-letter.docx",
      manualKind: "docx_merged",
    });
    emitRefreshAll();
    return this.r.getOfferById(id);
  }

  /** Generate and stream the signed PDF on demand (uses stored esign_signature_data). */
  async getOfferSignedPdf(id: string, user?: UserPayload): Promise<{ buffer: Buffer; filename: string } | null> {
    const offer = await this.r.getOfferById(id);
    if (!offer) throw new NotFoundError("Offer not found");
    if (user && offer.application_id) {
      const app = await this.r.getApplicationById(offer.application_id);
      if (app?.job_id) {
        const policy = await resolvePolicy(user);
        assertJobAccess(policy, app.job_id);
      }
    }
    if (offer.esign_status !== "signed") return null;
    const details = await this.r.getOfferFullDetails(id);
    const signerName = `${details?.first_name ?? ""} ${details?.last_name ?? ""}`.trim() || "Candidate";
    const candidateName = signerName.replace(/\s+/g, "_");

    const storedSigned = String((offer as Record<string, unknown>).signed_document_url ?? "").trim();
    const canRegeneratePdf = !!(offer.esign_signature_data && offer.merged_document_url);
    const isWordMime = (ct: string) =>
      ct.includes("word") || ct.includes("officedocument") || ct.includes("msword");
    if (storedSigned.startsWith("http://") || storedSigned.startsWith("https://")) {
      try {
        const sp = await getAvatarContentBySharingUrl(storedSigned);
        if (sp?.buffer?.length) {
          const ct = (sp.contentType || "").toLowerCase();
          const urlLooksDocx = storedSigned.toLowerCase().includes(".docx");
          const isDocx = urlLooksDocx || isWordMime(ct);
          if (isDocx && canRegeneratePdf) {
            /* Stale SharePoint object may be .docx from an older pipeline — regenerate PDF below. */
          } else if (isDocx) {
            return null;
          } else {
            return { buffer: sp.buffer, filename: `${candidateName}_Signed_Offer.pdf` };
          }
        }
      } catch {
        /* fall through */
      }
      try {
        const res = await fetch(storedSigned);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length) {
            const ct = (res.headers.get("content-type") || "").toLowerCase();
            const isDocx = isWordMime(ct);
            if (isDocx && canRegeneratePdf) {
              /* regenerate PDF below */
            } else if (isDocx) {
              return null;
            } else {
              return { buffer: buf, filename: `${candidateName}_Signed_Offer.pdf` };
            }
          }
        }
      } catch {
        /* fall through */
      }
    }

    if (!offer.esign_signature_data || !offer.merged_document_url) return null;
    const signedDate = offer.esign_signed_at
      ? new Date(offer.esign_signed_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const { OfferTemplateService } = await import("../offer-templates/OfferTemplateService.js");
    const tmplSvc = new OfferTemplateService();
    const pdfBuf = await tmplSvc.generateSignedPdf(offer.merged_document_url, offer.esign_signature_data, signerName, signedDate);
    return { buffer: pdfBuf, filename: `${candidateName}_Signed_Offer.pdf` };
  }

  async getOfferLetter(id: string, user?: UserPayload) {
    const rows = await this.r.getOfferLetter(id);
    if (!rows) throw new NotFoundError("Offer not found");
    if (user) {
      const offer = await this.r.getOfferById(id);
      if (offer?.application_id) {
        const app = await this.r.getApplicationById(offer.application_id);
        if (app?.job_id) {
          const policy = await resolvePolicy(user);
          assertJobAccess(policy, app.job_id);
        }
      }
    }
    if (!rows.offer_letter_url) throw new NotFoundError("No offer letter uploaded");
    return rows;
  }

  async getOfferByToken(token: string) {
    if (!token || token.length < 16) throw new ValidationError("Invalid token");
    const offer = await this.r.getOfferByToken(token);
    if (!offer) throw new NotFoundError("Offer not found or link has expired");
    return offer;
  }

  async getOfferLink(id: string, protocol: string, host: string, user?: UserPayload) {
    const rows = await this.r.getOfferLink(id);
    if (!rows) throw new NotFoundError("Offer not found");
    if (user) {
      const offer = await this.r.getOfferById(id);
      if (offer?.application_id) {
        const app = await this.r.getApplicationById(offer.application_id);
        if (app?.job_id) {
          const policy = await resolvePolicy(user);
          assertJobAccess(policy, app.job_id);
        }
      }
    }
    let token = rows.response_token;
    if (!token) {
      token = crypto.randomBytes(32).toString("hex");
      await this.r.updateOfferToken(id, token);
    }
    const offer = await this.r.getOfferById(id);
    const hasTemplate = !!(offer?.template_id || offer?.merged_document_url);
    const path = hasTemplate ? `/offer-sign/${token}` : `/offer-response/${token}`;
    return { url: `${protocol}://${host}${path}`, token, status: rows.status };
  }

  // ── Hire ─────────────────────────────────────────────────────────────────────
  async hireCandidate(applicationId: string, body: any, userId: string, user?: UserPayload) {
    const { employeeId: rawEmployeeId, workEmail } = body;
    const trimmedId = rawEmployeeId != null ? String(rawEmployeeId).trim() : "";
    const employeeId = trimmedId || (await this.employeeSvc.getSuggestedId());
    const app = await this.r.getApplicationForHire(applicationId);
    if (!app) throw new NotFoundError("Application not found");
    if (user && app.job_id) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, app.job_id);
    }
    if (app.stage === "hired") throw new ValidationError("Already hired");
    if (app.employee_id) throw new ValidationError("Already linked to an employee");
    const offerRows = await this.r.getOffersByApplication(applicationId);
    if (offerRows.length === 0) throw new ValidationError("No offer exists");
    const offer = offerRows[0];
    if (offer.approval_status != null && offer.approval_status !== "approved") throw new ValidationError("Offer must be approved before hiring.");
    if (offer.approval_status == null && offer.status !== "accepted") throw new ValidationError(`Offer must be accepted. Current: '${offer.status}'.`);
    const workEmailToUse = (workEmail && String(workEmail).trim()) || app.email;
    if (!workEmailToUse) throw new ValidationError("Candidate has no email on file.");
    const nickHire = body.nickname ?? body.pseudonym;
    const hireNickname = nickHire != null && String(nickHire).trim() ? String(nickHire).trim() : null;
    const branchId = await this.employeeSvc.resolveBranchIdForLocation(app.job_location);
    const employee = await this.r.createEmployeeFromHire({ employeeId, workEmail: workEmailToUse, firstName: app.first_name, lastName: app.last_name, nickname: hireNickname, jobTitle: offer.job_title, department: offer.department, location: app.job_location, branchId, employmentType: mapToEmployeeType(offer.employment_type), joinDate: offer.start_date || new Date(), personalEmail: app.candidate_personal_email || app.email, personalPhone: app.phone, dob: app.date_of_birth, gender: app.gender, maritalStatus: app.marital_status, bloodGroup: app.blood_group, street: app.street, city: app.city, state: app.state, country: app.country, zipCode: app.zip_code });
    await this.r.markApplicationHired(applicationId, employee.id, app.stage, userId);
    await this.r.auditLog("application", applicationId, "CANDIDATE_HIRED", userId, { employeeId: employee.id, fromStage: app.stage });
    // Email: notify HR and onboarding that candidate is hired
    (async()=>{try{const candidateName=`${app.first_name||""} ${app.last_name||""}`.trim()||"Candidate";const hrs=await recruitmentTeamRecipients(String(app.job_id??""),["hr"]);const ctx={candidate_name:candidateName,job_title:offer.job_title||"—",application_id:applicationId,job_id:String(app.job_id??"")};if(hrs.length)await notifyEmail("recruit.hired",ctx,hrs);}catch{}})();
    emitRefreshAll();
    return { message: "Candidate hired successfully.", employee, applicationId };
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────
  async getStats(user?: UserPayload) {
    const policy = await this.getPolicy(user);
    if (policy && !policy.isOrgWideRecruit) {
      const scoped = assignedJobFilter(policy) ?? [];
      return this.r.getStatsScoped(scoped);
    }
    return this.r.getStats();
  }

  // ── FreshTeam migrations ──────────────────────────────────────────────────────
  /** Resolve HRMS user id from FT job recruiter / hiring-manager emails. */
  private async resolveOwnerUserIdFromFreshTeamJob(job: Record<string, unknown>): Promise<string | null> {
    const { ownerEmails } = parseFreshTeamJobAudit(job);
    for (const email of ownerEmails) {
      const userId = await this.r.resolveUserIdByEmail(email);
      if (userId) return userId;
    }
    return null;
  }

  async migrateFreshteamJobAudit() {
    if (!isFreshTeamConfigured()) throw Object.assign(new Error("FreshTeam migration not configured"), { statusCode: 503 });
    const delayMs = getFreshTeamDelayMs();
    const linked = await this.r.listFreshteamLinkedJobs();
    let updated = 0;
    let ownerMatched = 0;
    let ownerUnmatched = 0;
    const errors: Array<{ ftJobId: string; title: string; error: string }> = [];
    console.log(`[FT job audit sync] ${linked.length} linked job(s)`);
    for (const row of linked) {
      const ftIdStr = String(row.freshteam_job_id).trim();
      try {
        const ftJob = await getJobPosting(Number(ftIdStr));
        await sleep(delayMs);
        const audit = parseFreshTeamJobAudit(ftJob as Record<string, unknown>);
        const ownerUserId = await this.resolveOwnerUserIdFromFreshTeamJob(ftJob as Record<string, unknown>);
        if (ownerUserId) ownerMatched++;
        else if (audit.ownerEmails.length > 0) ownerUnmatched++;
        await this.r.applyJobAuditFromFreshTeam(row.id, {
          createdAt: audit.createdAt,
          updatedAt: audit.updatedAt,
          createdBy: ownerUserId,
          updatedBy: ownerUserId,
        });
        updated++;
        console.log(
          `[FT job audit sync] FT ${ftIdStr} → ${row.title.slice(0, 40)} | created=${audit.createdAt?.toISOString() ?? "?"} updated=${audit.updatedAt?.toISOString() ?? "?"} owner=${ownerUserId ?? "unmatched"}`
        );
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[FT job audit sync] ERROR FT ${ftIdStr}:`, errMsg);
        errors.push({ ftJobId: ftIdStr, title: row.title, error: errMsg });
      }
    }
    console.log(
      `[FT job audit sync] done: updated=${updated}, ownerMatched=${ownerMatched}, ownerUnmatched=${ownerUnmatched}, errors=${errors.length}`
    );
    return {
      message: "FreshTeam job audit sync finished (created/updated times and recruiter as owner)",
      totalJobs: linked.length,
      updated,
      ownerMatched,
      ownerUnmatched,
      note: "FreshTeam API does not expose last editor; updated_by uses primary recruiter when matched to an HRMS user.",
      errors: errors.length ? errors : undefined,
    };
  }

  async migrateFreshteamJobs() {
    if (!isFreshTeamConfigured()) throw Object.assign(new Error("FreshTeam migration not configured"), { statusCode: 503 });
    const delayMs = getFreshTeamDelayMs(), perPage = 30;
    let page = 1, totalProcessed = 0, created = 0, skippedExisting = 0, skippedNotPublished = 0;
    const errors: any[] = [];
    const linked = await this.r.listFreshteamLinkedJobs();
    const existingFtIds = new Set(linked.map((j) => String(j.freshteam_job_id).trim()).filter(Boolean));
    console.log(`[FT job migrate] ${existingFtIds.size} job(s) already linked — will skip; importing remaining published FT jobs only`);
    while (true) {
      const list = await listJobPostings(page, perPage); await sleep(delayMs);
      if (list.length === 0) break;
      for (const summary of list) {
        const ftId = (summary as any).id; if (ftId == null) continue;
        const ftIdStr = String(ftId);
        if (existingFtIds.has(ftIdStr)) {
          skippedExisting++;
          continue;
        }
        const summaryStatus = (summary as { status?: string }).status;
        if (summaryStatus != null && String(summaryStatus).trim() !== "" && !isFreshTeamJobPublishedStatus(summaryStatus)) {
          skippedNotPublished++;
          continue;
        }
        try {
          const job = await getJobPosting(ftId); await sleep(delayMs);
          if ((job as { deleted?: boolean }).deleted === true) {
            skippedNotPublished++;
            continue;
          }
          const ftStatus = (job as { status?: string }).status;
          if (!isFreshTeamJobPublishedStatus(ftStatus)) {
            skippedNotPublished++;
            continue;
          }
          const title = (job as any).title ?? "Untitled";
          const dept = (job as any).department?.name ?? (job as any).department ?? null;
          const desc = htmlToPlainText((job as any).description ?? (job as any).job_description);
          const reqs = htmlToPlainText((job as any).requirements ?? (job as any).job_requirement);
          const empType = (job as any).employment_type ?? (job as any).type ?? null;
          const expLevel = (job as any).experience_level ?? (job as any).experience ?? null;
          const salMin = (job as any).salary_min != null ? Number((job as any).salary_min) : (job as any).salary?.min != null ? Number((job as any).salary.min) : null;
          const salMax = (job as any).salary_max != null ? Number((job as any).salary_max) : (job as any).salary?.max != null ? Number((job as any).salary.max) : null;
          const currency = (job as any).salary_currency ?? (job as any).salary?.currency ?? null;
          const headcount = headcountFromFreshTeamJob(job as Record<string, unknown>);
          const status = mapFreshTeamJobStatusToHrms(ftStatus);
          const publishedAt = (job as any).published_on ? new Date((job as any).published_on) : null;
          const closedAt = (job as any).closed_at ? new Date((job as any).closed_at) : null;
          const recruiterEmails = recruiterEmailsFromFreshTeamJob(job as Record<string, unknown>);
          const hmIds = await this.r.resolveHiringManagersByEmails(recruiterEmails);
          const location = formatFreshTeamJobLocation(job as Record<string, unknown>);
          const regionCode = inferRegionCodeFromJobLocation(location);
          const ftAudit = parseFreshTeamJobAudit(job as Record<string, unknown>);
          const ownerUserId = await this.resolveOwnerUserIdFromFreshTeamJob(job as Record<string, unknown>);
          await this.r.insertJobFromFreshteam({ freshteamJobId: ftId, title, department: dept, location, regionCode, description: desc, requirements: reqs, status, employmentType: empType, experienceLevel: expLevel, salaryRangeMin: salMin, salaryRangeMax: salMax, salaryCurrency: currency, headcount, hiringManagerId: hmIds[0]??null, hmIdsJson: hmIds.length > 0 ? JSON.stringify(hmIds) : null, publishedAt, closedAt, createdAt: ftAudit.createdAt, updatedAt: ftAudit.updatedAt, createdBy: ownerUserId, updatedBy: ownerUserId });
          existingFtIds.add(ftIdStr);
          created++;
          totalProcessed++;
          console.log(`[FT job migrate] created FT ${ftIdStr}: ${title}`);
        } catch (e: any) {
          const errMsg = e?.message ?? String(e);
          console.error(`[FT job migrate] ERROR FT ${ftIdStr}: ${errMsg}`);
          errors.push({ jobId: Number(ftId), title: (summary as { title?: string }).title ?? null, error: errMsg });
        }
      }
      if (list.length < perPage) break;
      page++;
    }
    console.log(`[FT job migrate] done: created=${created}, skippedExisting=${skippedExisting}, skippedNotPublished=${skippedNotPublished}, errors=${errors.length}`);
    if (errors.length) {
      for (const err of errors) {
        console.error(`[FT job migrate]   jobId=${err.jobId} title=${err.title ?? "?"} error=${err.error}`);
      }
    }
    return {
      message: "FreshTeam job migration finished (existing jobs skipped; published only)",
      totalProcessed,
      created,
      skippedExisting,
      skippedNotPublished,
      errors: errors.length ? errors : undefined,
    };
  }

  async migrateFreshteamCandidates(options: MigrateFreshteamCandidatesOptions = {}) {
    if (!isFreshTeamConfigured()) throw Object.assign(new Error("FreshTeam migration not configured"), { statusCode: 503 });
    if (freshteamCandidateMigrationInProgress) throw Object.assign(new Error("FreshTeam candidate migration already running"), { statusCode: 409 });
    freshteamCandidateMigrationInProgress = true;
    const delayMs = getFreshTeamDelayMs();
    const perPage = 50;
    const statusEnv = process.env.FRESHTEAM_APPLICANT_MIGRATE_STATUSES?.trim();
    /** Do not default to FRESHTEAM_APPLICANT_STATUSES — FT API returns 0 rows when all statuses are sent as query params. */
    const applicantStatuses: string[] | null = statusEnv
      ? statusEnv.split(",").map((s) => s.trim()).filter(Boolean)
      : null;
    let applicantsProcessed = 0, candidatesCreated = 0, candidatesUpdated = 0, candidatesReused = 0, candidatesSkipped = 0, applicationsCreated = 0;
    let applicationsAlreadyLinked = 0;
    let applicantsWithoutEmail = 0;
    let linkOnlySkippedNoCandidate = 0;
    let orphanBackfillCandidates = 0;
    let orphanBackfillApplicationsCreated = 0;
    let orphanBackfillApplicationsAlreadyLinked = 0;
    let orphanBackfillSkippedUnlinkedJob = 0;
    let orphanBackfillNoApplicantIds = 0;
    const errors: any[] = [];
    const jobSummaries: Array<{ ftJobId: string; ourJobId: string; uniqueApplicantsFromFt: number; applicationsCreated: number }> = [];
    const candidateCache = new Map<number, any>();
    try {
      const linkedJobs = await this.r.listFreshteamLinkedJobs();
      const ourJobMap = new Map<string, string>();
      for (const j of linkedJobs) {
        ourJobMap.set(String(j.freshteam_job_id), j.id);
      }
      const linkApplicantToJob = async (
        candidateDbId: string,
        ourJobId: string,
        ftJobId: string,
        applicantDetail: any
      ): Promise<"created" | "exists"> => {
        const targetJobId = resolveOurJobIdForApplicant(ourJobMap, ftJobId, applicantDetail, ourJobId);
        if (await this.r.applicationExistsForJob(candidateDbId, targetJobId)) return "exists";
        const appliedAt = applicantDetail.created_at ? new Date(applicantDetail.created_at) : new Date();
        const stage = mapFtStageToOur((applicantDetail.stage ?? applicantDetail.sub_stage) ?? undefined);
        await this.r.createApplicationFromFreshteam(
          candidateDbId,
          targetJobId,
          stage,
          appliedAt,
          applicantDetail.cover_letter ? String(applicantDetail.cover_letter).trim() || null : null,
          (applicantDetail.referral_source ?? applicantDetail.source)
            ? String(applicantDetail.referral_source ?? applicantDetail.source).trim() || null
            : null
        );
        applicationsCreated++;
        return "created";
      };
      if (ourJobMap.size === 0) {
        throw Object.assign(
          new Error(
            "No job postings are linked to FreshTeam (freshteam_job_id is missing). Run “Migrate jobs from FreshTeam” first, then migrate candidates again."
          ),
          { statusCode: 400 }
        );
      }
      let jobEntries = Array.from(ourJobMap.entries());
      const targetedJobs: Array<{ ftJobId: string; ourJobId: string; title: string }> = [];
      if (options.onlyZeroApplicantJobs) {
        const zeroJobs = await this.r.listFreshteamLinkedJobsWithZeroApplications();
        const zeroFtIds = new Set(zeroJobs.map((j) => String(j.freshteam_job_id).trim()));
        jobEntries = jobEntries.filter(([ftId]) => zeroFtIds.has(String(ftId).trim()));
        for (const j of zeroJobs) {
          const ourId = ourJobMap.get(String(j.freshteam_job_id).trim());
          if (ourId) targetedJobs.push({ ftJobId: String(j.freshteam_job_id), ourJobId: ourId, title: j.title });
        }
        console.log(
          "[FT candidate migration] onlyZeroApplicantJobs:",
          jobEntries.length,
          "job(s)",
          jobEntries.map(([id]) => id).join(", ") || "(none)"
        );
      }
      if (options.ftJobIds?.length) {
        const allow = new Set(options.ftJobIds.map((id) => String(id).trim()).filter(Boolean));
        jobEntries = jobEntries.filter(([ftId]) => allow.has(String(ftId).trim()));
      }
      if (jobEntries.length === 0) {
        return {
          message: options.onlyZeroApplicantJobs
            ? "No FT-linked jobs with zero applications — nothing to sync"
            : "No jobs matched the requested filter",
          phase2Only: options.phase2Only === true,
          onlyZeroApplicantJobs: options.onlyZeroApplicantJobs === true,
          jobsTargeted: 0,
          targetedJobs: [],
          jobsWithFreshteamId: ourJobMap.size,
          applicantsProcessed: 0,
          candidatesCreated: 0,
          candidatesUpdated: 0,
          candidatesReused: 0,
          candidatesSkipped: 0,
          applicationsCreated: 0,
          applicationsAlreadyLinked: 0,
          linkOnlySkippedNoCandidate: 0,
          applicantsWithoutEmail: 0,
          candidatesInCache: 0,
          jobSummaries: [],
          errors: undefined,
        };
      }
      console.log(
        "[FT candidate migration] Linked jobs:",
        ourJobMap.size,
        "| syncing:",
        jobEntries.length,
        "| applicant status filter:",
        applicantStatuses?.length ? applicantStatuses.join(",") : "(none — all statuses)",
        options.phase2Only ? "| phase2Only (link only)" : "",
        options.onlyZeroApplicantJobs ? "| onlyZeroApplicantJobs" : ""
      );
      for (const [ftJobId, ourJobId] of jobEntries) {
        const jobRow = await this.r.getJobById(ourJobId);
        if (jobRow && !(jobRow as { region_code?: string | null }).region_code) {
          try {
            const ftJob = await getJobPosting(Number(ftJobId));
            await sleep(delayMs);
            const location = formatFreshTeamJobLocation(ftJob as Record<string, unknown>);
            const regionCode = inferRegionCodeFromJobLocation(location);
            await this.r.patchJobLocationAndRegion(ourJobId, location, regionCode);
            console.log(`[FT candidate migration] Backfilled region for job ${ourJobId} (FT ${ftJobId}): ${regionCode}`);
          } catch (err: unknown) {
            console.warn(`[FT candidate migration] Region backfill failed for FT ${ftJobId}:`, err instanceof Error ? err.message : err);
          }
        }
        const seenApplicantIds = new Set<number>();
        let jobApplicationsCreated = 0;
        let appPage = 1;
        let totalPages: number | null = null;
        do {
          const { applicants: applicantList, meta } = await listApplicantsForJob(
            Number(ftJobId),
            appPage,
            perPage,
            true,
            applicantStatuses?.length ? { statuses: applicantStatuses } : undefined
          );
          await sleep(delayMs);
          if (meta.totalPages != null) totalPages = meta.totalPages;
          if (!applicantList.length) {
            if (appPage === 1) {
              console.warn(
                `[FT candidate migration] Job FT ${ftJobId} page 1 returned 0 applicants (filter: ${applicantStatuses?.join(",") ?? "none"})`
              );
            }
            if (totalPages != null && appPage < totalPages) {
              console.warn("[FT candidate migration] Empty page but total-pages says more", { ftJobId, appPage, totalPages });
            }
            break;
          }
          if (appPage === 1) {
            console.log(
              "[FT candidate migration] Job",
              ftJobId,
              "page 1:",
              applicantList.length,
              "rows; FT total-objects:",
              meta.totalObjects ?? "n/a",
              "total-pages:",
              meta.totalPages ?? "n/a"
            );
          }
            for (const appSummary of applicantList) {
            const applicantId = (appSummary as any).id;
            if (applicantId == null) { candidatesSkipped++; continue; }
            if (seenApplicantIds.has(Number(applicantId))) continue;
            seenApplicantIds.add(Number(applicantId));
            applicantsProcessed++;
            const linkOnly =
              options.phase2Only === true ||
              (options.phase2ResumeAfterProcessed != null &&
                applicantsProcessed <= options.phase2ResumeAfterProcessed);
            const candidateId: number | null = (appSummary as any).candidate_id ?? (appSummary as any).candidate?.id ?? null;
            const summaryEmailEarly = emailFromApplicantSummary(appSummary);
            const placeholderEmailEarly =
              candidateId != null ? freshteamMigrationPlaceholderEmail(candidateId, Number(applicantId)) : null;
            const resolvedExisting = await this.r.resolveCandidateForFreshteamImport({
              freshteamCandidateId: candidateId != null ? String(candidateId) : null,
              email: summaryEmailEarly || placeholderEmailEarly || "",
              placeholderEmail: placeholderEmailEarly,
            });
            if (resolvedExisting?.id) {
              let applicantDetail: any = appSummary;
              if (!(applicantDetail.created_at && (applicantDetail.stage ?? applicantDetail.sub_stage))) {
                applicantDetail = await getApplicant(Number(applicantId));
                await sleep(delayMs);
              }
              const linkResult = await linkApplicantToJob(resolvedExisting.id, ourJobId, ftJobId, applicantDetail);
              if (linkResult === "created") jobApplicationsCreated++;
              else applicationsAlreadyLinked++;
              if (linkOnly) continue;
              const hasPlaceholderEmail = resolvedExisting.email.includes("@no-email.freshteam.migrated");
              if (resolvedExisting.matchedBy === "freshteam_id" && !hasPlaceholderEmail) continue;
            } else if (linkOnly) {
              linkOnlySkippedNoCandidate++;
              errors.push({
                applicantId: Number(applicantId),
                ftJobId,
                error: "Candidate not in HRMS — run full migration first (without Phase 2 only)",
              });
              continue;
            }
            // Full fetch + create candidate, then link application to this job
            try {
              let applicantDetail: any = appSummary;
              let cid: number | null = candidateId;
              if (cid == null) { applicantDetail = await getApplicant(Number(applicantId)); await sleep(delayMs); cid = applicantDetail.candidate_id ?? null; }
              let candidate: any;
              if (cid != null) {
                if (!candidateCache.has(cid)) { candidateCache.set(cid, await getCandidate(cid)); await sleep(delayMs); }
                candidate = candidateCache.get(cid);
              } else {
                candidate = { first_name: "Unknown", last_name: "", email: null };
              }
              const nestedCand = (appSummary as any).candidate ?? (appSummary as any).candidate_details;
              let email = ((candidate.email ?? nestedCand?.email ?? "")).trim().toLowerCase();
              if (!email) {
                email = freshteamMigrationPlaceholderEmail(cid, Number(applicantId));
                applicantsWithoutEmail++;
              }
              // Build normalized candidate data
              const data: any = { firstName: String(candidate.first_name||"Unknown").trim()||"Unknown", middleName: candidate.middle_name ? String(candidate.middle_name).trim()||null : null, lastName: String(candidate.last_name||"").trim(), phone: candidate.mobile||candidate.phone||null, linkedinUrl: null, freshteamCandidateId: cid != null ? String(cid) : null };
              const loc = candidate.location ?? candidate.address_details;
              if (loc && typeof loc === "object") { data.city=loc.city||null; data.state=loc.state||null; data.country=loc.country_code||loc.country||null; data.street=loc.street||null; data.zipCode=loc.zip_code||loc.postal_code||null; }
              const expMonths = candidate.total_experience_in_months ?? candidate.experience_in_months;
              data.experienceYears = expMonths != null ? Math.round(Number(expMonths)/12) : (candidate.experience_years != null ? Number(candidate.experience_years) : null);
              data.currentCompany = candidate.current_company ? String(candidate.current_company).trim()||null : null;
              data.currentTitle = candidate.current_title || candidate.designation ? String(candidate.current_title||candidate.designation).trim()||null : null;
              data.notes = candidate.description ? String(candidate.description).trim()||null : null;
              const tagsArr = Array.isArray(candidate.tags) ? candidate.tags : [];
              const skillsArr = Array.isArray(candidate.skills) ? candidate.skills : [];
              const uniqueTags = Array.from(new Set([...tagsArr,...skillsArr].map((t:any)=>String(t).trim()).filter(Boolean)));
              data.tagsJson = uniqueTags.length > 0 ? JSON.stringify(uniqueTags) : null;
              data.expectedSalary = candidate.expected_salary != null ? Number(candidate.expected_salary) : null;
              data.currentSalary = candidate.current_salary != null ? Number(candidate.current_salary) : null;
              data.salaryCurrency = candidate.salary_currency ? String(candidate.salary_currency).trim()||null : null;
              data.dateOfBirth = candidate.date_of_birth && /^\d{4}-\d{2}-\d{2}/.test(String(candidate.date_of_birth)) ? String(candidate.date_of_birth).slice(0,10) : null;
              data.gender = candidate.gender ? String(candidate.gender).trim()||null : null;
              // Resume
              let resumeUrl = "", resumeFilename: string|null = null;
              const resumesList = candidate.resumes ?? candidate.documents ?? candidate.resume;
              const resumesArr = Array.isArray(resumesList) ? resumesList : (resumesList ? [resumesList] : []);
              const resumeObj = resumesArr[0] && typeof resumesArr[0] === "object" ? resumesArr[0] as any : null;
              let resumeUrlAttr = resumeObj?.url ?? resumeObj?.file_url ?? resumeObj?.document_url ?? candidate.resume_url;
              if (!resumeUrlAttr && resumeObj?.id != null && cid != null) { const origin = getFreshTeamOrigin(); if (origin) resumeUrlAttr = `${origin}/api/candidates/${cid}/resumes/${resumeObj.id}`; }
              const resumeNameAttr = resumeObj?.content_file_name ?? resumeObj?.file_name ?? resumeObj?.name;
              if (resumeUrlAttr && typeof resumeUrlAttr === "string") {
                const url = resumeUrlAttr.trim();
                const nameFromApi = resumeNameAttr ? String(resumeNameAttr).trim()||null : null;
                let downloaded = await downloadResumeAsDataUrl(url, nameFromApi ?? deriveResumeFilenameFromUrl(url), true);
                if (!downloaded && resumeObj?.id != null && cid != null && url.includes("/resumes/") && !url.includes("/download")) { const origin = getFreshTeamOrigin(); if (origin) { downloaded = await downloadResumeAsDataUrl(`${origin}/api/candidates/${cid}/resumes/${resumeObj.id}/download`, nameFromApi??"resume.pdf", true); await sleep(delayMs); } }
                if (downloaded) { resumeUrl = downloaded.dataUrl; resumeFilename = downloaded.filename; } else if (resumeUrlAttr) { console.warn("[FT migration] Resume download failed for", email); }
                await sleep(delayMs);
              }
              if (resumeUrl.startsWith("data:") && isSharePointAvatarConfigured()) resumeUrl = await uploadResumeIfNeeded(resumeUrl, cid ?? undefined);
              const placeholderEmail =
                cid != null ? freshteamMigrationPlaceholderEmail(cid, Number(applicantId)) : null;
              const resolvedCand = await this.r.resolveCandidateForFreshteamImport({
                freshteamCandidateId: cid != null ? String(cid) : null,
                email,
                placeholderEmail,
              });
              const existingResume = resolvedCand?.resume_url?.trim() ?? "";
              const isPlaceholder = !existingResume || existingResume === "data:application/octet-stream;base64," || existingResume.length < 100;
              data.resumeUrl = resumeUrl; data.resumeFilename = resumeFilename;
              data.setResume = resumeUrl && (isPlaceholder || !existingResume);
              const result = await this.r.upsertCandidateFromFreshteam(email, data, resolvedCand?.id);
              if (result.created) candidatesCreated++;
              else {
                candidatesUpdated++;
                if (resolvedCand) candidatesReused++;
              }
              const linkResult = await linkApplicantToJob(result.id, ourJobId, ftJobId, applicantDetail);
              if (linkResult === "created") jobApplicationsCreated++;
              else applicationsAlreadyLinked++;
            } catch (err: any) { errors.push({ applicantId: Number(applicantId), error: err?.message ?? String(err) }); }
          }
          const atLastPage = totalPages != null ? appPage >= totalPages : applicantList.length < perPage;
          if (atLastPage) break;
          appPage++;
        } while (true);
        jobSummaries.push({
          ftJobId,
          ourJobId,
          uniqueApplicantsFromFt: seenApplicantIds.size,
          applicationsCreated: jobApplicationsCreated,
        });
        console.log(
          "[FT candidate migration] Job",
          ftJobId,
          "→ HRMS",
          ourJobId,
          "| FT applicants:",
          seenApplicantIds.size,
          "| applications linked:",
          jobApplicationsCreated
        );
      }

      const backfillOrphans =
        options.backfillOrphans !== false &&
        !options.onlyZeroApplicantJobs &&
        !options.ftJobIds?.length &&
        process.env.FRESHTEAM_ORPHAN_BACKFILL !== "0";
      if (backfillOrphans) {
        const maxRaw = process.env.FRESHTEAM_ORPHAN_BACKFILL_MAX?.trim();
        const maxOrphans =
          maxRaw && /^\d+$/.test(maxRaw) ? Math.max(0, parseInt(maxRaw, 10)) : undefined;
        const orphans = await this.r.listFreshteamOrphanCandidates(maxOrphans);
        console.log(
          "[FT candidate migration] Orphan backfill:",
          orphans.length,
          "candidates (via FT candidate applicant_ids)"
        );
        for (const row of orphans) {
          orphanBackfillCandidates++;
          const ftCandId = Number(row.freshteam_candidate_id);
          if (!Number.isFinite(ftCandId)) continue;
          try {
            const ftCand = await getCandidate(ftCandId);
            await sleep(delayMs);
            const applicantIds = applicantIdsFromFtCandidate(ftCand as Record<string, unknown>);
            if (!applicantIds.length) {
              orphanBackfillNoApplicantIds++;
              continue;
            }
            for (const aid of applicantIds) {
              if (!Number.isFinite(aid)) continue;
              let applicantDetail: any;
              try {
                applicantDetail = await getApplicant(aid);
                await sleep(delayMs);
              } catch (err: any) {
                errors.push({
                  orphanCandidateId: row.id,
                  freshteamCandidateId: row.freshteam_candidate_id,
                  applicantId: aid,
                  error: err?.message ?? String(err),
                });
                continue;
              }
              const ftJobOnApp = applicantDetail.job_id ?? applicantDetail.job_posting_id;
              if (ftJobOnApp == null || !ourJobMap.has(String(ftJobOnApp))) {
                orphanBackfillSkippedUnlinkedJob++;
                continue;
              }
              const ourJobForApp = ourJobMap.get(String(ftJobOnApp))!;
              const linkResult = await linkApplicantToJob(
                row.id,
                ourJobForApp,
                String(ftJobOnApp),
                applicantDetail
              );
              if (linkResult === "created") orphanBackfillApplicationsCreated++;
              else orphanBackfillApplicationsAlreadyLinked++;
            }
          } catch (err: any) {
            errors.push({
              orphanCandidateId: row.id,
              freshteamCandidateId: row.freshteam_candidate_id,
              error: err?.message ?? String(err),
            });
          }
          if (orphanBackfillCandidates % 100 === 0) {
            console.log(
              "[FT candidate migration] Orphan backfill progress:",
              orphanBackfillCandidates,
              "/",
              orphans.length,
              "| apps created:",
              orphanBackfillApplicationsCreated
            );
          }
        }
        console.log(
          "[FT candidate migration] Orphan backfill finished | candidates:",
          orphanBackfillCandidates,
          "| applications created:",
          orphanBackfillApplicationsCreated,
          "| already linked:",
          orphanBackfillApplicationsAlreadyLinked,
          "| skipped unlinked FT job:",
          orphanBackfillSkippedUnlinkedJob,
          "| no applicant_ids:",
          orphanBackfillNoApplicantIds
        );
      }

      return {
        message: options.onlyZeroApplicantJobs
          ? "FreshTeam applicant sync finished for jobs with zero applications"
          : options.phase2Only
            ? "FreshTeam applicant linking finished"
            : "FreshTeam candidate migration finished",
        phase2Only: options.phase2Only === true,
        onlyZeroApplicantJobs: options.onlyZeroApplicantJobs === true,
        jobsTargeted: jobEntries.length,
        targetedJobs: targetedJobs.length
          ? targetedJobs
          : jobEntries.map(([ftJobId, ourJobId]) => ({
              ftJobId,
              ourJobId,
              title: linkedJobs.find((j) => String(j.freshteam_job_id) === ftJobId)?.title ?? "",
            })),
        jobsWithFreshteamId: ourJobMap.size,
        applicantsProcessed,
        candidatesCreated,
        candidatesUpdated,
        candidatesReused,
        candidatesSkipped,
        applicationsCreated,
        applicationsAlreadyLinked,
        linkOnlySkippedNoCandidate,
        applicantsWithoutEmail,
        candidatesInCache: candidateCache.size,
        orphanBackfill: backfillOrphans
          ? {
              candidatesProcessed: orphanBackfillCandidates,
              applicationsCreated: orphanBackfillApplicationsCreated,
              applicationsAlreadyLinked: orphanBackfillApplicationsAlreadyLinked,
              skippedUnlinkedJob: orphanBackfillSkippedUnlinkedJob,
              noApplicantIds: orphanBackfillNoApplicantIds,
            }
          : undefined,
        jobSummaries,
        errors: errors.length ? errors : undefined,
      };
    } finally { freshteamCandidateMigrationInProgress = false; }
  }

  // ── E-Sign (template-based offer signing) ───────────────────────────────────

  /** Build merge variables from offer + candidate + job data (same keys as PDF AcroForm field names). */
  async buildOfferVariables(offerId: string): Promise<Record<string, unknown>> {
    const { SIGNATURE_PLACEHOLDERS, SIGNATURE_DATE_PLACEHOLDERS } = await import("../offer-templates/OfferTemplateService.js");
    const { buildOfferMergeStringsFromDetails } = await import("../../../shared/offerMergeFields.js");
    const d = await this.r.getOfferFullDetails(offerId);
    if (!d) throw new NotFoundError("Offer not found");
    const vars: Record<string, unknown> = {
      ...buildOfferMergeStringsFromDetails(d as Record<string, unknown>),
    };
    // Signature placeholders → markers (replaced with actual image at sign time)
    for (const k of SIGNATURE_PLACEHOLDERS) vars[k] = "\u200B\u2063ESIGN_SIGNATURE\u2063\u200B";
    for (const k of SIGNATURE_DATE_PLACEHOLDERS) vars[k] = "\u200B\u2063ESIGN_DATE\u2063\u200B";
    if (process.env.OFFER_DEBUG_MERGE === "1" || process.env.OFFER_DEBUG_MERGE === "true") {
      console.log("[ESigns] merge variables (offer %s):", offerId, JSON.stringify(vars, null, 2));
    }
    return vars;
  }

  /** Get merged offer HTML for the signing page (public, by token). */
  async getOfferHtmlByToken(token: string): Promise<{ html: string; offer: any }> {
    if (!token || token.length < 16) throw new ValidationError("Invalid token");
    const offer = await this.r.getOfferByToken(token);
    if (!offer) throw new NotFoundError("Offer not found or link has expired");
    if (offer.esign_token_expires_at && new Date(offer.esign_token_expires_at) < new Date()) {
      throw new ValidationError("This signing link has expired. Please contact the recruiter for a new link.");
    }
    if (!offer.merged_document_url) {
      return { html: "", offer };
    }

    // For pdf_form templates the merged document is a filled PDF — return empty HTML
    // so the frontend shows the iframe (hasPdf=true path) instead of trying to render HTML.
    try {
      const { OfferTemplateService } = await import("../offer-templates/OfferTemplateService.js");
      const svc = new OfferTemplateService();
      const buf = await svc.resolveDocxBuffer(offer.merged_document_url);
      const { bufferIsPdf } = await import("../offer-templates/pdfFormService.js");
      if (bufferIsPdf(buf)) {
        return { html: "", offer };
      }
    } catch {
      // resolve failed — fall through to HTML conversion attempt
    }

    const { OfferTemplateService } = await import("../offer-templates/OfferTemplateService.js");
    const svc = new OfferTemplateService();
    const html = await svc.docxToPreviewHtml(offer.merged_document_url);
    return { html, offer };
  }

  /** Submit e-signature for an offer (public, by token). */
  async submitEsign(token: string, signatureData: string, ip: string, ua: string): Promise<any> {
    if (!token || token.length < 16) throw new ValidationError("Invalid token");
    if (!signatureData) throw new ValidationError("Signature is required");
    const offer = await this.r.getOfferByToken(token);
    if (!offer) throw new NotFoundError("Offer not found");
    if (offer.status !== "sent") throw new ValidationError("This offer has already been responded to.");
    if (offer.esign_token_expires_at && new Date(offer.esign_token_expires_at) < new Date()) {
      throw new ValidationError("This signing link has expired.");
    }
    const result = await this.r.submitEsign(offer.id, signatureData, ip, ua);
    emitRefreshAll();
    const candidateName = `${offer.candidate_first_name ?? ""} ${offer.candidate_last_name ?? ""}`.trim() || "Candidate";
    const jobTitle = offer.job_title || offer.job_posting_title || "—";

    (async () => {
      try {
        const signedDate = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
        const attachments = await this._buildEsignAttachments(offer.merged_document_url, signatureData, candidateName, signedDate);
        const primary = attachments.find((a) => a.filename === "signed-offer-letter.pdf");
        if (primary && isSharePointAvatarConfigured()) {
          try {
            const ext = primary.filename.endsWith(".pdf") ? "pdf" : "docx";
            const mime =
              ext === "pdf"
                ? "application/pdf"
                : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            const uploadName = `offer-${offer.id}-signed-${Date.now()}.${ext}`;
            const url = await uploadFileToSharePoint("Recruitment/SignedOfferLetters", uploadName, primary.content, mime);
            if (url) await this.r.updateOffer(String(offer.id), { signedDocumentUrl: url });
          } catch (spErr) {
            console.warn("[offer-esign] SharePoint signed document upload:", (spErr as Error)?.message);
          }
        } else if (primary && !isSharePointAvatarConfigured()) {
          console.warn("[offer-esign] SharePoint not configured — signed_document_url not stored (configure SharePoint to persist signed files)");
        }
        await this._sendEsignCompleteEmailToHrTeam({
          attachments,
          candidateName,
          jobTitle,
          applicationId: String(offer.application_id ?? ""),
          jobId: String(offer.job_id ?? ""),
        });
        if (offer.candidate_email) {
          await this._sendEsignCompleteEmailToCandidate({
            candidateEmail: offer.candidate_email,
            candidateName,
            jobTitle,
            mergedDocumentUrl: offer.merged_document_url,
            signatureData,
            prebuiltAttachments: attachments,
          });
        }
      } catch (e) {
        console.warn("[offer-email] esign complete:", (e as Error)?.message);
      }
    })();

    return result;
  }

  /** Decline an offer via e-sign (public, by token). */
  async declineOfferByToken(token: string): Promise<any> {
    if (!token || token.length < 16) throw new ValidationError("Invalid token");
    const offer = await this.r.getOfferByToken(token);
    if (!offer) throw new NotFoundError("Offer not found");
    if (offer.status !== "sent") throw new ValidationError("This offer has already been responded to.");
    const result = await this.r.declineOffer(offer.id);
    emitRefreshAll();
    const candidateName = `${offer.candidate_first_name ?? ""} ${offer.candidate_last_name ?? ""}`.trim() || "Candidate";
    const jobTitle = offer.job_title || offer.job_posting_title || "—";

    (async () => {
      try {
        const team = await recruitmentTeamRecipients(String(offer.job_id ?? ""));
        if (team.length)
          await notifyEmail("recruit.offer_declined", {
            candidate_name: candidateName,
            job_title: jobTitle,
            application_id: String(offer.application_id ?? ""),
            job_id: String(offer.job_id ?? ""),
          }, team);
      } catch {}
    })();

    return result;
  }

  /** Merge a template for an offer and store the merged document on the offer row.
   *  Handles both docx (legacy) and pdf_form (new AcroForm) template types. */
  async mergeOfferTemplate(offerId: string, templateId: string, variableOverrides?: Record<string, unknown>, userId?: string, appBaseUrl?: string) {
    const { OfferTemplateService } = await import("../offer-templates/OfferTemplateService.js");
    const tmplSvc = new OfferTemplateService();
    const template = await tmplSvc.getById(templateId);
    const autoVars = await this.buildOfferVariables(offerId);
    const mergedVars = { ...autoVars, ...(variableOverrides || {}) };

    if (process.env.OFFER_DEBUG_MERGE === "1" || process.env.OFFER_DEBUG_MERGE === "true") {
      console.log(
        "[ESigns] mergeOfferTemplate template_type:",
        template.template_type,
        "hasPdfUrl:",
        !!template.pdf_template_url,
        "hasDocx:",
        !!(template.docx_data && String(template.docx_data).trim()),
      );
    }

    let mergedUrl = "";

    const pdfForm = await import("../offer-templates/pdfFormService.js");
    const { bufferIsPdf, buildPdfFieldValues, fillOfferPdfTemplate } = pdfForm;
    let usedPdfFormFill = false;

    if (template.template_type === "pdf_form" && template.pdf_template_url) {
      try {
        const templateBuf = await tmplSvc.resolveDocxBuffer(template.pdf_template_url);
        if (bufferIsPdf(templateBuf)) {
          const offerDetails = await this.r.getOfferFullDetails(offerId);
          const fieldValues = buildPdfFieldValues(offerDetails ?? (mergedVars as any));
          const flatValues: Record<string, string> = {};
          for (const [k, v] of Object.entries(fieldValues)) flatValues[k] = v;
          const filledPdfBuf = await fillOfferPdfTemplate(templateBuf, flatValues);
          const filledPdfBase64 = filledPdfBuf.toString("base64");
          mergedUrl = await tmplSvc.uploadMergedOfferArtifact(filledPdfBase64, offerId);
          console.log("[offer-merge] PDF form filled and stored for offer %s (%d bytes)", offerId, filledPdfBuf.length);
          usedPdfFormFill = true;
        } else {
          console.warn(
            "[offer-merge] template_type is pdf_form but pdf_template_url is not PDF bytes — using DOCX merge with docx_data",
          );
        }
      } catch (e) {
        console.warn("[offer-merge] PDF template load failed, falling back to DOCX merge:", (e as Error)?.message);
      }
    }

    if (!usedPdfFormFill) {
      if (template.docx_data == null || template.docx_data === "") {
        throw Object.assign(
          new Error("This template has no Word document to merge and no valid PDF form template."),
          { status: 400 },
        );
      }
      const mergedDocxBase64 = await tmplSvc.mergeTemplate(template.docx_data, mergedVars);
      mergedUrl = await tmplSvc.uploadMergedOfferArtifact(mergedDocxBase64, offerId);
    }

    await this.r.updateOffer(offerId, {
      templateId,
      templateVersion: template.version,
      variablesSnapshot: mergedVars,
      mergedDocumentUrl: mergedUrl,
      esignStatus: "pending",
    });

    const row = await this.r.getOfferById(offerId);
    if (row?.status === "sent" && row?.response_token) {
      (async () => {
        try {
          await this._sendOfferEmail(offerId, row.response_token, appBaseUrl);
        } catch (e) {
          console.warn("[offer-email] mergeOfferTemplate:", (e as Error)?.message);
        }
      })();
    }

    void this.r.auditLog("offer", offerId, "OFFER_TEMPLATE_MERGED", userId ?? null, { templateId });
    emitRefreshAll();
    return { mergedVars, templateVersion: template.version };
  }

  // ── Application Comments ──────────────────────────────────────────────────────

  async listApplicationComments(applicationId: string, user: UserPayload | undefined) {
    if (!user) throw new ValidationError("Authentication required");
    const policy = await resolvePolicy(user);
    const app = await this.r.getApplicationById(applicationId);
    if (!app) throw new NotFoundError("Application not found");
    assertJobAccess(policy, app.job_id);
    const rows = await this.r.listApplicationComments(applicationId);
    // Private: author or org-wide recruiting roles (admin / hr / recruiter)
    return rows.filter((c: any) => {
      if (c.visibility === "public") return true;
      return c.author_id === user.id || policy.isOrgWideRecruit;
    });
  }

  async createApplicationComment(
    applicationId: string,
    body: string,
    visibility: string,
    attachments: unknown[],
    mentions: string[],
    user: UserPayload,
  ) {
    const app = await this.r.getApplicationById(applicationId);
    if (!app) throw new NotFoundError("Application not found");
    const policy = await resolvePolicy(user);
    assertJobAccess(policy, app.job_id);

    const comment = await this.r.createApplicationComment({
      applicationId,
      authorId: user.id,
      body,
      visibility,
      attachments,
      mentions,
    });
    void this.r.auditLog("application", applicationId, "COMMENT_ADDED", user.id, { visibility });

    // Fire-and-forget mention notifications
    if (mentions?.length) {
      this._notifyMentions(mentions, comment, app, user).catch(() => {});
    }

    emitRefreshAll();
    return comment;
  }

  async deleteApplicationComment(commentId: string, user: UserPayload) {
    await this.r.deleteApplicationComment(commentId, user.id);
    emitRefreshAll();
  }

  async getMentionableUsers(applicationId: string, user: UserPayload | undefined) {
    if (!user) throw new ValidationError("Authentication required");
    const policy = await resolvePolicy(user);
    const app = await this.r.getApplicationById(applicationId);
    if (!app) throw new NotFoundError("Application not found");
    assertJobAccess(policy, app.job_id);
    return this.r.getMentionableUsers(applicationId);
  }

  // ── Interview Feedback ────────────────────────────────────────────────────────

  /** Upcoming scheduled interview rounds visible to the current user. */
  async listScheduledInterviews(user: UserPayload | undefined, limitRaw?: number) {
    if (!user) throw new ValidationError("Authentication required");
    const policy = await resolvePolicy(user);
    const scopedJobIds = assignedJobFilter(policy);
    if (scopedJobIds && scopedJobIds.length === 0) return { interviews: [] as unknown[] };
    const limit = Math.min(50, Math.max(1, Number(limitRaw) || 25));
    const interviews = await this.r.listScheduledInterviews(scopedJobIds ?? undefined, limit);
    return { interviews };
  }

  /** Applications where the current user is an active interview panelist. */
  async listMyInterviewerAssignments(user: UserPayload | undefined, limitRaw?: number) {
    if (!user) throw new ValidationError("Authentication required");
    const emp = await this.r.getEmployeeByUserId(user.id);
    if (!emp?.id) return { assignments: [] as unknown[] };
    const limit = Math.min(50, Math.max(1, Number(limitRaw) || 30));
    const assignments = await this.r.listInterviewerAssignments(String(emp.id), limit);
    return { assignments };
  }

  /** List interview rounds for an application, each with per-interviewer feedback. */
  async getApplicationInterviews(applicationId: string, user: UserPayload | undefined) {
    if (!user) throw new ValidationError("Authentication required");
    const policy = await resolvePolicy(user);
    const app = await this.r.getApplicationById(applicationId);
    if (!app) throw new NotFoundError("Application not found");
    assertJobAccess(policy, app.job_id);

    const rounds = await this.r.getInterviewsForApplication(applicationId);
    const historyIds = rounds.map((r: any) => r.id as string);
    if (!historyIds.length) return [];

    const emp = await this.r.getEmployeeByUserId(user.id);
    const myEmployeeId = emp?.id ?? null;

    const allFeedback = await Promise.all(
      historyIds.map((hid) => this.r.getInterviewFeedbackForHistory(hid)),
    );
    const feedbackByHistory = new Map<string, any[]>();
    historyIds.forEach((hid, idx) => feedbackByHistory.set(hid, allFeedback[idx]));

    return rounds.map((round: any) => {
      const interviewerIds: string[] = round.interviewer_ids
        ? (Array.isArray(round.interviewer_ids) ? round.interviewer_ids : JSON.parse(String(round.interviewer_ids)))
        : [];
      const rawFeedback = feedbackByHistory.get(round.id) ?? [];
      return {
        ...round,
        interviewer_ids: interviewerIds,
        feedback: this.filterInterviewFeedbackForViewer(rawFeedback, interviewerIds, myEmployeeId, policy),
      };
    });
  }

  /**
   * Filter feedback rows by viewer:
   * - HR/recruiter/admin: all rows (including drafts for reminders)
   * - Panel interviewers: own row always; others only when submitted/no_show
   * - Others with job access: own row only
   */
  private filterInterviewFeedbackForViewer(
    rows: any[],
    interviewerIds: string[],
    myEmployeeId: string | null,
    policy: UserPolicy,
  ): any[] {
    if (policy.isOrgWideRecruit) return rows;
    const onPanel = !!(
      myEmployeeId && interviewerIds.some((id) => String(id) === String(myEmployeeId))
    );
    if (!myEmployeeId) return [];
    if (!onPanel) {
      return rows.filter((f) => String(f.reviewer_employee_id) === String(myEmployeeId));
    }
    return rows.filter((f) => {
      if (String(f.reviewer_employee_id) === String(myEmployeeId)) return true;
      return f.status === "submitted" || f.status === "no_show";
    });
  }

  /**
   * Get feedback for a round. HR/admin sees all; panel members see own + others' submitted.
   */
  async getInterviewFeedback(applicationId: string, historyId: string, user: UserPayload | undefined) {
    if (!user) throw new ValidationError("Authentication required");
    const policy = await resolvePolicy(user);
    const app = await this.r.getApplicationById(applicationId);
    if (!app) throw new NotFoundError("Application not found");
    assertJobAccess(policy, app.job_id);

    const rounds = await this.r.getInterviewsForApplication(applicationId);
    const round = rounds.find((r: any) => String(r.id) === String(historyId));
    if (!round) throw new NotFoundError("Interview round not found");

    const interviewerIds: string[] = round.interviewer_ids
      ? (Array.isArray(round.interviewer_ids) ? round.interviewer_ids : JSON.parse(String(round.interviewer_ids)))
      : [];

    const emp = await this.r.getEmployeeByUserId(user.id);
    const myEmployeeId = emp?.id ?? null;
    const rows = await this.r.getInterviewFeedbackForHistory(historyId);
    return this.filterInterviewFeedbackForViewer(rows, interviewerIds, myEmployeeId, policy);
  }

  /** Save draft or submit feedback for one reviewer. */
  async submitInterviewFeedback(
    applicationId: string,
    historyId: string,
    body: {
      status: "draft" | "submitted" | "no_show";
      overallRating?: number | null;
      overallComments?: string | null;
      scorecard?: unknown[];
    },
    user: UserPayload | undefined,
  ) {
    if (!user) throw new ValidationError("Authentication required");
    const emp = await this.r.getEmployeeByUserId(user.id);
    if (!emp) throw new ValidationError("Reviewer must be linked to an employee record");

    const app = await this.r.getApplicationById(applicationId);
    if (!app) throw new NotFoundError("Application not found");

    const submittedAt = body.status === "submitted" || body.status === "no_show" ? new Date() : null;
    const feedbackResult = await this.r.upsertInterviewFeedback({
      historyId,
      applicationId,
      reviewerEmployeeId: emp.id,
      reviewerName: `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || user.email,
      reviewerEmail: emp.work_email ?? user.email,
      status: body.status,
      overallRating: body.overallRating ?? null,
      overallComments: body.overallComments ?? null,
      scorecard: body.scorecard ?? [],
      submittedAt,
    });
    if (body.status === "submitted" || body.status === "no_show") {
      void this.r.auditLog("application", applicationId, "FEEDBACK_SUBMITTED", user.id, { historyId, status: body.status, rating: body.overallRating ?? null });
      emitRefreshAll();
    }
    return feedbackResult;
  }

  /** HR/recruiter sends a feedback reminder to all pending interviewers for a round. */
  async sendInterviewFeedbackReminder(
    applicationId: string,
    historyId: string,
    user: UserPayload | undefined,
  ) {
    if (!user) throw new ValidationError("Authentication required");
    const policy = await resolvePolicy(user);

    const app = await this.r.getApplicationById(applicationId);
    if (!app) throw new NotFoundError("Application not found");
    assertJobAccess(policy, app.job_id);

    // Mark reminder sent + get recipients (seed slots first if history has panelists but no feedback rows yet)
    let reminded = await this.r.markFeedbackReminderSent(historyId);
    if (!reminded.length) {
      const hist = await this.r.getApplicationStageHistoryById(historyId);
      if (hist?.application_id === applicationId && hist.interviewer_ids != null) {
        const raw = hist.interviewer_ids;
        let ids: string[] = [];
        if (Array.isArray(raw)) {
          ids = raw.filter((x): x is string => typeof x === "string" && String(x).trim().length > 0);
        } else if (typeof raw === "string") {
          try {
            const p = JSON.parse(raw);
            ids = Array.isArray(p)
              ? p.filter((x: unknown): x is string => typeof x === "string" && String(x).trim().length > 0)
              : [];
          } catch {
            ids = [];
          }
        }
        if (ids.length) {
          const merged = await mergeSchedulerIntoInterviewerIds(this.r, user.id, ids);
          await this.r.seedFeedbackSlotsForHistory(historyId, applicationId, merged);
          reminded = await this.r.markFeedbackReminderSent(historyId);
        }
      }
    }
    if (!reminded.length) return { sent: 0 };

    const candidateName = `${app.first_name ?? ""} ${app.last_name ?? ""}`.trim() || "the candidate";
    const appUrl = (resolvePublicAppUrlForTemplates() ?? "").replace(/\/$/, "");
    const { recruitmentApplicantDeepLink } = await import("../../../shared/notificationDeepLinks.js");
    const deepLink = `${appUrl}${recruitmentApplicantDeepLink(app.job_id, applicationId)}`;

    let sent = 0;
    for (const row of reminded) {
      if (!row.reviewer_email) continue;
      try {
        await notifyEmail(
          "recruit.interview_feedback_reminder",
          {
            reviewer_name: row.reviewer_name || row.reviewer_email,
            candidate_name: candidateName,
            app_url: deepLink,
            recipient_name: row.reviewer_name || row.reviewer_email,
            job_title: app.job_title ?? "",
          },
          [{ email: row.reviewer_email, name: row.reviewer_name || row.reviewer_email }],
        );
        sent++;
      } catch {
        // best-effort per recipient
      }
    }
    void this.r.auditLog("application", applicationId, "FEEDBACK_REMINDER_SENT", user.id, { historyId, sent });
    emitRefreshAll();
    return { sent };
  }

  // ─── Edit / Cancel / No-Show ─────────────────────────────────────────────────

  /**
   * Edit an existing interview round: change time, interviewers, or format.
   * Sends update notification emails to the candidate and all panel members.
   */
  async editInterview(
    applicationId: string,
    historyId: string,
    body: {
      scheduledWallDate?: string;
      scheduledWallTime?: string;
      scheduledWallTimeEnd?: string;
      ianaTimezone?: string;
      interviewerIds?: string[];
      format?: "onsite" | "teams";
      notes?: string;
      candidateSubject?: string;
      candidateBodyHtml?: string;
      panelSubject?: string;
      panelBodyHtml?: string;
    },
    userId: string,
    user?: UserPayload,
  ) {
    const app = await this.r.getApplicationById(applicationId);
    if (!app) throw new NotFoundError("Application not found");
    if (user && app.job_id) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, app.job_id);
    }

    const hist = await this.r.getInterviewHistoryById(historyId);
    if (!hist || hist.application_id !== applicationId) throw new NotFoundError("Interview not found");
    if (hist.cancelled_at) throw new ValidationError("Cannot edit a cancelled interview");

    const parsedSchedule = tryParseInterviewScheduleInstant({
      scheduledWallDate: body.scheduledWallDate,
      scheduledWallTime: body.scheduledWallTime,
      scheduledWallTimeEnd: body.scheduledWallTimeEnd,
      ianaTimezone: body.ianaTimezone,
    });
    if (parsedSchedule) {
      const editRangeErr = assertInterviewScheduleEndAfterStart(parsedSchedule);
      if (editRangeErr) throw new ValidationError(editRangeErr);
    }
    const scheduledAtIso = parsedSchedule ? parsedSchedule.start.toISOString() : null;

    const format = body.format === "teams" ? "teams" : body.format === "onsite" ? "onsite" : null;

    let interviewerIds: string[] | null = null;
    let interviewerNamesStr: string | null = null;
    if (Array.isArray(body.interviewerIds) && body.interviewerIds.length) {
      interviewerIds = body.interviewerIds.filter((x) => typeof x === "string" && x.trim()) as string[];
      interviewerIds = await mergeSchedulerIntoInterviewerIds(this.r, userId, interviewerIds);
      const nameMap = await this.r.batchResolveEmployeeNames(interviewerIds);
      interviewerNamesStr = interviewerIds.map((iid) => nameMap.get(iid) || iid).join(", ");
    }

    // Handle Teams meeting (re-create when format is teams or schedule changed)
    let joinUrl: string | null = hist.meeting_link ?? null;
    let eventId: string | null = hist.teams_event_id ?? null;
    const detail = await this.r.getApplicationStageDetail(applicationId);
    if (!detail?.candidate_email) throw new ValidationError("Candidate has no email address");

    const appRow = await this.r.getApplicationById(applicationId);
    const effectiveFormat = format ?? (hist.schedule_format as "teams" | "onsite" | null);
    const shouldRefreshCalendar = !!(parsedSchedule || format || interviewerIds);
    if (shouldRefreshCalendar && effectiveFormat) {
      const effectiveIds = interviewerIds ?? (Array.isArray(hist.interviewer_ids) ? (hist.interviewer_ids as string[]) : []);
      const panelEmails = await this.r.getInterviewerEmails(effectiveIds);
      const teamsAttendeeEmails = await ensureSchedulerEmailOnMeeting(this.r, userId, panelEmails);
      if (!teamsAttendeeEmails.length) throw new ValidationError("Interviewers must have work emails on file");
      const start = parsedSchedule?.start ?? (hist.scheduled_at ? new Date(hist.scheduled_at) : new Date());
      const end = parsedSchedule?.end ?? new Date(start.getTime() + 60 * 60 * 1000);
      const iana = parsedSchedule?.iana ?? resolveInterviewScheduleIana(body.ianaTimezone);
      const candidateName = `${detail.first_name} ${detail.last_name}`.trim();
      const calFormat = effectiveFormat === "teams" ? "teams" : "onsite";
      const calRound = Math.min(3, Math.max(1, Number(hist.interview_round ?? 1) || 1));
      const calStage = (hist.to_stage === "screening" ? "screening" : "interview") as "screening" | "interview";
      const calendarSubject = buildInterviewCalendarSubject({
        candidateName,
        jobTitle: detail.job_title || "Position",
        format: calFormat,
      });
      const calendarHtml = buildInterviewCalendarEventHtml(
        buildInterviewCalendarDetails({
          format: calFormat,
          pipelineStage: calStage,
          round: calRound,
          candidateName,
          jobTitle: detail.job_title || "Position",
          jobDepartment: appRow?.job_department,
          candidateEmail: detail.candidate_email,
          candidatePhone: appRow?.candidate_phone,
          applicationId,
          jobId: String(appRow?.job_id ?? ""),
          candidateId: String(appRow?.candidate_id ?? ""),
          interviewerNamesStr: interviewerNamesStr ?? hist.interviewer_names ?? "",
          location: (body as { location?: string }).location != null ? String((body as { location?: string }).location) : null,
          notes: body.notes != null ? String(body.notes) : undefined,
        }),
      );
      const editLocation =
        (body as { location?: string }).location != null ? String((body as { location?: string }).location).trim() : null;
      const schedulerEmailLower = await resolveSchedulerEmailLower(this.r, userId);
      try {
        const calendarResult = await createInterviewOutlookEvent({
          format: calFormat,
          start,
          end,
          iana,
          userId,
          attendeeEmails: teamsAttendeeEmails,
          candidateEmail: detail.candidate_email,
          calendarHtml,
          subject: calendarSubject,
          locationPlain: calFormat === "onsite" ? editLocation : null,
          schedulerEmailLower,
        });
        if (calendarResult.eventId) {
          if (calFormat === "teams") {
            joinUrl = calendarResult.joinUrl ?? joinUrl;
          } else {
            joinUrl = null;
          }
          eventId = calendarResult.eventId;
        } else if (calendarResult.error) {
          console.warn("[recruitment] Interview edit calendar refresh skipped:", calendarResult.error);
        }
      } catch {
        /* keep prior meeting link / event */
      }
    } else if (format === "onsite") {
      joinUrl = null;
      eventId = null;
    }

    await this.r.updateInterviewHistoryRow(historyId, {
      scheduledAt: scheduledAtIso,
      scheduledAtEnd: parsedSchedule ? parsedSchedule.end.toISOString() : undefined,
      interviewerIds,
      interviewerNames: interviewerNamesStr,
      scheduleFormat: format,
      meetingLink: joinUrl,
      teamsEventId: eventId,
      notes: body.notes != null ? String(body.notes) : undefined,
    });

    // Reseed feedback slots for any new interviewers
    if (interviewerIds?.length) {
      await this.r.seedFeedbackSlotsForHistory(historyId, applicationId, interviewerIds);
    }

    void this.r.auditLog("application", applicationId, "INTERVIEW_EDITED", userId, { historyId, scheduledAt: scheduledAtIso, format });

    // Always notify candidate + panel (templates when custom body omitted)
    if (isEmailConfigured()) {
      const effectiveIds = interviewerIds ?? (Array.isArray(hist.interviewer_ids) ? (hist.interviewer_ids as string[]) : []);
      const updatedHist = await this.r.getInterviewHistoryById(historyId);
      const start =
        parsedSchedule?.start ??
        (updatedHist?.scheduled_at ? new Date(updatedHist.scheduled_at) : hist.scheduled_at ? new Date(hist.scheduled_at) : null);
      const end =
        parsedSchedule?.end ??
        (start ? new Date(start.getTime() + 60 * 60 * 1000) : null);
      const iana = parsedSchedule?.iana ?? resolveInterviewScheduleIana(body.ianaTimezone);
      const finalFormat = effectiveFormat === "teams" ? "teams" : "onsite";
      const finalJoinUrl = joinUrl ?? updatedHist?.meeting_link ?? hist.meeting_link ?? null;
      const pipelineStage = (updatedHist?.to_stage ?? hist.to_stage) === "screening" ? "screening" : "interview";
      const roundNum = Math.min(3, Math.max(1, Number(updatedHist?.interview_round ?? hist.interview_round ?? 1) || 1));
      const pipelineLabel = pipelineStage === "screening" ? "Screening" : "Interview";
      const candidateName = `${detail.first_name} ${detail.last_name}`.trim();
      const jobTitle = detail.job_title || "Position";
      const namesForCtx =
        interviewerNamesStr ??
        (typeof updatedHist?.interviewer_names === "string" ? updatedHist.interviewer_names : hist.interviewer_names) ??
        "";

      let candidateSubject = String(body.candidateSubject ?? "").trim();
      let candidateBodyHtml = String(body.candidateBodyHtml ?? "").trim();
      let panelSubject = String(body.panelSubject ?? "").trim();
      let panelBodyHtml = String(body.panelBodyHtml ?? "").trim();

      if (start && end && (!candidateSubject || !candidateBodyHtml || !panelSubject || !panelBodyHtml)) {
        const teamsJoinPreview =
          finalFormat === "teams" && finalJoinUrl
            ? `<p style="margin:16px 0 0;text-align:center">${emailCtaButtonHtml(finalJoinUrl, "Join Microsoft Teams", { backgroundColor: "#5059c9" })}</p>`
            : finalFormat === "teams"
              ? `<p style="text-align:center;margin:10px 0 0;font-size:12px;color:#64748b"><em>Teams link will appear when the meeting is ready.</em></p>`
              : "";
        const appUrl = (resolvePublicAppUrlForTemplates() ?? "").replace(/\/$/, "");
        const baseCtx: NotifyContext = {
          candidate_name: candidateName,
          job_title: jobTitle,
          pipeline_stage: pipelineLabel,
          round: String(roundNum),
          ...buildInterviewScheduleTimeFields(start, end, iana),
          interview_format: finalFormat === "teams" ? "Microsoft Teams" : "Onsite",
          teams_join_link: teamsJoinPreview,
          interview_notes: body.notes != null ? String(body.notes).trim() : (updatedHist?.notes ?? hist.notes ?? "") || "",
          interviewers_list: namesForCtx,
          application_id: applicationId,
          job_id: String(app.job_id ?? ""),
          app_url: appUrl,
        };
        const updateBanner =
          '<p style="margin:0 0 14px;padding:10px 12px;background:#eff6ff;border-left:4px solid #3b82f6;color:#1e40af"><strong>This interview has been updated.</strong> Please see the revised details below.</p>';
        const [candTpl, panelTpl] = await Promise.all([
          getRenderedNotificationTemplate("recruit.interview_invite_candidate", baseCtx),
          getRenderedNotificationTemplate("recruit.interview_invite_panel", { ...baseCtx, recipient_name: "Team" }),
        ]);
        if (!candidateSubject) {
          candidateSubject = candTpl?.subject?.trim()
            ? `Updated: ${candTpl.subject}`
            : `Updated interview – ${jobTitle}`;
        }
        if (!candidateBodyHtml) {
          candidateBodyHtml = updateBanner + (candTpl?.body?.trim() || `<p>Your ${pipelineLabel.toLowerCase()} schedule has been updated.</p>`);
        }
        if (!panelSubject) {
          panelSubject = panelTpl?.subject?.trim()
            ? `Updated: ${panelTpl.subject}`
            : `Updated interview – ${candidateName} (${jobTitle})`;
        }
        if (!panelBodyHtml) {
          panelBodyHtml = updateBanner + (panelTpl?.body?.trim() || `<p>Interview schedule updated for ${escapeHtmlForEmail(candidateName)}.</p>`);
        }
      }

      if (candidateSubject && candidateBodyHtml && panelSubject && panelBodyHtml) {
        let ivEmails = effectiveIds.length ? await this.r.getInterviewerEmails(effectiveIds) : [];
        const recruiterEmail = await this.r.getUserEmail(userId);
        ivEmails = await ensureSchedulerEmailOnMeeting(this.r, userId, ivEmails);

        const teamsBlock =
          finalFormat === "teams" && finalJoinUrl
            ? `<p style="margin:16px 0 0;text-align:center">${emailCtaButtonHtml(finalJoinUrl, "Join Microsoft Teams", { backgroundColor: "#5059c9" })}</p>`
            : "";

        const appUrlForEmail = (resolvePublicAppUrlForTemplates() ?? "").replace(/\/$/, "");
        const injectedCandHtml = injectTeamsLinkPlaceholders(
          injectInterviewScheduleEmailPlaceholders(candidateBodyHtml, appUrlForEmail, applicationId, String(app.job_id ?? "")),
          teamsBlock,
        );
        const injectedPanelHtml = injectTeamsLinkPlaceholders(
          injectInterviewScheduleEmailPlaceholders(panelBodyHtml, appUrlForEmail, applicationId, String(app.job_id ?? "")),
          teamsBlock,
        );

        const fromAddr =
          resolveNotificationFromAddress("recruit.interview_invite_candidate") ||
          (process.env.EMAIL_FROM ?? "").trim() ||
          "Recruitment <careers@hr.ldplogistics.com>";
        const inboundDomain = (process.env.EMAIL_INBOUND_REPLY_DOMAIN ?? "").trim();
        const useCleanReplyTo = process.env.EMAIL_REPLY_TO_CLEAN === "true";
        const replyToAddress = useCleanReplyTo ? fromAddr : inboundDomain ? `reply+${applicationId}@${inboundDomain}` : fromAddr;

        const candHtml = await wrapInEmailFrame(injectedCandHtml, candidateSubject, "recruit.interview_invite_candidate");
        const panelHtml = await wrapInEmailFrame(injectedPanelHtml, panelSubject, "recruit.interview_invite_panel");

        const candSend = await sendEmail({
          from: fromAddr,
          to: detail.candidate_email,
          subject: candidateSubject,
          html: candHtml,
          text: htmlToPlainText(injectedCandHtml) || candidateSubject,
          replyTo: replyToAddress,
        });
        if (!candSend.ok) {
          throw new ValidationError(`Candidate email failed: ${(candSend as { message?: string }).message || "unknown"}`);
        }

        if (ivEmails.length) {
          const panelTo = ivEmails[0];
          const panelCc = [
            ...ivEmails.slice(1),
            ...(recruiterEmail && !ivEmails.includes(recruiterEmail) ? [recruiterEmail] : []),
          ].filter(Boolean);
          const panelSend = await sendEmail({
            from: fromAddr,
            to: panelTo,
            cc: panelCc.length ? panelCc : undefined,
            subject: panelSubject,
            html: panelHtml,
            text: htmlToPlainText(injectedPanelHtml) || panelSubject,
            replyTo: replyToAddress,
          });
          if (!panelSend.ok) {
            throw new ValidationError(`Panel email failed: ${(panelSend as { message?: string }).message || "unknown"}`);
          }
        }
      }
    }

    emitRefreshAll();
    return { ok: true, emailsSent: isEmailConfigured() };
  }

  /** Cancel an upcoming interview and optionally notify participants. */
  async cancelInterview(
    applicationId: string,
    historyId: string,
    userId: string,
    user?: UserPayload,
  ) {
    const app = await this.r.getApplicationById(applicationId);
    if (!app) throw new NotFoundError("Application not found");
    if (user && app.job_id) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, app.job_id);
    }

    const hist = await this.r.getInterviewHistoryById(historyId);
    if (!hist || hist.application_id !== applicationId) throw new NotFoundError("Interview not found");
    if (hist.cancelled_at) throw new ValidationError("Interview is already cancelled");

    const row = await this.r.cancelInterviewHistory(historyId);
    if (!row) throw new ValidationError("Could not cancel interview");

    void this.r.auditLog("application", applicationId, "INTERVIEW_CANCELLED", userId, { historyId });

    // Send cancellation notification emails (best-effort)
    if (isEmailConfigured()) {
      const detail = await this.r.getApplicationStageDetail(applicationId);
      if (detail?.candidate_email) {
        const fromAddr = resolveNotificationFromAddress("recruit.interview_invite_candidate") || (process.env.EMAIL_FROM ?? "").trim() || "Recruitment <careers@hr.ldplogistics.com>";
        const candidateName = `${detail.first_name} ${detail.last_name}`.trim();
        const jobTitle = detail.job_title || "Position";
        const cancelTz = process.env.DEFAULT_TIMEZONE?.trim() || "Asia/Karachi";
        const scheduledStr = hist.scheduled_at
          ? formatLeaveAppliedAt(new Date(hist.scheduled_at), cancelTz)
          : "";
        const subject = `Interview Cancelled – ${jobTitle}`;
        const bodyHtml = `<p>Dear ${escapeHtmlForEmail(candidateName)},</p><p>We regret to inform you that your scheduled interview${scheduledStr ? ` on <strong>${scheduledStr}</strong>` : ""} for <strong>${escapeHtmlForEmail(jobTitle)}</strong> has been cancelled. Our team will be in touch to reschedule if applicable.</p><p>Apologies for any inconvenience.</p>`;
        const candHtml = await wrapInEmailFrame(bodyHtml, subject, "recruit.interview_invite_candidate");
        try { await sendEmail({ from: fromAddr, to: detail.candidate_email, subject, html: candHtml, text: `Interview Cancelled: ${jobTitle}${scheduledStr ? " on " + scheduledStr : ""}. Our team will be in touch.` }); } catch { /* non-fatal */ }

        const effectiveIds = Array.isArray(hist.interviewer_ids) ? (hist.interviewer_ids as string[]) : [];
        if (effectiveIds.length) {
          let ivEmails = await this.r.getInterviewerEmails(effectiveIds);
          ivEmails = await ensureSchedulerEmailOnMeeting(this.r, userId, ivEmails);
          const panelSubj = `Interview Cancelled – ${candidateName} (${jobTitle})`;
          const panelBody = `<p>The interview scheduled${scheduledStr ? ` on <strong>${scheduledStr}</strong>` : ""} for <strong>${escapeHtmlForEmail(candidateName)}</strong> (${escapeHtmlForEmail(jobTitle)}) has been cancelled.</p>`;
          const panelHtml = await wrapInEmailFrame(panelBody, panelSubj, "recruit.interview_invite_panel");
          if (ivEmails.length) {
            try { await sendEmail({ from: fromAddr, to: ivEmails[0], cc: ivEmails.slice(1).length ? ivEmails.slice(1) : undefined, subject: panelSubj, html: panelHtml, text: `Interview cancelled: ${candidateName} – ${jobTitle}` }); } catch { /* non-fatal */ }
          }
        }
      }
    }

    emitRefreshAll();
    return { ok: true };
  }

  /** Mark all panelists as no-show for a past interview. */
  async markInterviewNoShow(
    applicationId: string,
    historyId: string,
    userId: string,
    user?: UserPayload,
  ) {
    const app = await this.r.getApplicationById(applicationId);
    if (!app) throw new NotFoundError("Application not found");
    if (user && app.job_id) {
      const policy = await resolvePolicy(user);
      assertJobAccess(policy, app.job_id);
    }

    const hist = await this.r.getInterviewHistoryById(historyId);
    if (!hist || hist.application_id !== applicationId) throw new NotFoundError("Interview not found");
    if (hist.cancelled_at) throw new ValidationError("Cannot mark a cancelled interview as no-show");

    const row = await this.r.markInterviewNoShow(historyId, applicationId);
    if (!row) {
      // might already be marked; return ok
    }
    void this.r.auditLog("application", applicationId, "INTERVIEW_NO_SHOW", userId, { historyId });
    emitRefreshAll();
    return { ok: true };
  }

  /** Upload test report to SharePoint and update the feedback row. */
  async uploadInterviewTestReport(
    applicationId: string,
    historyId: string,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    user: UserPayload | undefined,
  ) {
    if (!user) throw new ValidationError("Authentication required");
    const emp = await this.r.getEmployeeByUserId(user.id);
    if (!emp) throw new ValidationError("Reviewer must be linked to an employee record");

    const app = await this.r.getApplicationById(applicationId);
    if (!app) throw new NotFoundError("Application not found");

    let url: string;
    if (isSharePointAvatarConfigured()) {
      const spUrl = await uploadFileToSharePoint(
        "Recruitment/TestReports",
        fileName,
        fileBuffer,
        mimeType,
      );
      if (!spUrl) throw new Error("SharePoint upload failed");
      url = spUrl;
    } else {
      // Fall back to data URL when SharePoint is not configured
      url = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
    }

    // Upsert/update the feedback row for this reviewer
    const existing = await this.r.getInterviewFeedbackForReviewer(historyId, emp.id);
    if (existing) {
      await this.r.updateFeedbackTestReport(existing.id, url, fileName);
    } else {
      await this.r.upsertInterviewFeedback({
        historyId,
        applicationId,
        reviewerEmployeeId: emp.id,
        reviewerName: `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || user.email,
        reviewerEmail: emp.work_email ?? user.email,
        status: "draft",
        scorecard: [],
        testReportUrl: url,
        testReportFilename: fileName,
        submittedAt: null,
      });
    }
    emitRefreshAll();
    return { url, filename: fileName };
  }

  private async _notifyMentions(
    mentionedIds: string[],
    comment: any,
    app: any,
    author: UserPayload,
  ) {
    for (const uid of mentionedIds) {
      try {
        const target = await this.r.getUserEmailById(uid);
        if (!target?.email) continue;
        const authorName = author.email;
        const snippet = (comment.body as string).replace(/<[^>]+>/g, "").slice(0, 200);
        await notifyEmail(
          "recruitment.comment_mention",
          {
            mentionedName: target.first_name || target.email,
            authorName,
            candidateName: `${app.first_name ?? ""} ${app.last_name ?? ""}`.trim() || "an applicant",
            commentSnippet: snippet,
            appUrl: resolvePublicAppUrlForTemplates(),
            application_id: String(app.id ?? ""),
            job_id: String(app.job_id ?? ""),
          },
          [{ email: target.email, name: target.first_name || target.email }],
        );
      } catch {
        // best-effort
      }
    }
  }
}

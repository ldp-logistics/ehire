/**
 * Central scope resolver — single source of truth for per-user permissions.
 *
 * Call once per request (or cache on req) to get:
 *   assignedJobIds  — jobs limited_recruiter / hiring_manager may act on
 *   hrScopes        — dept/office values limited_hr is restricted to
 *   isOrgWideHR     — true for admin/hr/recruiter (no per-row filter needed)
 *   isOrgWideRecruit— true for admin/hr/recruiter
 */

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import type { UserPayload } from "../middleware/auth.js";

config();
const sql = neon(process.env.DATABASE_URL!);

/**
 * Jobs where this user still has interviewer work (pending feedback or open scheduled round).
 * Historical / completed interviews do not grant access.
 */
export async function getInterviewPanelistJobIds(userId: string): Promise<string[]> {
  const rows = await sql`
    SELECT DISTINCT a.job_id AS job_id
    FROM users u
    INNER JOIN interview_feedback f ON f.reviewer_employee_id = u.employee_id
    INNER JOIN application_stage_history h ON h.id = f.history_id
    INNER JOIN applications a ON a.id = f.application_id
    WHERE u.id = ${userId}
      AND u.employee_id IS NOT NULL
      AND f.status IN ('pending', 'draft')
      AND h.cancelled_at IS NULL
      AND h.no_show_at IS NULL
      AND a.stage NOT IN ('rejected', 'hired')
    UNION
    SELECT DISTINCT a.job_id
    FROM users u
    INNER JOIN application_stage_history h ON h.interviewer_ids @> to_jsonb(ARRAY[u.employee_id]::text[])
    INNER JOIN applications a ON a.id = h.application_id
    WHERE u.id = ${userId}
      AND u.employee_id IS NOT NULL
      AND h.to_stage IN ('screening', 'interview')
      AND h.cancelled_at IS NULL
      AND h.no_show_at IS NULL
      AND a.stage NOT IN ('rejected', 'hired')
      AND NOT EXISTS (
        SELECT 1 FROM interview_feedback f
        WHERE f.history_id = h.id
          AND f.reviewer_employee_id = u.employee_id
          AND f.status IN ('submitted', 'no_show')
      )
  ` as Array<{ job_id: string }>;
  return Array.from(new Set(rows.map((r) => String(r.job_id || "").trim()).filter(Boolean)));
}

/** True when the user is a panelist with at least one open interview duty (nav + scoped recruit access). */
export async function hasActiveInterviewDuties(userId: string): Promise<boolean> {
  const jobs = await getInterviewPanelistJobIds(userId);
  return jobs.length > 0;
}

export interface UserPolicy {
  isOrgWideHR: boolean;
  isOrgWideRecruit: boolean;
  /** null = org-wide (no filter needed); string[] = job ids the user may act on */
  assignedJobIds: string[] | null;
  /** null = org-wide; {scope_type, scope_value}[] = allowed scopes */
  hrScopes: Array<{ scope_type: string; scope_value: string }> | null;
}

function rolesSet(user: UserPayload): Set<string> {
  return new Set<string>([user.role, ...(user.roles ?? [])]);
}

export async function resolvePolicy(user: UserPayload): Promise<UserPolicy> {
  const rs = rolesSet(user);

  const isAdmin      = rs.has("admin");
  const isHR         = rs.has("hr");
  const isRecruiter  = rs.has("recruiter");
  const isLimitedHR  = rs.has("limited_hr") && !isHR && !isAdmin;
  const isLimRec     = rs.has("limited_recruiter") && !isRecruiter && !isHR && !isAdmin;
  // Manager is treated as assigned-job recruiter scope (recommended policy).
  const isHM         = (rs.has("hiring_manager") || rs.has("manager")) && !isRecruiter && !isHR && !isAdmin;

  const isOrgWideHR      = isAdmin || isHR;
  const isOrgWideRecruit = isAdmin || isHR || isRecruiter;

  // Fetch assigned job ids for limited_recruiter / hiring_manager
  let assignedJobIds: string[] | null = null;
  if (!isOrgWideRecruit && (isLimRec || isHM)) {
    const role = isHM ? "hiring_manager" : "limited_recruiter";
    const rows = await sql`
      SELECT job_id FROM job_assignments
      WHERE user_id = ${user.id}
        AND role = ${role}
    ` as Array<{ job_id: string }>;
    assignedJobIds = rows.map((r) => r.job_id);
  }

  if (!isOrgWideRecruit) {
    const panelJobs = await getInterviewPanelistJobIds(user.id);
    // Limited recruiters and hiring managers must see only rows in job_assignments for their role.
    // Do not expand scope with "interviewer on another job" — that path is for employee interviewers only.
    const mergePanelistJobs = !isLimRec && !isHM;
    if (panelJobs.length && mergePanelistJobs) {
      assignedJobIds = Array.from(new Set([...(assignedJobIds ?? []), ...panelJobs]));
    } else if (assignedJobIds === null && !isLimitedHR) {
      // Tighten default: users without job-assignment scope cannot browse arbitrary jobs.
      // limited_hr keeps null (separate HR scope); interview-only employees get [] until assigned as panelists.
      assignedJobIds = [];
    }
  }

  // Fetch hr scopes for limited_hr
  let hrScopes: Array<{ scope_type: string; scope_value: string }> | null = null;
  if (!isOrgWideHR && isLimitedHR) {
    const rows = await sql`
      SELECT scope_type, scope_value FROM user_scopes
      WHERE user_id = ${user.id}
    ` as Array<{ scope_type: string; scope_value: string }>;
    hrScopes = rows;
  }

  return { isOrgWideHR, isOrgWideRecruit, assignedJobIds, hrScopes };
}

/**
 * Throw a 403 ForbiddenError if the job is not in the user's assigned list.
 * No-op for org-wide recruiters / admins / hr.
 */
export function assertJobAccess(policy: UserPolicy, jobId: string): void {
  if (policy.isOrgWideRecruit) return;
  if (policy.assignedJobIds === null) return;
  if (!policy.assignedJobIds.includes(jobId)) {
    const err = new Error("You do not have access to this job.");
    (err as any).statusCode = 403;
    throw err;
  }
}

/**
 * Returns a SQL snippet string for WHERE clauses that filters by assigned jobs.
 * Caller injects the job_id column name.
 * Returns null when no filter is needed (org-wide).
 */
export function assignedJobFilter(policy: UserPolicy): string[] | null {
  if (policy.isOrgWideRecruit) return null;
  if (policy.assignedJobIds === null) return null;
  return policy.assignedJobIds;
}

/**
 * Throw a 403 ForbiddenError if an employee's department/office is not in scope.
 * scopes expected as: [ {scope_type:"department",scope_value:"Finance"}, ... ]
 */
export function assertHRScope(
  policy: UserPolicy,
  empDepartment: string | null,
  empLocation: string | null,
): void {
  if (policy.isOrgWideHR) return;
  if (policy.hrScopes === null) return; // org-wide fallback
  for (const s of policy.hrScopes) {
    if (s.scope_type === "department" && s.scope_value === empDepartment) return;
    if (s.scope_type === "office" && s.scope_value === empLocation) return;
  }
  const err = new Error("You do not have HR access to this employee.");
  (err as any).statusCode = 403;
  throw err;
}

/**
 * Given hrScopes, build department/location lists for SQL WHERE IN filtering.
 * Returns null when no filter is needed (org-wide).
 */
export function hrScopeFilter(policy: UserPolicy): { departments: string[]; offices: string[] } | null {
  if (policy.isOrgWideHR) return null;
  if (policy.hrScopes === null) return null;
  const departments: string[] = [];
  const offices: string[] = [];
  for (const s of policy.hrScopes) {
    if (s.scope_type === "department") departments.push(s.scope_value);
    if (s.scope_type === "office") offices.push(s.scope_value);
  }
  return { departments, offices };
}

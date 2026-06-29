/**
 * FreshTeam API client for job postings.
 * Used by POST /api/recruitment/migrate-freshteam-jobs.
 * Requires FRESHTEAM_DOMAIN and FRESHTEAM_API_KEY in .env.
 */

const getBaseUrl = (): string => {
  const domain = process.env.FRESHTEAM_DOMAIN?.trim();
  if (!domain) throw new Error("FRESHTEAM_DOMAIN is not set");
  return `https://${domain}.freshteam.com/api`;
};

/** Origin for resume/download URLs (no /api suffix). Used when API returns a relative path. */
export function getFreshTeamOrigin(): string {
  const domain = process.env.FRESHTEAM_DOMAIN?.trim();
  if (!domain) return "";
  return `https://${domain}.freshteam.com`;
}

const getAuthHeader = (): string => {
  const key = process.env.FRESHTEAM_API_KEY?.trim();
  if (!key) throw new Error("FRESHTEAM_API_KEY is not set");
  return `Bearer ${key}`;
};

/** Returns true if FRESHTEAM_DOMAIN and FRESHTEAM_API_KEY are set (for migration endpoint). */
export function isFreshTeamConfigured(): boolean {
  return Boolean(
    process.env.FRESHTEAM_DOMAIN?.trim() && process.env.FRESHTEAM_API_KEY?.trim()
  );
}

/**
 * Lowercased work-email keys used to match FreshTeam ↔ our DB when the domain differs
 * (e.g. FT has @ldplogistic.com, we store @ldplogistics.com). Optional override:
 * `FRESHTEAM_EMAIL_DOMAIN_EQUIVALENTS=ldplogistic.com|ldplogistics.com` (two domains, one pair).
 */
export function freshteamWorkEmailMatchKeys(email: string): string[] {
  const base = email.trim().toLowerCase().replace(/\s+/g, "");
  if (!base) return [];
  const out = new Set<string>([base]);
  const at = base.lastIndexOf("@");
  if (at <= 0 || at === base.length - 1) return Array.from(out);
  const local = base.slice(0, at);
  const domain = base.slice(at + 1);
  let a = "ldplogistic.com";
  let b = "ldplogistics.com";
  const raw = process.env.FRESHTEAM_EMAIL_DOMAIN_EQUIVALENTS?.trim();
  if (raw) {
    const parts = raw.split("|").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (parts.length === 2) {
      a = parts[0];
      b = parts[1];
    }
  }
  if (domain === a) out.add(`${local}@${b}`);
  else if (domain === b) out.add(`${local}@${a}`);
  return Array.from(out);
}

/** True if two addresses match for FreshTeam sync (including domain equivalents). */
export function freshteamWorkEmailsMatch(a: string, b: string): boolean {
  const sb = new Set(freshteamWorkEmailMatchKeys(b));
  return freshteamWorkEmailMatchKeys(a).some((k) => sb.has(k));
}

export type FreshTeamJobSummary = {
  id: number;
  title?: string;
  status?: string;
  [k: string]: unknown;
};

export type FreshTeamJobDetail = {
  id: number;
  title: string;
  description?: string;
  status?: string; // FreshTeam: draft | published | internal | private | on_hold | closed
  type?: string; // Employment: Full Time, Part Time, Contract, Internship, etc.
  experience?: string; // e.g. Entry Level, Mid-Senior level
  remote?: boolean;
  closing_date?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted?: boolean; // when true, skip in migration
  salary?: { min?: number; max?: number; currency?: string };
  branch?: {
    id?: number;
    name?: string;
    city?: string;
    state?: string;
    country_code?: string;
    zip?: string;
    street?: string;
    [k: string]: unknown;
  } | null;
  department?: { id?: number; name?: string } | null;
  requisitions?: Array<{
    id?: number;
    title?: string;
    recruiters?: Array<{ id?: number; first_name?: string; last_name?: string; official_email?: string }>;
    hiring_managers?: Array<{ id?: number; first_name?: string; last_name?: string; official_email?: string }>;
    [k: string]: unknown;
  }>;
  [k: string]: unknown;
};

/** FreshTeam statuses treated as live/published postings for incremental job migration. */
export function isFreshTeamJobPublishedStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "open" || s === "published";
}

/** Map FreshTeam job status to HRMS job_postings.status. */
export function mapFreshTeamJobStatusToHrms(
  ftStatus: string | null | undefined
): "published" | "archived" | "closed" {
  const s = (ftStatus ?? "").trim().toLowerCase();
  if (isFreshTeamJobPublishedStatus(s)) return "published";
  if (s === "archived") return "archived";
  return "closed";
}

/** Build location string from FT job branch (matches legacy migration 0124 hints). */
export function formatFreshTeamJobLocation(job: Record<string, unknown>): string | null {
  const direct = job.location;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const branch = job.branch as
    | { name?: string; city?: string; state?: string; country_code?: string; street?: string }
    | null
    | undefined;
  if (!branch || typeof branch !== "object") return null;
  const parts = [branch.name, branch.city, branch.state, branch.country_code, branch.street]
    .filter(Boolean)
    .map((p) => String(p).trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Derive HRMS region_code from job location (same rules as migration 0124/0128). */
export function inferRegionCodeFromJobLocation(location: string | null | undefined): string {
  const loc = (location ?? "").toLowerCase();
  if (!loc) return "PK";
  if (loc.includes("ashok vihar")) return "IN-N";
  if (
    loc.includes("moti nagar") ||
    loc.includes("india remote") ||
    (loc.includes("new delhi") && !loc.includes("ashok vihar"))
  ) {
    return "IN-S";
  }
  if (
    loc.includes("washington") ||
    loc.includes("sayreville") ||
    loc.includes("us remote") ||
    loc.includes("us nj")
  ) {
    return "US";
  }
  if (loc.includes("karachi") || loc.includes("pakistan") || loc.includes("uae remote")) return "PK";
  return "PK";
}

/** FT `requisitions` is an array — never pass it raw to integer headcount. */
export function headcountFromFreshTeamJob(job: Record<string, unknown>): number {
  const hc = job.head_count;
  if (typeof hc === "number" && Number.isFinite(hc) && hc > 0) return Math.floor(hc);
  if (typeof hc === "string" && hc.trim()) {
    const n = parseInt(hc, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const reqs = job.requisitions;
  if (Array.isArray(reqs) && reqs.length > 0) {
    let sum = 0;
    for (const r of reqs) {
      if (!r || typeof r !== "object") continue;
      const row = r as Record<string, unknown>;
      const c = row.count ?? row.head_count ?? row.quantity;
      if (typeof c === "number" && c > 0) sum += Math.floor(c);
      else if (typeof c === "string" && c.trim()) {
        const n = parseInt(c, 10);
        if (Number.isFinite(n) && n > 0) sum += n;
        else sum += 1;
      } else sum += 1;
    }
    return sum > 0 ? sum : reqs.length;
  }
  return 1;
}

/** Collect recruiter / hiring-manager emails from job detail + requisitions. */
export function recruiterEmailsFromFreshTeamJob(job: Record<string, unknown>): string[] {
  const emails = new Set<string>();
  const add = (e: unknown) => {
    if (typeof e === "string" && e.trim()) emails.add(e.trim());
  };
  const recruiter = job.recruiter as { email?: string } | undefined;
  const hm = job.hiringManager as { email?: string } | undefined;
  add(recruiter?.email);
  add(hm?.email);
  const reqs = job.requisitions;
  if (Array.isArray(reqs)) {
    for (const r of reqs) {
      if (!r || typeof r !== "object") continue;
      const row = r as Record<string, unknown>;
      for (const list of [row.recruiters, row.hiring_managers]) {
        if (!Array.isArray(list)) continue;
        for (const person of list) {
          if (!person || typeof person !== "object") continue;
          const p = person as { official_email?: string; email?: string };
          add(p.official_email);
          add(p.email);
        }
      }
    }
  }
  return Array.from(emails);
}

export type FreshTeamJobAudit = {
  createdAt: Date | null;
  updatedAt: Date | null;
  /** Recruiter / hiring-manager emails from requisitions (FT has no created_by user id). */
  ownerEmails: string[];
};

/** Parse FT job created/updated timestamps and owner emails for HRMS audit columns. */
export function parseFreshTeamJobAudit(job: Record<string, unknown>): FreshTeamJobAudit {
  const parseTs = (v: unknown): Date | null => {
    if (typeof v !== "string" || !v.trim()) return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  };
  return {
    createdAt: parseTs(job.created_at),
    updatedAt: parseTs(job.updated_at),
    ownerEmails: recruiterEmailsFromFreshTeamJob(job),
  };
}

const DEFAULT_PER_PAGE = 30;

/** Delay in ms (for rate limiting). Export for use in migration loop. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FRESHTEAM_MAX_RETRIES_429 = 5;
/** On 429, wait for next minute (rate limit window). Use Retry-After header if present. */
function getWaitMs429(res: Response): number {
  const retryAfter = res.headers.get("Retry-After");
  if (retryAfter) {
    const sec = parseInt(retryAfter, 10);
    if (Number.isFinite(sec)) return sec * 1000;
  }
  return 60000; // 1 minute - wait for next rate limit window
}

async function freshteamRequest(path: string, opts?: RequestInit, retryCount = 0): Promise<Response> {
  const base = getBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
      ...opts?.headers,
    },
  });
  if (res.status === 429 && retryCount < FRESHTEAM_MAX_RETRIES_429) {
    const waitMs = getWaitMs429(res);
    await sleep(waitMs);
    return freshteamRequest(path, opts, retryCount + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FreshTeam API ${res.status}: ${text || res.statusText}`);
  }
  const remaining = res.headers.get("x-ratelimit-remaining");
  if (remaining !== null) {
    const n = parseInt(remaining, 10);
    if (Number.isFinite(n) && n <= 2) await sleep(60000);
  }
  return res;
}

async function freshteamFetch<T>(path: string, opts?: RequestInit, retryCount = 0): Promise<T> {
  const res = await freshteamRequest(path, opts, retryCount);
  return res.json() as Promise<T>;
}

export type FreshteamListMeta = {
  page: number;
  totalPages: number | null;
  totalObjects: number | null;
};

function parseFreshteamListMeta(res: Response, page: number): FreshteamListMeta {
  const tp = res.headers.get("total-pages");
  const to = res.headers.get("total-objects");
  const totalPages = tp != null && tp !== "" ? parseInt(tp, 10) : null;
  const totalObjects = to != null && to !== "" ? parseInt(to, 10) : null;
  return {
    page,
    totalPages: Number.isFinite(totalPages) ? totalPages : null,
    totalObjects: Number.isFinite(totalObjects) ? totalObjects : null,
  };
}

/** Applicant statuses accepted by FreshTeam list filters (see ApplicantListQuery). */
export const FRESHTEAM_APPLICANT_STATUSES = [
  "open",
  "on_hold",
  "rejected",
  "archived",
  "moved",
  "dropped",
] as const;

/** Placeholder email when FT candidate has no email (unique per FT candidate/applicant id). */
export function freshteamMigrationPlaceholderEmail(candidateId: number | null, applicantId: number): string {
  const key = candidateId != null ? `c${candidateId}` : `a${applicantId}`;
  return `ft-${key}@no-email.freshteam.migrated`;
}

/** Requests per minute (Trial=10, Growth/Pro=50, Enterprise=60). Used for migration throttle. Stay under your limit. */
export function getFreshTeamRequestsPerMinute(): number {
  const n = parseInt(process.env.FRESHTEAM_REQUESTS_PER_MINUTE ?? "55", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 100) : 55;
}

/** Delay in ms to enforce rate limit (one request per this interval). Default 55/min so we stay under 60/min. */
export function getFreshTeamDelayMs(): number {
  const perMin = getFreshTeamRequestsPerMinute();
  return Math.ceil(60000 / perMin); // e.g. 55/min -> ~1091ms
}

/**
 * List job postings (paginated). Returns summary objects; use getJobPosting(id) for full details.
 */
export async function listJobPostings(
  page = 1,
  perPage: number = DEFAULT_PER_PAGE
): Promise<FreshTeamJobSummary[]> {
  const data = await freshteamFetch<FreshTeamJobSummary[]>(
    `/job_postings?page=${page}&per_page=${perPage}`
  );
  return Array.isArray(data) ? data : [];
}

/**
 * Get a single job posting by ID (full details).
 */
export async function getJobPosting(id: number): Promise<FreshTeamJobDetail> {
  return freshteamFetch<FreshTeamJobDetail>(`/job_postings/${id}`);
}

/**
 * Fetch all job postings by paginating through list, then optionally fetch full detail for each.
 * Returns list of summary objects (each has at least id). Set fetchDetails true to get full job objects.
 */
export async function listAllJobPostings(fetchDetails: boolean): Promise<FreshTeamJobDetail[]> {
  const results: FreshTeamJobDetail[] = [];
  let page = 1;
  let list: FreshTeamJobSummary[] = [];
  do {
    list = await listJobPostings(page);
    for (const summary of list) {
      if (fetchDetails && summary.id != null) {
        const full = await getJobPosting(Number(summary.id));
        results.push(full);
      } else {
        results.push(summary as FreshTeamJobDetail);
      }
    }
    page++;
  } while (list.length === DEFAULT_PER_PAGE);
  return results;
}

// ==================== CANDIDATES & APPLICANTS (for migration) ====================

export type FreshTeamCandidate = {
  id: number;
  first_name?: string;
  middle_name?: string | null;
  last_name?: string;
  email?: string;
  mobile?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  description?: string | null;
  total_experience_in_months?: number | null;
  created_at?: string;
  updated_at?: string;
  applicant_ids?: number[];
  location?: {
    city?: string | null;
    state?: string | null;
    street?: string | null;
    country_code?: string | null;
    zip_code?: string | null;
  } | null;
  profile_links?: Array<{ name?: string; url?: string }>;
  resumes?: Array<{
    id?: number;
    content_file_name?: string;
    content_file_size?: number;
    url?: string;
    description?: string;
  }>;
  tags?: string[] | unknown[];
  [k: string]: unknown;
};

export type FreshTeamApplicant = {
  id: number;
  candidate_id?: number;
  job_id?: number;
  stage?: string;
  sub_stage?: string | null;
  created_at?: string;
  updated_at?: string;
  cover_letter?: string | null;
  referral_source?: string | null;
  source?: string | null;
  [k: string]: unknown;
};

/** List candidates (paginated). */
export async function listCandidates(
  page = 1,
  perPage: number = DEFAULT_PER_PAGE
): Promise<FreshTeamCandidate[]> {
  const data = await freshteamFetch<FreshTeamCandidate[]>(
    `/candidates?page=${page}&per_page=${perPage}`
  );
  return Array.isArray(data) ? data : [];
}

/**
 * Get a single candidate by ID. FreshTeam returns full candidate data: name, email, phone,
 * location, date_of_birth, gender, experience, description, tags, resumes (with URLs), etc.
 * Always use this when we have candidate_id so we get complete profile + resume.
 */
export async function getCandidate(id: number): Promise<FreshTeamCandidate> {
  return freshteamFetch<FreshTeamCandidate>(`/candidates/${id}`);
}

function parseApplicantListBody(
  data: FreshTeamApplicant[] | { applicants?: FreshTeamApplicant[]; applicant?: FreshTeamApplicant[]; data?: FreshTeamApplicant[] }
): FreshTeamApplicant[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  return (
    (data as { applicants?: FreshTeamApplicant[] }).applicants ??
    (data as { data?: FreshTeamApplicant[] }).data ??
    (data as { applicant?: FreshTeamApplicant[] }).applicant ??
    []
  );
}

export type ListApplicantsForJobOptions = {
  /** When set, each value is sent as a separate `status` query param (OR filter). */
  statuses?: string[];
  includeCandidate?: boolean;
};

/**
 * List applicants for a job posting (paginated).
 * Uses FreshTeam `total-pages` / `total-objects` response headers when present (max 50 per page).
 */
export async function listApplicantsForJob(
  jobPostingId: number,
  page = 1,
  perPage: number = 50,
  includeCandidate = true,
  options?: ListApplicantsForJobOptions
): Promise<{ applicants: FreshTeamApplicant[]; meta: FreshteamListMeta }> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", String(Math.min(Math.max(perPage, 1), 50)));
  if (options?.includeCandidate ?? includeCandidate) params.set("include", "candidate");
  for (const s of options?.statuses ?? []) {
    if (s.trim()) params.append("status", s.trim());
  }
  const path = `/job_postings/${jobPostingId}/applicants?${params.toString()}`;
  const res = await freshteamRequest(path);
  const data = (await res.json()) as
    | FreshTeamApplicant[]
    | { applicants?: FreshTeamApplicant[]; applicant?: FreshTeamApplicant[]; data?: FreshTeamApplicant[] };
  return { applicants: parseApplicantListBody(data), meta: parseFreshteamListMeta(res, page) };
}

/** Get a single applicant by ID (includes candidate_id, job_id, stage). */
export async function getApplicant(id: number): Promise<FreshTeamApplicant> {
  return freshteamFetch<FreshTeamApplicant>(`/applicants/${id}`);
}

// ==================== EMPLOYEES (for migration) ====================

export type FreshTeamEmployee = {
  id: number;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  /** Preferred / display name in FT; in this tenant holds the real name for directory suffix. */
  nickname?: string | null;
  nick_name?: string | null;
  employee_id?: string | null;
  official_email: string;
  personal_email?: string | null;
  designation?: string | null;
  joining_date?: string | null;
  termination_date?: string | null;
  status?: string | null;
  terminated?: boolean;
  employee_type?: string | null;
  department_id?: number | null;
  sub_department_id?: number | null;
  business_unit_id?: number | null;
  level_id?: number | null;
  team_id?: number | null;
  reporting_to_id?: number | null;
  hr_incharge_id?: number | null;
  branch_id?: number | null;
  shift_id?: number | null;
  /** Present when API returns nested shift (e.g. from GET /employees/:id). */
  shift?: { id?: number; name?: string } | null;
  job_category_id?: number | null;
  /** Present when API returns nested job_category. */
  job_category?: { id?: number; name?: string } | null;
  address?: { street?: string; city?: string; state?: string; country_code?: string; zip_code?: string } | null;
  communication_address?: {
    communication_street?: string;
    communication_city?: string;
    communication_state?: string;
    communication_country_code?: string;
    communication_zip_code?: string;
  } | null;
  work_numbers?: Array<{ name?: string; number?: string }>;
  phone_numbers?: Array<{ name?: string; number?: string }>;
  date_of_birth?: string | null;
  gender?: string | null;
  marital_status?: string | null;
  blood_group?: string | null;
  probation_start_date?: string | null;
  probation_end_date?: string | null;
  notice_period?: string | null;
  termination_reason?: string | null;
  rehire_eligibility?: boolean | null;
  team?: { id?: number; name?: string } | null;
  /** All roles associated with the employee (when included in response). */
  roles?: Array<{ id?: number; name?: string }> | null;
  department?: { id?: number; name?: string } | null;
  branch?: { id?: number; name?: string } | null;
  avatar_url?: string | null;
  /** Present when GET /api/employees/:id?include=time_off is used. */
  time_off?: FreshTeamEmployeeTimeOff[];
  /** Custom field name -> value (string or { id, value }). Used in employee sync. */
  custom_field_values?: Record<string, string | { id?: number; value?: string | null } | null> | null;
  /** Emergency contacts (name, relationship, contact number, address). Used in employee sync. */
  emergency_contacts?: FreshTeamEmergencyContact[] | null;
  /** Dependents / family (when include=dependents). Used in employee sync. */
  dependents?: FreshTeamDependent[] | null;
  [k: string]: unknown;
};

/** Emergency contact from FreshTeam (GET employee). Doc uses "contant_number" typo; we accept both. */
export type FreshTeamEmergencyContact = {
  name?: string | null;
  relationship?: string | null;
  contant_number?: string | null;
  contact_number?: string | null;
  address?: string | null;
  email?: string | null;
  [k: string]: unknown;
};

/** Dependent / family member from FreshTeam (when include=dependents or in default response). */
export type FreshTeamDependent = {
  name?: string | null;
  full_name?: string | null;
  relationship?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  [k: string]: unknown;
};

/** Per leave-type balance from FreshTeam (employee time_off array item). */
export type FreshTeamEmployeeTimeOff = {
  leave_type?: { id?: number; value?: string } | null;
  /** Some API responses use top-level leave_type_id */
  leave_type_id?: number;
  leave_type_name?: string;
  leaves_availed?: number;
  leave_credits?: number;
  /** Alternative field names some responses may use */
  leave_credits_available?: number;
  leaves_used?: number;
  [k: string]: unknown;
};

/** List employees (paginated). Includes active and inactive/terminated when no filter. */
export async function listEmployees(
  page = 1,
  perPage: number = 50
): Promise<FreshTeamEmployee[]> {
  const path = `/employees?page=${page}&per_page=${perPage}`;
  const data = await freshteamFetch<FreshTeamEmployee[]>(path);
  return Array.isArray(data) ? data : [];
}

/** Get a single employee by ID (full details). */
export async function getEmployee(id: number): Promise<FreshTeamEmployee> {
  return freshteamFetch<FreshTeamEmployee>(`/employees/${id}`);
}

/** Get employee with leave balances. Use include=time_off to get leave_credits and leaves_availed per leave type. */
export async function getEmployeeWithTimeOff(id: number): Promise<FreshTeamEmployee> {
  return freshteamFetch<FreshTeamEmployee>(`/employees/${id}?include=time_off`);
}

/** List departments (paginated). For mapping department_id to name and for org sync. */
export async function listDepartments(page = 1, perPage = 50): Promise<Array<{ id: number; name?: string; deleted?: boolean }>> {
  const data = await freshteamFetch<Array<{ id: number; name?: string; deleted?: boolean }>>(
    `/departments?page=${page}&per_page=${perPage}`
  );
  return Array.isArray(data) ? data : [];
}

// ==================== ORG STRUCTURE (for migration) ====================

export type FreshTeamBranch = {
  id: number;
  name?: string;
  city?: string | null;
  state?: string | null;
  country_code?: string | null;
  zip?: string | null;
  time_zone?: string | null;
  currency?: string | null;
  language?: string | null;
  main_office?: boolean;
  date_format?: string | null;
  deleted?: boolean;
  [k: string]: unknown;
};

export type FreshTeamOrgUnit = { id: number; name?: string; deleted?: boolean; [k: string]: unknown };

/** List branches (paginated). */
export async function listBranches(page = 1, perPage = 50): Promise<FreshTeamBranch[]> {
  const data = await freshteamFetch<FreshTeamBranch[]>(`/branches?page=${page}&per_page=${perPage}`);
  return Array.isArray(data) ? data : [];
}

/** List sub-departments (paginated). */
export async function listSubDepartments(page = 1, perPage = 50): Promise<FreshTeamOrgUnit[]> {
  const data = await freshteamFetch<FreshTeamOrgUnit[]>(`/sub_departments?page=${page}&per_page=${perPage}`);
  return Array.isArray(data) ? data : [];
}

/** List business units (paginated). */
export async function listBusinessUnits(page = 1, perPage = 50): Promise<FreshTeamOrgUnit[]> {
  const data = await freshteamFetch<FreshTeamOrgUnit[]>(`/business_units?page=${page}&per_page=${perPage}`);
  return Array.isArray(data) ? data : [];
}

/** List teams (paginated). */
export async function listTeams(page = 1, perPage = 50): Promise<FreshTeamOrgUnit[]> {
  const data = await freshteamFetch<FreshTeamOrgUnit[]>(`/teams?page=${page}&per_page=${perPage}`);
  return Array.isArray(data) ? data : [];
}

/** List levels (job bands / grades) (paginated). */
export async function listLevels(page = 1, perPage = 50): Promise<FreshTeamOrgUnit[]> {
  const data = await freshteamFetch<FreshTeamOrgUnit[]>(`/levels?page=${page}&per_page=${perPage}`);
  return Array.isArray(data) ? data : [];
}

/** List work shifts (paginated). Same shape as levels for org sync. */
export async function listShifts(page = 1, perPage = 50): Promise<FreshTeamOrgUnit[]> {
  const data = await freshteamFetch<FreshTeamOrgUnit[]>(`/shifts?page=${page}&per_page=${perPage}`);
  return Array.isArray(data) ? data : [];
}

/** List job categories (paginated). Same shape as levels for org sync. */
export async function listJobCategories(page = 1, perPage = 50): Promise<FreshTeamOrgUnit[]> {
  const data = await freshteamFetch<FreshTeamOrgUnit[]>(`/job_categories?page=${page}&per_page=${perPage}`);
  return Array.isArray(data) ? data : [];
}

/** List roles (paginated). Used for org sync and employee role. */
export async function listRoles(page = 1, perPage = 50): Promise<FreshTeamOrgUnit[]> {
  const data = await freshteamFetch<FreshTeamOrgUnit[]>(`/roles?page=${page}&per_page=${perPage}`);
  return Array.isArray(data) ? data : [];
}

// ==================== TIME-OFFS (for migration) ====================

export type FreshTeamTimeOffType = {
  id: number;
  name?: string;
  description?: string;
  deleted?: boolean;
  default?: boolean;
  auto_approve?: boolean;
  auto_approve_after?: number | null;
  auto_approve_limit?: number | null;
  applicable_for?: string | null;
  marital_status?: string | null;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
};

export type FreshTeamTimeOff = {
  id: number;
  created_at?: string;
  updated_at?: string;
  user_id: number;
  start_date: string;
  end_date: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  leave_units: number;
  optional_leave_units?: number | null;
  leave_type_id: number;
  status_comments?: string | null;
  approved_by_id?: number | null;
  applied_by_id: number;
  cancelled_by_id?: number | null;
  rejected_by_id?: number | null;
  comments?: string | null;
  rejected_at?: string | null;
  cancelled_at?: string | null;
  [k: string]: unknown;
};

/** List time-off types (paginated). */
export async function listTimeOffTypes(
  page = 1,
  perPage: number = DEFAULT_PER_PAGE
): Promise<FreshTeamTimeOffType[]> {
  const data = await freshteamFetch<FreshTeamTimeOffType[]>(
    `/time_off_types?page=${page}&per_page=${perPage}`
  );
  return Array.isArray(data) ? data : [];
}

export type ListTimeOffsParams = {
  status?: "pending" | "approved" | "declined" | "cancelled";
  user?: number;
  leave_type?: number;
  location?: number;
  start_date?: string;
  end_date?: string;
  page?: number;
  per_page?: number;
};

/** List time-offs (paginated). Use filters to limit scope. */
export async function listTimeOffs(params: ListTimeOffsParams = {}): Promise<FreshTeamTimeOff[]> {
  const search = new URLSearchParams();
  if (params.status != null) search.set("status", params.status);
  if (params.user != null) search.set("user", String(params.user));
  if (params.leave_type != null) search.set("leave_type", String(params.leave_type));
  if (params.location != null) search.set("location", String(params.location));
  if (params.start_date != null) search.set("start_date", params.start_date);
  if (params.end_date != null) search.set("end_date", params.end_date);
  search.set("page", String(params.page ?? 1));
  search.set("per_page", String(params.per_page ?? DEFAULT_PER_PAGE));
  const path = `/time_offs?${search.toString()}`;
  const data = await freshteamFetch<FreshTeamTimeOff[]>(path);
  return Array.isArray(data) ? data : [];
}

/**
 * If the URL is relative (e.g. /api/... or resumes/123), make it absolute using FreshTeam origin.
 * Call this before fetch when the API returns a path instead of a full URL.
 */
export function toAbsoluteResumeUrl(url: string): string {
  const u = url.trim();
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  const origin = getFreshTeamOrigin();
  if (!origin) return u;
  return u.startsWith("/") ? `${origin}${u}` : `${origin}/${u}`;
}

/**
 * Download a file from URL (e.g. FreshTeam resume) and return as base64 data URL.
 * For FreshTeam-hosted URLs we send Authorization. If the response is a redirect (e.g. to S3),
 * we follow it without sending auth so the signed URL works.
 */
export async function downloadResumeAsDataUrl(
  url: string,
  filename?: string,
  useFreshTeamAuth = false
): Promise<{ dataUrl: string; filename: string } | null> {
  const absoluteUrl = useFreshTeamAuth ? toAbsoluteResumeUrl(url) : url.trim();
  try {
    // Only send auth when the request host is FreshTeam (e.g. api.freshteam.com). Do NOT send auth to S3/CDN.
    let isFreshTeamHost = false;
    try {
      const hostname = new URL(absoluteUrl).hostname.toLowerCase();
      isFreshTeamHost = hostname.endsWith(".freshteam.com");
    } catch {
      // invalid URL
    }
    const headers: Record<string, string> = { Accept: "*/*" };
    try {
      if (isFreshTeamHost) {
        const auth = getAuthHeader();
        if (auth) headers.Authorization = auth;
      }
    } catch {
      // FreshTeam not configured
    }
    let res = await fetch(absoluteUrl, { headers, redirect: "manual" });
    // Follow redirect without auth (e.g. FreshTeam redirects to S3 signed URL)
    if (res.status >= 301 && res.status <= 308) {
      const location = res.headers.get("location");
      if (location) {
        const redirectUrl = location.startsWith("http") ? location : new URL(location, absoluteUrl).href;
        res = await fetch(redirectUrl, { headers: { Accept: "*/*" } });
      }
    }
    if (!res.ok) {
      console.warn("[FreshTeam resume] Download failed:", res.status, res.statusText, absoluteUrl.slice(0, 100));
      return null;
    }
    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    if (b64.length === 0) {
      console.warn("[FreshTeam resume] Empty response body:", absoluteUrl.slice(0, 100));
      return null;
    }
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const dataUrl = `data:${contentType};base64,${b64}`;
    const name = filename || "resume.pdf";
    return { dataUrl, filename: name };
  } catch (err) {
    console.warn("[FreshTeam resume] Download error:", (err as Error)?.message ?? err, absoluteUrl.slice(0, 100));
    return null;
  }
}

/**
 * Fetch resume file from URL and return buffer + metadata for streaming.
 * Uses FreshTeam auth when URL is from FreshTeam (so expired S3 links can be refreshed via GET /candidates/:id from FreshTeam).
 */
export async function fetchResumeBuffer(
  url: string,
  filename?: string
): Promise<{ buffer: Buffer; contentType: string; filename: string } | null> {
  try {
    const headers: Record<string, string> = { Accept: "*/*" };
    if (url.includes("freshteam.com")) {
      try {
        headers.Authorization = getAuthHeader();
      } catch {
        // no FreshTeam config
      }
    }
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const buffer = Buffer.from(buf);
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const name = filename || "resume.pdf";
    return { buffer, contentType, filename: name };
  } catch {
    return null;
  }
}

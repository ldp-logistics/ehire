/**
 * Multi-region access control helpers (Step 2).
 *
 * Region model (see migration 0123):
 *   - branches.region_code            : 'PK' | 'US' | 'IN-N' | 'IN-S'
 *   - users.branch_id                 : direct branch link (fallback: employee's branch)
 *   - job_postings/applications/onboarding_records.region_code : explicit per-entity region (Option 1)
 *
 * Pakistan is the Super Region: Pakistan-region Admins get cross-region access
 * automatically; others may hold the `regional_super_admin` grant in users.roles.
 * India has two ISOLATED sub-regions
 * (IN-N, IN-S) — they are never treated as "the same region".
 *
 * NOTE: most request-time checks should read `req.user.regionCode` /
 * `req.user.isRegionalSuperAdmin` (already resolved in extractUser) instead of
 * re-querying. The DB helpers here are for non-request contexts (create/update
 * handlers, background jobs) and for resolving a *target entity's* region.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { isPrimaryAdminBaselineExceptionEmail } from "@shared/roleCatalog";
import { isRegionalSuperAdmin, normalizeRole } from "./rbac";
import { sqlEmployeeEffectiveRegion } from "./employeeRegionSql.js";

config();
const sql = neon(process.env.DATABASE_URL!);

export type RegionCode = "PK" | "US" | "IN-N" | "IN-S";

export const ALL_REGION_CODES: RegionCode[] = ["PK", "US", "IN-N", "IN-S"];
/** Pakistan is the cross-region Super Region. */
export const SUPER_REGION_CODE: RegionCode = "PK";

export interface RegionFilter {
  /** True = cross-region (Pakistan super region); skip region WHERE filtering. */
  isSuperAdmin: boolean;
  /** The user's own region; null = no region assigned (fail-closed). */
  regionCode: RegionCode | null;
}

/** True when the stored role/grants include Admin (primary or JSONB grant). */
export function hasAdminGrant(role: string | null | undefined, roles: string[] | null | undefined): boolean {
  if (normalizeRole(role ?? "employee") === "admin") return true;
  return Array.isArray(roles) && roles.includes("admin");
}

/** Scope grants that give a user cross-region access for their specific function. */
const GLOBAL_SCOPE_GRANTS = ["global_hr", "global_it", "global_recruiter"] as const;

/**
 * Cross-region access: explicit `regional_super_admin` grant, Pakistan-region Admin,
 * or any of the narrow global-scope grants (global_hr, global_it, global_recruiter).
 * Pakistan admins are automatically Super Region admins — no manual grant required.
 */
export function hasSuperRegionAccess(user: {
  regionCode?: string | null;
  role?: string | null;
  roles?: string[] | null | undefined;
  /** Break-glass primary admin (ehire) always has cross-region access. */
  email?: string | null;
}): boolean {
  if (user.email && isPrimaryAdminBaselineExceptionEmail(user.email)) return true;
  if (isRegionalSuperAdmin(user.roles)) return true;
  if (Array.isArray(user.roles) && user.roles.some((r) => (GLOBAL_SCOPE_GRANTS as readonly string[]).includes(r))) return true;
  return hasAdminGrant(user.role, user.roles) && user.regionCode === SUPER_REGION_CODE;
}

/**
 * Whether the user holds a specific narrow global scope grant.
 * Used by module services to skip region filtering for cross-region staff.
 */
export function hasGlobalScopeGrant(roles: string[] | null | undefined, grant: "global_hr" | "global_it" | "global_recruiter"): boolean {
  return Array.isArray(roles) && roles.includes(grant);
}

/** @deprecated Prefer hasSuperRegionAccess when region + role are available. Grant-only check. */
export function isSuperRegionAdmin(userRoles: string[] | null | undefined): boolean {
  return isRegionalSuperAdmin(userRoles);
}

/** India sub-regions are separate — strict equality only. */
export function isSameRegion(regionA: RegionCode | null, regionB: RegionCode | null): boolean {
  return regionA != null && regionB != null && regionA === regionB;
}

/** region_code for a branch id (branches.id is a UUID string). */
export async function getRegionByBranchId(branchId: string): Promise<RegionCode | null> {
  const rows = (await sql`SELECT region_code FROM branches WHERE id = ${branchId}`) as { region_code: string | null }[];
  return (rows[0]?.region_code as RegionCode) ?? null;
}

/**
 * region_code for a user. Uses the user's own branch first, falling back to the
 * linked employee's branch (same precedence as extractUser()).
 */
export async function getUserRegion(userId: string): Promise<RegionCode | null> {
  const rows = (await sql`
    SELECT b.region_code
    FROM users u
    LEFT JOIN employees e ON e.id = u.employee_id
    LEFT JOIN branches b  ON b.id = COALESCE(u.branch_id, e.branch_id)
    WHERE u.id = ${userId}
  `) as { region_code: string | null }[];
  return (rows[0]?.region_code as RegionCode) ?? null;
}

/** Target region of an employee (branch region, else location/country heuristics). */
export async function getEmployeeRegion(employeeId: string): Promise<RegionCode | null> {
  const expr = sqlEmployeeEffectiveRegion("e", "b");
  const rows = (await sql(`
    SELECT ${expr} AS region_code
    FROM employees e
    LEFT JOIN branches b ON b.id = e.branch_id
    WHERE e.id = $1
  `, [employeeId])) as { region_code: string | null }[];
  return (rows[0]?.region_code as RegionCode) ?? null;
}

/** Target region of a job posting (explicit region_code column — Option 1). */
export async function getJobRegion(jobId: string): Promise<RegionCode | null> {
  const rows = (await sql`SELECT region_code FROM job_postings WHERE id = ${jobId}`) as { region_code: string | null }[];
  return (rows[0]?.region_code as RegionCode) ?? null;
}

/** Target region of an application/applicant (explicit region_code column — Option 1). */
export async function getApplicationRegion(applicationId: string): Promise<RegionCode | null> {
  const rows = (await sql`SELECT region_code FROM applications WHERE id = ${applicationId}`) as { region_code: string | null }[];
  return (rows[0]?.region_code as RegionCode) ?? null;
}

/** Target region of an onboarding record (explicit region_code column — Option 1). */
export async function getOnboardingRegion(onboardingId: string): Promise<RegionCode | null> {
  const rows = (await sql`SELECT region_code FROM onboarding_records WHERE id = ${onboardingId}`) as { region_code: string | null }[];
  return (rows[0]?.region_code as RegionCode) ?? null;
}

/** Target region of an offboarding record (explicit region_code or employee branch). */
export async function getOffboardingRegion(offboardingId: string): Promise<RegionCode | null> {
  const rows = (await sql`
    SELECT COALESCE(o.region_code, b.region_code) AS region_code
    FROM offboarding_records o
    JOIN employees e ON e.id = o.employee_id
    LEFT JOIN branches b ON b.id = e.branch_id
    WHERE o.id = ${offboardingId}
  `) as { region_code: string | null }[];
  return (rows[0]?.region_code as RegionCode) ?? null;
}

/**
 * Build the set of region codes a user may act on.
 *   - super admin → null (means "all regions; no filter")
 *   - has region  → [region]
 *   - no region   → [] (fail-closed: nothing)
 */
export function allowedRegionsFor(user: { isRegionalSuperAdmin?: boolean; regionCode?: string | null }): RegionCode[] | null {
  if (user.isRegionalSuperAdmin) return null;
  return user.regionCode ? [user.regionCode as RegionCode] : [];
}

export const REGION_LABELS: Record<RegionCode, string> = {
  PK: "Pakistan",
  US: "United States",
  "IN-N": "India North",
  "IN-S": "India South",
};

const VALID_REGION_CODES: RegionCode[] = ALL_REGION_CODES;
export function isValidRegionCode(value: unknown): value is RegionCode {
  return typeof value === "string" && (VALID_REGION_CODES as string[]).includes(value);
}

/**
 * Effective region scope honoring an optional `?region=` filter.
 *   - Super admins MAY narrow to a single valid region (else null = all).
 *   - Non-super users always get their own scope (the override is ignored).
 */
export function effectiveRegionsFor(
  user: { isRegionalSuperAdmin?: boolean; regionCode?: string | null },
  requestedRegion?: string | null,
): RegionCode[] | null {
  const base = allowedRegionsFor(user);
  if (base === null) {
    return isValidRegionCode(requestedRegion) ? [requestedRegion] : null;
  }
  return base;
}

/**
 * Service-layer assertion: throws nothing, returns whether the user may access a
 * record in `targetRegion`. Super admins always true; null target = false
 * (fail-closed) for non-super users.
 */
export function canAccessRegion(
  user: { isRegionalSuperAdmin?: boolean; regionCode?: string | null },
  targetRegion: RegionCode | null,
): boolean {
  if (user.isRegionalSuperAdmin) return true;
  if (!user.regionCode || !targetRegion) return false;
  return user.regionCode === targetRegion;
}

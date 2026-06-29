/**
 * Centralised RBAC helpers.
 * All role resolution goes through getEffectiveRole() so there's a single source of truth.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { hasOrgDerivedManagerScope } from "@shared/managerScope";
import { isPrimaryAdminBaselineExceptionEmail } from "@shared/roleCatalog";

export { hasOrgDerivedManagerScope };

config();
const sql = neon(process.env.DATABASE_URL!);

// ==================== TYPES ====================

export const ALL_ROLES = [
  "admin", "hr", "limited_hr", "manager", "employee", "it",
  "recruiter", "hiring_manager", "onboarding_specialist", "limited_recruiter",
  // Scope grants — extend regional reach for a function; never affect getEffectiveRole()
  "global_hr", "global_it", "global_recruiter",
] as const;
export type SystemRole = (typeof ALL_ROLES)[number];

/** Minimal user row needed for role resolution */
export interface UserRow {
  id: string;
  email: string;
  role: string | null;
  roles?: string[] | null;
  employee_id?: string | null;
}

const PRIV_RANK: Record<SystemRole, number> = {
  admin: 10,
  hr: 8,
  limited_hr: 7,
  it: 6,
  recruiter: 5,
  hiring_manager: 4,
  onboarding_specialist: 4,
  limited_recruiter: 3,
  manager: 2,
  employee: 1,
  // Scope grants — rank 0 so pickHighest never promotes them to primary/effective role
  global_hr: 0,
  global_it: 0,
  global_recruiter: 0,
};

function pickHighest(candidates: SystemRole[]): SystemRole {
  let best: SystemRole = "employee";
  let score = 0;
  for (const c of candidates) {
    const r = PRIV_RANK[c] ?? 0;
    if (r > score) {
      score = r;
      best = c;
    }
  }
  return best;
}

const GRANT_ROLES: readonly string[] = [
  "admin", "hr", "limited_hr", "it",
  "recruiter", "hiring_manager", "onboarding_specialist", "limited_recruiter",
  // Scope grants stored alongside function grants in users.roles JSONB
  "global_hr", "global_it", "global_recruiter",
];

function grantsFromDbRow(roles: string[] | null | undefined): SystemRole[] {
  if (!Array.isArray(roles)) return [];
  const grantSet = new Set<string>(GRANT_ROLES);
  const out: SystemRole[] = [];
  for (const r of roles) {
    if (grantSet.has(r)) out.push(r as SystemRole);
  }
  return out;
}

// ==================== EFFECTIVE ROLE ====================

/**
 * Resolve the effective (display / permission-leading) role for a user.
 *
 * Baseline model:
 *  - Almost everyone has users.role = 'employee'; privileges are in users.roles.
 *  - Primary break-glass email may keep users.role = 'admin' (exception).
 *  - Manager is org-derived only (direct reports), never stored.
 *
 * Precedence among candidates: admin > hr > it > manager > employee.
 */
export async function getEffectiveRole(user: UserRow): Promise<SystemRole> {
  const email = (user.email || "").trim().toLowerCase();
  const stored = (user.role || "").trim().toLowerCase() as SystemRole | "";

  // Exception: primary admin account may stay stored admin
  if (isPrimaryAdminBaselineExceptionEmail(email) && stored === "admin") {
    return "admin";
  }

  const candidates: SystemRole[] = [];

  // JSONB grants (admin, hr, it, …)
  candidates.push(...grantsFromDbRow(user.roles));

  // Legacy: stored hr/it on row (should be rare after migration)
  if (stored === "hr" || stored === "it") {
    candidates.push(stored);
  }

  // Org-derived manager (direct reports). Skip this DB round-trip when we already
  // have explicit grants or legacy hr/it — manager never outranks those in pickHighest,
  // and this query was adding ~1 Neon HTTP latency to every authenticated request.
  if (candidates.length === 0 && user.employee_id) {
    try {
      const emps = await sql`
        SELECT (SELECT COUNT(*)::int FROM employees sub WHERE sub.manager_id = e.id) AS direct_reports
        FROM employees e WHERE e.id = ${user.employee_id}
      `;
      if (emps.length > 0) {
        const emp = emps[0] as { direct_reports: number };
        if (emp.direct_reports > 0) candidates.push("manager");
      }
    } catch (e) {
      console.warn("[rbac] getEffectiveRole: failed to query employee", e);
    }
  }

  if (candidates.length === 0) return "employee";

  return pickHighest(candidates);
}

/**
 * Append org-derived `manager` to the merged roles list when the user has direct reports.
 * Needed because `pickHighest` keeps primary role as e.g. `it`, so JWT never included `manager`
 * and Leave / notifications treated IT-only users as non-managers even when they lead a team.
 */
export async function mergeRolesWithOrgDerivedManager(rolesArray: string[], employeeId: string | null): Promise<string[]> {
  if (!employeeId || rolesArray.includes("manager")) return rolesArray;
  try {
    const emps = await sql`
      SELECT (SELECT COUNT(*)::int FROM employees sub WHERE sub.manager_id = e.id) AS direct_reports
      FROM employees e WHERE e.id = ${employeeId}
    `;
    if (emps.length > 0 && Number((emps[0] as { direct_reports: number }).direct_reports) > 0) {
      return [...rolesArray, "manager"];
    }
  } catch (e) {
    console.warn("[rbac] mergeRolesWithOrgDerivedManager:", e);
  }
  return rolesArray;
}

/**
 * Synchronous version when we already know the role is valid.
 * Falls back to 'employee' for unknown strings.
 */
export function normalizeRole(raw: string | null | undefined): SystemRole {
  if (raw && (ALL_ROLES as readonly string[]).includes(raw)) return raw as SystemRole;
  if (raw) console.warn(`[rbac] Unknown role "${raw}", treating as "employee"`);
  return "employee";
}

/**
 * Check whether the user has any of the allowed roles.
 * Pass resolved user.role (effective) and merged roles[] from middleware for full coverage.
 */
export function hasAnyRole(user: UserRow, allowedRoles: SystemRole[]): boolean {
  const primary = normalizeRole(user.role);
  if (allowedRoles.includes(primary)) return true;
  if (Array.isArray(user.roles)) {
    return allowedRoles.some((r) => user.roles!.includes(r as string));
  }
  return false;
}

// ==================== MULTI-REGION ACCESS ====================

/**
 * Grant stored in users.roles JSONB that gives a user cross-region access
 * (the "Super Region" — Pakistan admins/HR). Deliberately NOT in ALL_ROLES /
 * the user_role enum: it is a scope dimension, not a job function, so it never
 * affects getEffectiveRole().
 */
export const REGIONAL_SUPER_ADMIN_GRANT = "regional_super_admin";

/** True when the user can view/modify records across ALL regions. */
export function isRegionalSuperAdmin(roles: string[] | null | undefined): boolean {
  return Array.isArray(roles) && roles.includes(REGIONAL_SUPER_ADMIN_GRANT);
}

// ==================== FRESHTEAMS MIGRATION ====================

/**
 * Map a Freshteams role label to a SystemRole for the **grants** array (stored in users.roles).
 * Primary row role is always 'employee' for auto-created accounts.
 */
export function mapFreshteamsRoleToSystemRole(freshRole: string): SystemRole {
  const normalised = (freshRole || "").trim().toLowerCase();

  const map: Record<string, SystemRole> = {
    admin: "employee", // never auto-grant admin
    hr: "hr",
    manager: "employee", // manager is org-derived
    employee: "employee",
    it: "it",
    "it admin": "it",
    "it desk": "it",
  };

  const mapped = map[normalised];
  if (!mapped) {
    console.warn(`[rbac] mapFreshteamsRole: unknown role "${freshRole}", defaulting to employee`);
    return "employee";
  }
  if (normalised === "admin") {
    console.warn(`[rbac] mapFreshteamsRole: "Admin" cannot be auto-assigned. Setting to employee. Promote manually.`);
  }
  return mapped;
}

/**
 * Given an employee row (from a Freshteams import), auto-link or create a user account.
 *
 * Returns the user id, or null if we couldn't create/link.
 */
export async function autoLinkUserForEmployee(employee: {
  id: string;
  work_email: string;
  freshteams_role?: string;
  domain?: string;
}): Promise<string | null> {
  const email = (employee.work_email || "").toLowerCase().trim();
  if (!email) return null;

  try {
    // Check if a user already exists with this email
    const existing = await sql`SELECT id, employee_id FROM users WHERE LOWER(email) = ${email}`;
    if (existing.length > 0) {
      const u = existing[0] as { id: string; employee_id: string | null };
      if (!u.employee_id) {
        // Link the user to the employee
        await sql`UPDATE users SET employee_id = ${employee.id}, updated_at = NOW() WHERE id = ${u.id}`;
        console.log(`[rbac] Auto-linked user ${u.id} (${email}) → employee ${employee.id}`);
      }
      return u.id;
    }

    // No user exists → create one (baseline employee + optional hr/it grant)
    const mapped = employee.freshteams_role ? mapFreshteamsRoleToSystemRole(employee.freshteams_role) : "employee";
    const grantRoles = mapped === "hr" || mapped === "it" ? [mapped] : [];
    const rolesJson = JSON.stringify(grantRoles);

    const authProvider = employee.domain && email.endsWith(`@${employee.domain.toLowerCase()}`)
      ? "microsoft"
      : "local";

    const created = await sql`
      INSERT INTO users (email, role, roles, employee_id, auth_provider, is_active)
      VALUES (${email}, 'employee', ${rolesJson}::jsonb, ${employee.id}, ${authProvider}, true)
      RETURNING id
    `;
    console.log(`[rbac] Auto-created user for employee ${employee.id} (${email}) role=employee grants=${rolesJson}`);
    return (created[0] as { id: string }).id;
  } catch (e) {
    if ((e as { code?: string })?.code === "23505") {
      console.warn(`[rbac] autoLinkUser: employee ${employee.id} already linked to another user`);
      return null;
    }
    console.error("[rbac] autoLinkUser error:", e);
    return null;
  }
}

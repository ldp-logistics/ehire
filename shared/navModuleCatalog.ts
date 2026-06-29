/**
 * Nav module keys for routes that are UI-only / not production-ready.
 * Hidden from sidebar and blocked at route level for all users except the
 * break-glass baseline admin (developer account).
 */
export const PROTOTYPE_MODULE_KEYS = [
  "rooms",
  "visitors",
  "payroll",
  "payslips",
  "expenses",
  "salary",
  "compliance",
  "whistleblower",
  "performance",
  "goals",
  "surveys",
  "kudos",
  "training",
  "diversity",
  "succession",
  "health",
  "project-tracking",
  "help-center",
  "emergency",
] as const;

export type PrototypeModuleKey = (typeof PROTOTYPE_MODULE_KEYS)[number];

export function isPrototypeModuleKey(moduleKey: string): boolean {
  return (PROTOTYPE_MODULE_KEYS as readonly string[]).includes(moduleKey);
}

/** Break-glass baseline admin — full nav + route access for development. */
export function isBreakGlassDeveloper(user: { isBreakGlassAccount?: boolean } | null | undefined): boolean {
  return !!user?.isBreakGlassAccount;
}

/** Non–break-glass users must not see or open prototype modules. */
export function isNavModuleVisible(
  moduleKey: string,
  user: { isBreakGlassAccount?: boolean } | null | undefined,
): boolean {
  if (!isPrototypeModuleKey(moduleKey)) return true;
  return isBreakGlassDeveloper(user);
}

/** System audit log stream (/audit) — Super Region admins only (PK admin, regional_super_admin, global scope, break-glass). */
export function canAccessAuditLogs(
  user:
    | {
        isSuperRegionAdmin?: boolean;
        isBreakGlassAccount?: boolean;
        role?: string | null;
        regionCode?: string | null;
      }
    | null
    | undefined,
): boolean {
  if (!user) return false;
  if (user.isBreakGlassAccount) return true;
  if (user.isSuperRegionAdmin === true) return true;
  // Mirror server hasSuperRegionAccess: PK-region admins are auto super.
  if (user.role === "admin" && user.regionCode === "PK") return true;
  return false;
}

/** Sidebar / route guard for Audit Logs nav item. */
export function isAuditNavVisible(
  user: Parameters<typeof canAccessAuditLogs>[0],
): boolean {
  return canAccessAuditLogs(user);
}

/** Loans & Advances: HR/admin management + any user linked to an employee record. */
export function isLoansNavVisible(
  user:
    | { employeeId?: string | null; role?: string; roles?: string[] }
    | null
    | undefined,
): boolean {
  if (!user) return false;
  const roles = new Set([user.role, ...(user.roles ?? [])].filter(Boolean));
  if (roles.has("admin") || roles.has("hr")) return true;
  return !!user.employeeId;
}

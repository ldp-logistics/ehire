/**
 * Whether the user should get **line-manager** UX (team leave, manager dashboard,
 * curated sidebar when `allowedModules` is empty).
 *
 * Admin / HR / limited_hr keep org-wide behavior even when the org chart adds `manager`.
 */
export function hasOrgDerivedManagerScope(
  primaryRole: string,
  roles?: string[] | null,
): boolean {
  const r = String(primaryRole || "employee").toLowerCase();
  if (r === "hr" || r === "admin" || r === "limited_hr") return false;
  if (r === "manager") return true;
  return Array.isArray(roles) && roles.includes("manager");
}

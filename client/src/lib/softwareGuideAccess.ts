export const SOFTWARE_GUIDE_ROLES = ["admin", "hr", "limited_hr", "employee"] as const;

export function canSeeSoftwareGuide(
  user: { roles?: string[] } | null | undefined,
  effectiveRole: string,
): boolean {
  if (!user) return false;
  const userRoles = new Set<string>([effectiveRole, ...(user.roles ?? [])]);
  return SOFTWARE_GUIDE_ROLES.some((r) => userRoles.has(r));
}

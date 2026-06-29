/**
 * Canonical role definitions for the HRMS UI (Settings → Manage roles).
 *
 * Baseline: almost all accounts keep `users.role = 'employee'`. Privileged access
 * (admin, hr, it) lives in `users.roles` JSONB. Exception: the primary admin
 * login may keep `users.role = 'admin'` (see getPrimaryAdminBaselineExceptionEmail).
 * "manager" is NOT stored — it is org-derived from reporting lines.
 *
 * Optional: set BREAK_GLASS_PRIMARY_EMAIL to override (e.g. another tenant). If unset,
 * defaults to ehire@ldplogistics.com (same row as seed / migration rename).
 */

/** Fallback when `process.env.BREAK_GLASS_PRIMARY_EMAIL` is not set (local/dev seeds). */
export const PRIMARY_ADMIN_BASELINE_EXCEPTION_EMAIL = "ehire@ldplogistics.com";

/**
 * Single source of truth for “primary break-glass / exception admin” email at runtime.
 * Reads `BREAK_GLASS_PRIMARY_EMAIL` after dotenv loads on the server.
 */
export function getPrimaryAdminBaselineExceptionEmail(): string {
  const raw =
    typeof process !== "undefined" && typeof process.env.BREAK_GLASS_PRIMARY_EMAIL === "string"
      ? process.env.BREAK_GLASS_PRIMARY_EMAIL.trim()
      : "";
  return raw.length > 0 ? raw : PRIMARY_ADMIN_BASELINE_EXCEPTION_EMAIL;
}

export function isPrimaryAdminBaselineExceptionEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === getPrimaryAdminBaselineExceptionEmail().toLowerCase();
}

// Roles that can actually be written into users.roles JSONB (grants).
// "manager" is intentionally absent — it is org-derived.
// "global_*" are scope grants — they widen a user's regional reach for their module
// without changing their job function (hr, it, recruiter stays the same).
export const ASSIGNABLE_ROLE_IDS = [
  "admin", "hr", "limited_hr", "it",
  "recruiter", "hiring_manager", "onboarding_specialist", "limited_recruiter",
  "global_hr", "global_it", "global_recruiter",
  "employee",
] as const;
export type AssignableRoleId = (typeof ASSIGNABLE_ROLE_IDS)[number];

// All roles including the org-derived manager (for type-checking middleware/guards)
export const SYSTEM_ROLE_IDS = [
  "admin", "hr", "limited_hr", "manager", "employee", "it",
  "recruiter", "hiring_manager", "onboarding_specialist", "limited_recruiter",
  "global_hr", "global_it", "global_recruiter",
] as const;
export type SystemRoleId = (typeof SYSTEM_ROLE_IDS)[number];

export interface RoleCatalogDefinition {
  id: SystemRoleId;
  /** Card title (e.g. "HR Partner" style label) */
  title: string;
  /** Short line under the title */
  tagline: string;
  /** Main capabilities */
  permissions: string[];
  /** Explicit limits (Freshworks-style) */
  restrictions?: string[];
  /** If true, this role cannot be assigned — it is derived automatically */
  orgDerived?: boolean;
}

/**
 * Sections for Settings → Manage roles: each role appears exactly once.
 * Renders separate labeled groups so recruiter, hiring manager, limited roles, etc. are visually distinct blocks.
 */
export const MANAGE_ROLES_SECTIONS: readonly { heading: string; description?: string; roleIds: readonly SystemRoleId[] }[] = [
  {
    heading: "Account & system",
    description: "Full configuration and user lifecycle.",
    roleIds: ["admin"],
  },
  {
    heading: "HR & people",
    description: "Employee records, leave, onboarding, and scoped HR partners.",
    roleIds: ["hr", "limited_hr", "onboarding_specialist"],
  },
  {
    heading: "Recruitment & talent",
    description: "ATS access from full recruiter to per-job hiring team and limited recruiter.",
    roleIds: ["recruiter", "hiring_manager", "limited_recruiter"],
  },
  {
    heading: "IT & assets",
    description: "Hardware, support tickets, and inventory.",
    roleIds: ["it"],
  },
  {
    heading: "Cross-region scope",
    description: "Grants a user cross-region visibility for their function without full admin. Assign alongside the matching function role (hr, it, recruiter).",
    roleIds: ["global_hr", "global_it", "global_recruiter"],
  },
  {
    heading: "Organization",
    description: "Derived from reporting lines — not assigned here.",
    roleIds: ["manager"],
  },
  {
    heading: "Baseline",
    description: "Every account; privileges are usually extra grants on top.",
    roleIds: ["employee"],
  },
] as const;

/**
 * Ordered for display (most privileged first, employee last).
 * Manager is listed for reference only — it is org-derived and cannot be assigned.
 */
export const ROLE_CATALOG: RoleCatalogDefinition[] = [
  {
    id: "admin",
    title: "Admin",
    tagline: "Account-level configuration, user lifecycle, and full module access.",
    permissions: [
      "Create, update, and deactivate user accounts; assign roles and optional per-module access.",
      "Access all Settings (user access, org structure, onboarding templates, leave admin, timesheet policy).",
      "Delete employees and jobs where the product allows; run scheduled jobs (e.g. probation reminders).",
      "Use all HR, recruitment, onboarding, offboarding, asset, and reporting features at the same depth as HR where not explicitly admin-only.",
    ],
    restrictions: [
      "Use the least-privileged role for routine HR work where possible (segregation of duties).",
    ],
  },
  {
    id: "hr",
    title: "HR",
    tagline: "Full employee lifecycle, leave, recruitment coordination, and people data for any employee.",
    permissions: [
      "Create and update employee records; import data; upload documents and manage change requests (approve/reject).",
      "Configure leave (policies, types, balances, holidays) and approve or reject leave across the organization.",
      "Run recruitment (jobs, candidates, applications, offers, hire), onboarding, offboarding, and tentative-hire flows.",
      "Create and edit onboarding checklist templates (Settings → Onboarding templates).",
      "Manage departments, attendance overrides, compensation records, and most operational HR workflows.",
    ],
    restrictions: [
      "Typically cannot delete employees (reserved for Admin in this product) or register new users without Admin.",
      "Cannot access system-only areas such as audit logs or system health unless also allowed by Admin.",
    ],
  },
  {
    id: "manager",
    title: "Manager",
    tagline: "Automatically granted to any employee who has direct reports in the org chart.",
    orgDerived: true,
    permissions: [
      "Approve or reject leave requests from direct reports in the approval chain.",
      "View team directory, attendance, and leave reports scoped to their reporting line.",
      "Access recruitment views and offer approval actions where enabled.",
      "All standard employee self-service capabilities (profile, leave, tasks).",
    ],
    restrictions: [
      "Cannot be manually assigned — add employees as direct reports in the org chart instead.",
      "Cannot change org-wide leave policy, compensation for others, or create user accounts.",
    ],
  },
  {
    id: "it",
    title: "IT / Asset manager",
    tagline: "Asset lifecycle, IT support tickets, and hardware inventory.",
    permissions: [
      "Manage asset stock, assigned systems, support tickets, invoices, and asset audit where enabled.",
      "Create and update asset records; perform IT-facing operations restricted from standard employees.",
    ],
    restrictions: [
      "No HR-only recruitment or offboarding flows; leave policy administration is not included.",
      "Employee directory access follows product rules (often limited profile fields for support).",
    ],
  },
  {
    id: "recruiter",
    title: "Recruiter",
    tagline: "Full ATS access: jobs, candidates, applications, and offer management.",
    permissions: [
      "Create and update job postings; manage the entire candidate pipeline (stage moves, ratings, notes).",
      "Send candidate emails, manage offers, and convert accepted candidates to hires.",
      "View all applications and run job filter reports.",
    ],
    restrictions: [
      "Cannot delete jobs (Admin only). No access to HRIS employee records, payroll, or org-wide HR settings.",
      "Cannot access employee personal details beyond what is shown in the candidate/hire flow.",
    ],
  },
  {
    id: "hiring_manager",
    title: "Hiring Manager",
    tagline: "Per-job access: view pipeline, approve/reject offers for assigned jobs.",
    permissions: [
      "View candidates and pipeline for jobs they are assigned to as a hiring manager.",
      "Approve or reject offers and upload offer letters for their assigned jobs.",
      "Access candidate profiles and application history for their jobs.",
    ],
    restrictions: [
      "Cannot create or delete jobs. Cannot manage candidates outside their assigned jobs.",
      "No access to HR records, payroll, or broader ATS configuration.",
    ],
  },
  {
    id: "onboarding_specialist",
    title: "Onboarding Specialist",
    tagline: "Create and manage onboarding records; complete tasks on behalf of new hires.",
    permissions: [
      "Create, update, and delete onboarding records for new employees.",
      "Initiate onboarding from a hired candidate; add/remove tasks and section assignees.",
      "View and complete onboarding tasks; read onboarding templates.",
    ],
    restrictions: [
      "Cannot create or modify onboarding templates (Admin and HR only).",
      "No access to payroll, leave administration, or broader HR employee records.",
    ],
  },
  {
    id: "limited_hr",
    title: "Limited HR",
    tagline: "HR capabilities scoped to a specific department or office.",
    permissions: [
      "All standard HR capabilities (employee records, leave, change requests, reports) limited to their assigned scope.",
      "Approve leave and change requests for employees within their department or office.",
      "Run recruitment and onboarding workflows for their scoped population.",
    ],
    restrictions: [
      "Cannot act on employees outside their assigned department/office scope.",
      "Cannot modify org-wide settings (leave policies, templates, system config).",
    ],
  },
  {
    id: "limited_recruiter",
    title: "Limited Recruiter",
    tagline: "Recruiter powers scoped to specific job postings assigned to them.",
    permissions: [
      "Manage candidates and pipeline only for jobs they are explicitly assigned to.",
      "Send emails and progress applications within their assigned jobs.",
    ],
    restrictions: [
      "Cannot create new jobs or access jobs outside their assignment.",
      "No access to HR records, payroll, or org-wide recruitment settings.",
    ],
  },
  {
    id: "global_hr",
    title: "Global HR",
    tagline: "Cross-region scope grant for HR users — sees and acts on employees across all regions.",
    permissions: [
      "All standard HR capabilities (same as the hr role) extended to every region.",
      "Assign alongside the hr role; the hr role controls what they can do, this grant controls where.",
      "Can view, approve, and manage leave, change requests, benefits, and employee records in every region.",
    ],
    restrictions: [
      "No additional function access beyond what the hr role provides — this is a scope extension only.",
      "Cannot access admin-only settings (user management, system config) without the admin grant.",
    ],
  },
  {
    id: "global_it",
    title: "Global IT",
    tagline: "Cross-region scope grant for IT users — manages assets and systems across all regions.",
    permissions: [
      "All standard IT capabilities (same as the it role) extended to every region.",
      "Can manage stock, asset systems, and support tickets globally regardless of region.",
    ],
    restrictions: [
      "No additional function access beyond what the it role provides — this is a scope extension only.",
      "HR or admin functions require the matching grant.",
    ],
  },
  {
    id: "global_recruiter",
    title: "Global Recruiter",
    tagline: "Cross-region scope grant for recruiters — manages jobs and candidates across all regions.",
    permissions: [
      "All standard recruiter capabilities (same as the recruiter role) extended to every region.",
      "Can view, manage, and action job postings and candidates in every region.",
    ],
    restrictions: [
      "No additional function access beyond what the recruiter role provides — this is a scope extension only.",
      "HR or admin functions require the matching grant.",
    ],
  },
  {
    id: "employee",
    title: "Employee",
    tagline: "Self-service and collaboration; baseline access for every person with an account.",
    permissions: [
      "The user count here is everyone with a login. Privileges (admin, hr, it) are usually stored in the grants array; baseline stored role is employee (except the primary admin login).",
      "View and update own profile where permitted; request leave and manage own attendance check-in/out.",
      "Use tasks, news feed, onboarding tasks assigned to you, and other employee-facing modules.",
      "See a limited directory view of colleagues where the product allows.",
    ],
    restrictions: [
      "Cannot approve others\u2019 leave, change HR records, or access payroll administration.",
      "Module visibility may be further restricted by per-user \u201callowed modules\u201d (set by an admin).",
    ],
  },
];

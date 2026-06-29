import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import QRCode from "qrcode";
import { AuthRepository } from "./AuthRepository.js";
import { getDefaultTz } from "../../lib/timezone.js";
import { getEffectiveRole, mergeRolesWithOrgDerivedManager, normalizeRole, isRegionalSuperAdmin } from "../../lib/rbac.js";
import { hasSuperRegionAccess, SUPER_REGION_CODE } from "../../lib/regionAccess.js";
import { getRegionByBranchId, getEmployeeRegion } from "../../lib/regionAccess.js";
import { resolveUserEmployeeId } from "../../lib/resolveUserEmployeeId.js";
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from "../../core/types/index.js";
import { appendAuditLog, type AuditRequestMeta } from "../../lib/auditAppend.js";
import { ROLE_CATALOG, type SystemRoleId, isPrimaryAdminBaselineExceptionEmail } from "@shared/roleCatalog";
import {
  assertStrongBreakGlassPassword,
  buildOtpauthUrl,
  generateRecoveryCodeHashes,
  generateTotpSecret,
  matchRecoveryCode,
  verifyTotpCode,
} from "../../lib/breakGlassTotp.js";

export const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
export const MS_SSO_NO_ACCOUNT_MESSAGE =
  "This user has no account. Please contact HR to get access.";
const JWT_EXPIRES_IN = "7d";
const BREAK_GLASS_JWT_EXPIRES_IN = "10m";
const SALT_ROUNDS = 10;

export type BreakGlassPending = "password_change" | "totp_enroll" | "totp_verify";

/** The admin performing a user-management action (from req.user). */
export type UserMgmtActor = {
  id?: string;
  regionCode?: string | null;
  isRegionalSuperAdmin?: boolean;
};

/**
 * Region scope for user management.
 *   - Super Region admin (Pakistan) → null = all regions.
 *   - Region-less / HQ admin (no regionCode) → null = all (avoids bootstrap lockout).
 *   - Regional admin (US / IN-N / IN-S) → [their region] only.
 */
export function userMgmtRegionsFor(actor?: UserMgmtActor): string[] | null {
  if (!actor || actor.isRegionalSuperAdmin) return null;
  return actor.regionCode ? [actor.regionCode] : null;
}

export type AuthSessionPayload = {
  token: string;
  user: {
    id: string;
    email: string;
    role: ReturnType<typeof normalizeRole>;
    effectiveRole: string;
    roles: string[];
    employeeId: string | null;
    allowedModules: string[];
  };
};

export type LocalLoginResult = { pending: BreakGlassPending; tempToken: string } | AuthSessionPayload;

type BreakGlassStepJwt = "password" | "totp_setup" | "totp_verify";
// "manager" is intentionally absent: it is org-derived, not stored.
// Assigning manager via the API is rejected to enforce Freshteam-style behaviour.
const VALID_ROLES = [
  "admin", "hr", "limited_hr", "employee", "it",
  "recruiter", "hiring_manager", "onboarding_specialist", "limited_recruiter",
  // Scope grants — extend regional reach; never become primary/effective role
  "global_hr", "global_it", "global_recruiter",
];
const DEPRECATED_ROLES: Record<string, string> = {
  manager: "manager is automatically derived from org structure (reporting lines). Assign the employee role and add direct reports in the org chart.",
};

/** Roles that live in users.roles JSONB (grants). Used for baseline-employee enforcement. */
const PRIVILEGE_GRANTS = new Set([
  "admin", "hr", "limited_hr", "it",
  "recruiter", "hiring_manager", "onboarding_specialist", "limited_recruiter",
  // Scope grants — stored in users.roles JSONB alongside function grants
  "global_hr", "global_it", "global_recruiter",
]);

/** Grants that expand regional scope — only Super Region admins may assign these. */
const GLOBAL_SCOPE_GRANTS = new Set(["global_hr", "global_it", "global_recruiter"]);

/**
 * Merge an org-derived effectiveRole with the additional roles stored in users.roles.
 * "manager" is excluded from additional roles — it can only enter via org derivation.
 * Returns a deduplicated array: [effectiveRole, ...validAdditional].
 */
function mergeRolesArray(effectiveRole: string, dbRoles: string[] | null | undefined): string[] {
  const valid = new Set(VALID_ROLES);
  // always include manager as valid in merged array (org-derived)
  valid.add("manager");
  const additional = Array.isArray(dbRoles)
    ? dbRoles.filter((r) => valid.has(r) && r !== effectiveRole && r !== "manager")
    : [];
  return [effectiveRole, ...additional];
}

export const MS_CLIENT_ID = process.env.MS_CLIENT_ID || "";
export const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET || "";
export const MS_TENANT_ID = process.env.MS_TENANT_ID || "common";
export const MS_REDIRECT_URI = process.env.MS_REDIRECT_URI?.trim() || "http://localhost:5000/api/auth/microsoft/callback";
const MS_DELEGATED_CLIENT_ID = process.env.MS_DELEGATED_CLIENT_ID || "";
const MS_DELEGATED_CLIENT_SECRET = process.env.MS_DELEGATED_CLIENT_SECRET || "";
const MS_DELEGATED_REDIRECT_URI =
  process.env.MS_DELEGATED_REDIRECT_URI?.trim() ||
  MS_REDIRECT_URI.replace(/\/microsoft\/callback\/?$/i, "/microsoft/calendar/callback");
const MS_AUTHORITY = `https://login.microsoftonline.com/${MS_TENANT_ID}`;
/** SSO login — identity only (no calendar). */
const MS_LOGIN_SCOPES = "openid profile email User.Read offline_access";
/**
 * Interview calendar connect — least privilege per Graph (create events on /me/calendar).
 * @see https://learn.microsoft.com/en-us/graph/api/user-post-events
 */
const MS_CALENDAR_SCOPES = "offline_access Calendars.ReadWrite";

/** Sign in with Microsoft — always the main Azure app (MS_CLIENT_ID). */
const MS_SSO_CLIENT_ID = MS_CLIENT_ID;
const MS_SSO_CLIENT_SECRET = MS_CLIENT_SECRET;
const MS_SSO_REDIRECT_URI = MS_REDIRECT_URI;

/** Interview calendar — separate delegated Azure app (scheduler as meeting organizer). */
export const MS_INTERVIEW_CALENDAR_OAUTH_ENABLED = !!(MS_DELEGATED_CLIENT_ID && MS_DELEGATED_CLIENT_SECRET && MS_TENANT_ID);

function looksLikeAzureSecretId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

if (MS_DELEGATED_CLIENT_SECRET && looksLikeAzureSecretId(MS_DELEGATED_CLIENT_SECRET)) {
  console.warn(
    "[auth] MS_DELEGATED_CLIENT_SECRET looks like an Azure Secret ID (GUID). Use the secret Value from Certificates & secrets (shown once when created), not the Secret ID column.",
  );
}

export const MS_SSO_ENABLED = !!(MS_SSO_CLIENT_ID && MS_SSO_CLIENT_SECRET && MS_TENANT_ID);

export function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

export class AuthService {
  private readonly repo = new AuthRepository();

  private signBreakGlassToken(userId: string, step: BreakGlassStepJwt): string {
    return jwt.sign({ bg: true, step, sub: userId }, JWT_SECRET, { expiresIn: BREAK_GLASS_JWT_EXPIRES_IN });
  }

  private verifyBreakGlassToken(token: string, step: BreakGlassStepJwt): string {
    let d: { bg?: boolean; step?: string; sub?: string };
    try {
      d = jwt.verify(token, JWT_SECRET) as { bg?: boolean; step?: string; sub?: string };
    } catch {
      throw new ValidationError("Invalid or expired token", 401);
    }
    if (!d.bg || d.step !== step || typeof d.sub !== "string") {
      throw new ValidationError("Invalid or expired token", 401);
    }
    return d.sub;
  }

  private async assertBreakGlassAccountById(userId: string): Promise<void> {
    const u = await this.repo.findUserRow(userId);
    if (!u || !isPrimaryAdminBaselineExceptionEmail(String(u.email))) {
      throw new ForbiddenError("This action is only for the baseline break-glass account");
    }
  }

  /** Audit Logs module — Super Region admins only (mirrors requireSuperRegionAdmin). */
  private userCanAccessAuditLogs(params: {
    regionCode?: string | null;
    role?: string | null;
    roles?: string[] | null;
    email?: string | null;
  }): boolean {
    return hasSuperRegionAccess({
      regionCode: params.regionCode ?? null,
      role: params.role ?? null,
      roles: params.roles ?? null,
      email: params.email ?? null,
    });
  }

  private filterAllowedModules(modules: string[], canAccessAudit: boolean): string[] {
    if (canAccessAudit) return modules;
    return modules.filter((m) => m !== "audit");
  }

  private async resolveUserRegionCode(branchId: string | null | undefined, employeeId: string | null): Promise<string | null> {
    if (branchId) return (await getRegionByBranchId(branchId)) ?? null;
    if (employeeId) return (await getEmployeeRegion(employeeId)) ?? null;
    return null;
  }

  private async issueFullSession(userId: string): Promise<AuthSessionPayload> {
    const user = await this.repo.findUserRow(userId);
    if (!user) throw new ValidationError("User not found or inactive", 401);
    if (user.is_active !== true && user.is_active !== "true") throw new ValidationError("Account is deactivated", 401);
    const effRole = await getEffectiveRole({ id: user.id, email: user.email, role: user.role, employee_id: user.employee_id, roles: user.roles });
    const rolesArr = await mergeRolesWithOrgDerivedManager(mergeRolesArray(effRole, user.roles), user.employee_id);
    const token = jwt.sign({ userId: user.id, email: user.email, role: effRole, roles: rolesArr, employeeId: user.employee_id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: normalizeRole(user.role),
        effectiveRole: effRole,
        roles: rolesArr,
        employeeId: user.employee_id,
        allowedModules: Array.isArray(user.allowed_modules) ? user.allowed_modules : [],
      },
    };
  }

  async login(email: string, password: string): Promise<LocalLoginResult> {
    if (!email || !password) throw new ValidationError("Email and password are required");
    const user = await this.repo.findUserByEmail(email.toLowerCase().trim());
    if (!user) throw new ValidationError("Invalid email or password", 401);
    if (user.is_active !== true && user.is_active !== "true") throw new ValidationError("Account is deactivated", 401);
    if (!user.password_hash) throw new ValidationError("This account uses SSO login. Please use the SSO option.", 401);
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new ValidationError("Invalid email or password", 401);

    const emailNorm = String(user.email || "").trim().toLowerCase();
    const isBreakGlass = isPrimaryAdminBaselineExceptionEmail(emailNorm);

    if (isBreakGlass) {
      const mustChange = user.must_change_password === true || user.must_change_password === "true";
      if (mustChange) {
        return { pending: "password_change", tempToken: this.signBreakGlassToken(user.id, "password") };
      }
      // Break-glass account now supports simple email+password login without mandatory TOTP.
      await this.repo.updateLastLogin(user.id);
      return this.issueFullSession(user.id);
    }

    await this.repo.updateLastLogin(user.id);
    return this.issueFullSession(user.id);
  }

  async breakGlassSetPassword(tempToken: string, newPassword: string): Promise<AuthSessionPayload> {
    const userId = this.verifyBreakGlassToken(tempToken, "password");
    await this.assertBreakGlassAccountById(userId);
    try {
      assertStrongBreakGlassPassword(newPassword);
    } catch (e) {
      throw new ValidationError((e as Error).message);
    }
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.repo.updatePasswordHashBreakGlass(userId, hash, true);
    await this.repo.updateLastLogin(userId);
    return this.issueFullSession(userId);
  }

  async breakGlassTotpSetup(tempToken: string): Promise<{ otpauthUrl: string; qrDataUrl: string }> {
    const userId = this.verifyBreakGlassToken(tempToken, "totp_setup");
    await this.assertBreakGlassAccountById(userId);
    const u = await this.repo.findUserRow(userId);
    if (!u) throw new NotFoundError("User", userId);
    let row = await this.repo.getBreakGlassSecurityRow(userId);
    let secret = row?.totp_pending_secret;
    if (!secret) {
      secret = generateTotpSecret();
      await this.repo.setTotpPendingSecret(userId, secret);
    }
    const otpauthUrl = buildOtpauthUrl(String(u.email), secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { otpauthUrl, qrDataUrl };
  }

  async breakGlassConfirmTotp(
    tempToken: string,
    code: string,
  ): Promise<{ token: string; user: Exclude<LocalLoginResult, { pending: BreakGlassPending }>["user"]; recoveryCodes: string[] }> {
    const userId = this.verifyBreakGlassToken(tempToken, "totp_setup");
    await this.assertBreakGlassAccountById(userId);
    const row = await this.repo.getBreakGlassSecurityRow(userId);
    if (!row?.totp_pending_secret) {
      throw new ValidationError("Setup expired or not started. Open the setup step again.");
    }
    if (!verifyTotpCode(row.totp_pending_secret, code)) {
      throw new ValidationError("Invalid authenticator code", 401);
    }
    const { plain, hashes } = await generateRecoveryCodeHashes();
    await this.repo.finalizeTotpEnrollment(userId, hashes);
    await this.repo.updateLastLogin(userId);
    const session = await this.issueFullSession(userId);
    return { token: session.token, user: session.user, recoveryCodes: plain };
  }

  async breakGlassVerifyTotp(tempToken: string, code: string, recoveryCode?: string): Promise<AuthSessionPayload> {
    const userId = this.verifyBreakGlassToken(tempToken, "totp_verify");
    await this.assertBreakGlassAccountById(userId);
    const row = await this.repo.getBreakGlassSecurityRow(userId);
    if (!row?.totp_secret) throw new ValidationError("TOTP is not enabled for this account", 400);
    const recovery = (recoveryCode ?? "").trim();
    if (recovery) {
      const matched = await matchRecoveryCode(recovery, row.totp_recovery_codes_hash ?? []);
      if (!matched) throw new ValidationError("Invalid recovery code", 401);
      const next = [...(row.totp_recovery_codes_hash ?? [])];
      next.splice(matched.index, 1);
      await this.repo.updateTotpRecoveryHashes(userId, next);
    } else {
      if (!verifyTotpCode(row.totp_secret, code)) throw new ValidationError("Invalid authenticator code", 401);
    }
    await this.repo.updateLastLogin(userId);
    return this.issueFullSession(userId);
  }

  /**
   * Logged-in break-glass only: start TOTP rotation (new pending secret + QR).
   * Old TOTP still works until confirm.
   */
  async breakGlassTotpRotateStart(userId: string): Promise<{ otpauthUrl: string; qrDataUrl: string }> {
    await this.assertBreakGlassAccountById(userId);
    const row = await this.repo.getBreakGlassSecurityRow(userId);
    if (!row?.totp_enabled || !row.totp_secret) {
      throw new ValidationError("Authenticator is not active yet. Complete the initial sign-in setup first.");
    }
    const u = await this.repo.findUserRow(userId);
    if (!u) throw new NotFoundError("User", userId);
    const secret = generateTotpSecret();
    await this.repo.setTotpPendingSecret(userId, secret);
    const otpauthUrl = buildOtpauthUrl(String(u.email), secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { otpauthUrl, qrDataUrl };
  }

  /**
   * Logged-in break-glass only: confirm rotation with a code from the NEW authenticator entry.
   * Replaces active secret, clears pending, issues new recovery codes (returned once).
   */
  async breakGlassTotpRotateConfirm(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    await this.assertBreakGlassAccountById(userId);
    const row = await this.repo.getBreakGlassSecurityRow(userId);
    if (!row?.totp_pending_secret) {
      throw new ValidationError("Open “Rotate authenticator” first to generate a new QR code.");
    }
    if (!verifyTotpCode(row.totp_pending_secret, code)) {
      throw new ValidationError("Invalid authenticator code", 401);
    }
    const { plain, hashes } = await generateRecoveryCodeHashes();
    await this.repo.finalizeTotpEnrollment(userId, hashes);
    return { recoveryCodes: plain };
  }

  async getMe(token: string) {
    let decoded: { userId: string };
    try { decoded = jwt.verify(token, JWT_SECRET) as any; }
    catch { throw new ValidationError("Invalid token", 401); }
    const user = await this.repo.findUserById(decoded.userId);
    if (!user) throw new ValidationError("User not found or inactive", 401);
    const effRole = await getEffectiveRole({ id: user.id, email: user.email, role: user.role, employee_id: user.employee_id, roles: user.roles });
    const rolesArr = await mergeRolesWithOrgDerivedManager(mergeRolesArray(effRole, user.roles), user.employee_id);
    const row = user as Record<string, unknown>;
    const branchTz = typeof row.branch_time_zone === "string" ? row.branch_time_zone.trim() : "";
    const effectiveTz = branchTz.length > 0 ? branchTz : getDefaultTz();
    const branchDf = typeof row.branch_date_format === "string" ? row.branch_date_format.trim() : "";
    const effectiveDateFormat = branchDf.length > 0 ? branchDf : "dd/MM/yyyy";
    const employeeId = await resolveUserEmployeeId({
      employeeId: user.employee_id,
      email: user.email,
    });

    return {
      id: user.id,
      email: user.email,
      role: normalizeRole(user.role),
      effectiveRole: effRole,
      roles: rolesArr,
      employeeId,
      allowedModules: this.filterAllowedModules(
        Array.isArray(user.allowed_modules) ? user.allowed_modules : [],
        this.userCanAccessAuditLogs({
          regionCode: typeof row.branch_region_code === "string" && row.branch_region_code.trim()
            ? row.branch_region_code.trim()
            : null,
          role: user.role,
          roles: Array.isArray(user.roles) ? (user.roles as string[]) : [],
          email: user.email,
        }),
      ),
      firstName: user.first_name,
      lastName: user.last_name,
      nickname: user.nickname ?? null,
      avatar: user.avatar,
      /** IANA zone from employee's branch (fallback: DEFAULT_TIMEZONE or UTC). */
      timeZone: effectiveTz,
      /** Branch date display pattern (e.g. dd/MM/yyyy). */
      dateFormat: effectiveDateFormat,
      /** Multi-region access control: 'PK' | 'US' | 'IN-N' | 'IN-S' | null. */
      regionCode: typeof row.branch_region_code === "string" && row.branch_region_code.trim() ? row.branch_region_code.trim() : null,
      /** Pakistan Super Region admin — PK Admin automatic, or explicit grant. */
      isSuperRegionAdmin: hasSuperRegionAccess({
        regionCode: typeof row.branch_region_code === "string" && row.branch_region_code.trim()
          ? row.branch_region_code.trim()
          : null,
        role: user.role,
        roles: Array.isArray(user.roles) ? (user.roles as string[]) : [],
        email: user.email,
      }),
      isBreakGlassAccount: isPrimaryAdminBaselineExceptionEmail(user.email),
    };
  }

  /** Personal timezone preference removed; branch controls regional settings. */
  async updateMe(_userId: string, _body?: { timeZone?: unknown }) {
    return { ok: true };
  }

  /**
   * Grant/revoke Pakistan Super Region admin (regional_super_admin grant).
   * Only users whose primary role is `admin` are eligible.
   */
  async setSuperRegion(userId: string, grant: boolean, actor?: UserMgmtActor) {
    // Super Region is a cross-region (Pakistan/HQ) privilege — a scoped regional
    // admin must never grant it (would let them escalate a peer to see all regions).
    const actorIsSuper =
      actor?.isRegionalSuperAdmin === true ||
      !actor?.regionCode; // HQ / bootstrap admin with no region assigned
    if (!actorIsSuper) {
      throw new ForbiddenError(
        "Only Super Region admins (Pakistan admins or regional_super_admin grant) can manage Super Region access.",
      );
    }
    const target = await this.repo.findUserById(userId);
    if (!target) throw new ValidationError("User not found", 404);
    const targetGrants = Array.isArray(target.roles) ? (target.roles as string[]) : [];
    const targetIsAdmin =
      normalizeRole(target.role) === "admin" || targetGrants.includes("admin");
    if (!targetIsAdmin) {
      throw new ValidationError("Only users with the Admin role can be granted Super Region access");
    }
    const targetRegion = await this.repo.getUserRegion(userId);
    const targetIsPkAdmin =
      targetIsAdmin && targetRegion === SUPER_REGION_CODE;
    if (targetIsPkAdmin) {
      // Pakistan admins are automatically Super Region — grant toggle is a no-op for them.
      return { success: true, isSuperRegionAdmin: true, automatic: true };
    }
    const updated = await this.repo.setSuperRegionGrant(userId, !!grant);
    const roles = Array.isArray(updated?.roles) ? (updated!.roles as string[]) : [];
    const region = await this.repo.getUserRegion(userId);
    return {
      success: true,
      isSuperRegionAdmin: hasSuperRegionAccess({ regionCode: region, role: updated?.role, roles }),
    };
  }

  async register(email: string, password: string|undefined, role = "employee", employeeId?: string, authProvider?: string, branchId?: string | null, actor?: UserMgmtActor) {
    if (!email) throw new ValidationError("Email is required");
    const useMicrosoft = authProvider === "microsoft";
    if (!useMicrosoft && !password) throw new ValidationError("Password is required for non-Microsoft sign-in");
    if (!useMicrosoft && password && password.length < 8) throw new ValidationError("Password must be at least 8 characters");
    if (role && DEPRECATED_ROLES[role]) throw new ValidationError(DEPRECATED_ROLES[role]);
    if (role && !VALID_ROLES.includes(role)) throw new ValidationError(`Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`);
    const existing = await this.repo.findExistingUser(email.toLowerCase().trim());
    if (existing) throw new ConflictError("Email already registered");
    const passwordHash = useMicrosoft && !password ? null : await bcrypt.hash(password!, SALT_ROUNDS);
    const emailNorm = email.toLowerCase().trim();
    const isEx = isPrimaryAdminBaselineExceptionEmail(emailNorm);
    let primary = "employee";
    const grantRoles: string[] = [];
    if (isEx && role === "admin") primary = "admin";
    else if (PRIVILEGE_GRANTS.has(role)) grantRoles.push(role);
    // Region enforcement: regional admins may only create users within their own region.
    const resolvedBranchId = await this.resolveRegisterBranch(actor, branchId, employeeId || null);
    const user = await this.repo.createUser(emailNorm, passwordHash, primary, employeeId || null, useMicrosoft ? "microsoft" : "local", grantRoles, resolvedBranchId);
    return { message: "User registered successfully", user: { id: user.id, email: user.email, role: user.role, employeeId: user.employee_id } };
  }

  async listUsers(actor?: UserMgmtActor) {
    const regions = userMgmtRegionsFor(actor);
    const rows = await this.repo.listUsers(regions);
    return rows.map((r: any) => {
      const regionCode =
        typeof r.region_code === "string" && r.region_code.trim() ? r.region_code.trim() : null;
      const additionalRoles = Array.isArray(r.roles) ? r.roles : [];
      const isSuperRegionAdmin = this.userCanAccessAuditLogs({
        regionCode,
        role: r.role,
        roles: additionalRoles,
        email: r.email,
      });
      return {
      id: r.id,
      email: r.email,
      role: r.role,
      additionalRoles,
      employeeId: r.employee_id,
      isActive: r.is_active === true || r.is_active === "true",
      lastLoginAt: r.last_login_at,
      allowedModules: this.filterAllowedModules(
        Array.isArray(r.allowed_modules) ? r.allowed_modules : [],
        isSuperRegionAdmin,
      ),
      employeeName: r.first_name && r.last_name ? `${r.first_name} ${r.last_name}` : null,
      jobTitle: r.job_title,
      department: r.department,
      /** Direct branch on the login (drives region when set; else falls back to employee branch). */
      branchId: typeof r.branch_id === "string" && r.branch_id.trim() ? r.branch_id.trim() : null,
      /** Resolved region of this login (via own branch, else employee's branch). null = unassigned. */
      regionCode,
      /** Pakistan Super Region admin — PK Admin automatic, or explicit grant. */
      isSuperRegionAdmin,
    };
    });
  }

  /**
   * Guard: a regional admin may only manage users in their own region.
   * Super / HQ (region-less) admins pass. Throws ForbiddenError otherwise.
   */
  private async assertCanManageUser(actor: UserMgmtActor | undefined, targetUserId: string) {
    const regions = userMgmtRegionsFor(actor);
    if (regions === null) return; // all regions
    const targetRegion = await this.repo.getUserRegion(targetUserId);
    if (!targetRegion || !regions.includes(targetRegion)) {
      throw new ForbiddenError("This user belongs to a different region.");
    }
  }

  /**
   * Resolve the region a new user will land in (from explicit branch, else linked employee),
   * and enforce that a regional admin can only create within their own region.
   * Returns the branchId to persist (derived from the employee when not supplied).
   */
  private async resolveRegisterBranch(
    actor: UserMgmtActor | undefined,
    branchId: string | null | undefined,
    employeeId: string | null | undefined,
  ): Promise<string | null> {
    const allowed = userMgmtRegionsFor(actor);
    let targetRegion: string | null = null;
    if (branchId) targetRegion = await getRegionByBranchId(branchId);
    else if (employeeId) targetRegion = await getEmployeeRegion(employeeId);

    if (allowed !== null) {
      // Regional admin: a region must be resolvable and must match their own.
      if (!targetRegion || !allowed.includes(targetRegion)) {
        throw new ForbiddenError(
          "You can only create users in your own region. Pick a branch/employee in your region.",
        );
      }
    }
    return branchId || null;
  }

  /**
   * Resolve branch_id on user update. undefined = leave unchanged; null = clear (inherit employee branch).
   */
  private async resolveUpdateBranch(
    actor: UserMgmtActor | undefined,
    branchId: string | null | undefined,
    employeeId: string | null,
  ): Promise<string | null | undefined> {
    if (branchId === undefined) return undefined;
    const allowed = userMgmtRegionsFor(actor);
    let targetRegion: string | null = null;
    if (branchId) targetRegion = await getRegionByBranchId(branchId);
    else if (employeeId) targetRegion = await getEmployeeRegion(employeeId);

    if (allowed !== null) {
      if (branchId && (!targetRegion || !allowed.includes(targetRegion))) {
        throw new ForbiddenError("You can only assign branches in your own region.");
      }
      if (!branchId && employeeId && targetRegion && !allowed.includes(targetRegion)) {
        throw new ForbiddenError("Linked employee is outside your region.");
      }
    }
    return branchId || null;
  }

  /** Admin: role catalog with live user counts for Settings → Manage roles. */
  async getRoleCatalog() {
    const grantRoles = [
      "admin", "hr", "limited_hr", "it",
      "recruiter", "hiring_manager", "onboarding_specialist", "limited_recruiter",
      "global_hr", "global_it", "global_recruiter",
    ];
    const [rows, allUsers, ...grantCountsArr] = await Promise.all([
      this.repo.countUsersByRole(),
      this.repo.countAllUsers(),
      ...grantRoles.map((g) => this.repo.countUsersWithGrant(g)),
    ]);
    const byRole = new Map<string, { total: number; active: number }>();
    for (const row of rows) {
      byRole.set(row.role, { total: row.total, active: row.active });
    }
    const grantCounts: Record<string, { total: number; active: number }> = {};
    for (let i = 0; i < grantRoles.length; i++) {
      grantCounts[grantRoles[i]] = grantCountsArr[i];
    }
    const roles = ROLE_CATALOG.map((def) => {
      // Freshteam-style: "Employee" headcount is everyone with an account (admins, HR, IT included).
      if (def.id === "employee") {
        return {
          ...def,
          userCount: allUsers.total,
          activeUserCount: allUsers.active,
          countScope: "all_users" as const,
        };
      }
      if (def.orgDerived) {
        const c = byRole.get(def.id);
        return {
          ...def,
          userCount: c?.total ?? 0,
          activeUserCount: c?.active ?? 0,
          countScope: "stored_role" as const,
        };
      }
      const g = grantCounts[def.id];
      if (g) {
        return {
          ...def,
          userCount: g.total,
          activeUserCount: g.active,
          countScope: "grant_or_primary" as const,
        };
      }
      const c = byRole.get(def.id);
      return {
        ...def,
        userCount: c?.total ?? 0,
        activeUserCount: c?.active ?? 0,
        countScope: "stored_role" as const,
      };
    });
    const knownIds = new Set<SystemRoleId>(ROLE_CATALOG.map((r) => r.id));
    const otherRoles: Array<{ role: string; userCount: number; activeUserCount: number }> = [];
    for (const row of rows) {
      if (!knownIds.has(row.role as SystemRoleId)) {
        otherRoles.push({ role: row.role, userCount: row.total, activeUserCount: row.active });
      }
    }
    return { roles, otherRoles };
  }

  async updateUser(
    id: string,
    data: { role?: string; employeeId?: string|null; branchId?: string|null; isActive?: boolean; allowedModules?: any[]; additionalRoles?: string[] },
    currentUserId?: string,
    meta?: AuditRequestMeta,
    actor?: UserMgmtActor,
  ) {
    await this.assertCanManageUser(actor, id);
    const current = await this.repo.findUserRow(id);
    if (!current) throw new NotFoundError("User", id);

    const newEmployeeId = data.employeeId !== undefined ? (data.employeeId === "" || data.employeeId === null ? null : data.employeeId) : current.employee_id;
    const resolvedBranchId = await this.resolveUpdateBranch(actor, data.branchId, newEmployeeId);
    // If branch change moves user to another region, re-check actor may manage that region.
    if (resolvedBranchId !== undefined) {
      let newRegion: string | null = null;
      if (resolvedBranchId) newRegion = await getRegionByBranchId(resolvedBranchId);
      else if (newEmployeeId) newRegion = await getEmployeeRegion(newEmployeeId);
      const allowed = userMgmtRegionsFor(actor);
      if (allowed !== null && newRegion && !allowed.includes(newRegion)) {
        throw new ForbiddenError("You can only assign branches in your own region.");
      }
    }
    if (data.role !== undefined && DEPRECATED_ROLES[data.role]) throw new ValidationError(DEPRECATED_ROLES[data.role]);
    const email = String(current.email || "").trim().toLowerCase();
    const isEx = isPrimaryAdminBaselineExceptionEmail(email);

    let newRole = data.role !== undefined && VALID_ROLES.includes(data.role) ? data.role : current.role;
    const newIsActive = typeof data.isActive === "boolean" ? data.isActive : (current.is_active === true || current.is_active === "true");
    const newAllowedModulesRaw = data.allowedModules !== undefined ? (Array.isArray(data.allowedModules) ? data.allowedModules : []) : (Array.isArray(current.allowed_modules) ? current.allowed_modules : []);
    const currentAdditional: string[] = Array.isArray(current.roles) ? (current.roles as string[]) : [];
    let newAdditional = data.additionalRoles !== undefined
      ? data.additionalRoles.filter((r: string) => VALID_ROLES.includes(r))
      : currentAdditional.filter((r: string) => VALID_ROLES.includes(r));

    // Guard: only Super Region admins may add or remove global scope grants.
    // A regional admin (non-super) must never be able to escalate cross-region scope.
    const actorIsSuper = !actor || actor.isRegionalSuperAdmin === true || !actor.regionCode;
    if (!actorIsSuper && data.additionalRoles !== undefined) {
      const prevScopeGrants = currentAdditional.filter((r) => GLOBAL_SCOPE_GRANTS.has(r));
      const nextScopeGrants = newAdditional.filter((r) => GLOBAL_SCOPE_GRANTS.has(r));
      const scopeChanged =
        prevScopeGrants.sort().join(",") !== nextScopeGrants.sort().join(",");
      if (scopeChanged) {
        throw new ForbiddenError(
          "Only Super Region admins can grant or revoke cross-region scope (global_hr, global_it, global_recruiter).",
        );
      }
    }

    if (!isEx) {
      // Baseline model: stored primary is always 'employee'; all privileges live in grants.
      const grants = new Set<string>();
      if (PRIVILEGE_GRANTS.has(newRole)) grants.add(newRole);
      for (const r of newAdditional) {
        if (r !== "employee" && r !== "manager") grants.add(r);
      }
      newRole = "employee";
      newAdditional = Array.from(grants);
    } else {
      // Exception account: primary break-glass email keeps 'admin' as primary.
      if (newRole !== "admin" && PRIVILEGE_GRANTS.has(newRole)) {
        const g = new Set<string>(newAdditional);
        g.add(newRole);
        newAdditional = Array.from(g).filter((r: string) => r !== "employee" && r !== "manager");
        newRole = "admin";
      }
      if (newRole === "admin") {
        newAdditional = newAdditional.filter((r: string) => r !== "admin");
      }
    }

    const branchForRegion =
      resolvedBranchId !== undefined ? resolvedBranchId : (current.branch_id as string | null) ?? null;
    const targetRegionCode = await this.resolveUserRegionCode(branchForRegion, newEmployeeId);
    const targetCanAccessAudit = this.userCanAccessAuditLogs({
      regionCode: targetRegionCode,
      role: newRole,
      roles: newAdditional,
      email: current.email,
    });
    let newAllowedModules = this.filterAllowedModules(newAllowedModulesRaw, targetCanAccessAudit);
    if (actor && actor.isRegionalSuperAdmin !== true && actor.regionCode) {
      newAllowedModules = newAllowedModules.filter((m) => m !== "audit");
    }

    await this.repo.updateUser(id, {
      role: newRole,
      employeeId: newEmployeeId,
      branchId: resolvedBranchId,
      isActive: newIsActive,
      allowedModules: newAllowedModules,
      additionalRoles: newAdditional,
    });

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (String(current.role) !== String(newRole)) changes.primaryRole = { from: current.role, to: newRole };
    if (String(current.employee_id ?? "") !== String(newEmployeeId ?? "")) changes.employeeId = { from: current.employee_id, to: newEmployeeId };
    if (resolvedBranchId !== undefined && String(current.branch_id ?? "") !== String(resolvedBranchId ?? "")) {
      changes.branchId = { from: current.branch_id ?? null, to: resolvedBranchId };
    }
    const prevActive = current.is_active === true || current.is_active === "true";
    if (prevActive !== newIsActive) changes.isActive = { from: prevActive, to: newIsActive };
    const prevMods = JSON.stringify(Array.isArray(current.allowed_modules) ? current.allowed_modules : []);
    const nextMods = JSON.stringify(newAllowedModules);
    if (prevMods !== nextMods) changes.allowedModules = { from: current.allowed_modules, to: newAllowedModules };
    const prevAdd = JSON.stringify([...(currentAdditional as string[])].sort());
    const nextAdd = JSON.stringify([...newAdditional].sort());
    if (prevAdd !== nextAdd) changes.additionalRoles = { from: currentAdditional, to: newAdditional };

    if (Object.keys(changes).length > 0) {
      const actor = currentUserId ?? "system";
      await appendAuditLog({
        entityType: "user",
        entityId: id,
        action: "USER_UPDATE",
        performedBy: actor,
        details: { email: current.email, changes },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      });
    }

    return { user: { id, email: current.email, role: newRole, additionalRoles: newAdditional, employeeId: newEmployeeId, isActive: newIsActive, allowedModules: newAllowedModules } };
  }

  async deleteUser(id: string, currentUserId?: string, meta?: AuditRequestMeta, actor?: UserMgmtActor) {
    if (currentUserId && id === currentUserId) throw new ValidationError("You cannot delete your own account");
    await this.assertCanManageUser(actor, id);
    const existing = await this.repo.findUserRow(id);
    if (!existing) throw new NotFoundError("User", id);
    const email = existing.email;
    if (currentUserId) {
      await this.repo.reassignEmployeeProfileChangesActor(id, currentUserId);
    }
    await this.repo.deleteUser(id);
    await appendAuditLog({
      entityType: "user",
      entityId: id,
      action: "USER_DELETE",
      performedBy: currentUserId ?? "system",
      details: { email },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
  }

  async changePassword(token: string, currentPassword: string, newPassword: string) {
    if (!newPassword) throw new ValidationError("New password is required");
    let decoded: { userId: string };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as any;
    } catch {
      throw new ValidationError("Invalid token", 401);
    }
    const row = await this.repo.findUserRow(decoded.userId);
    if (!row) throw new NotFoundError("User", decoded.userId);
    if (isPrimaryAdminBaselineExceptionEmail(String(row.email ?? ""))) {
      try {
        assertStrongBreakGlassPassword(newPassword);
      } catch (e) {
        throw new ValidationError((e as Error).message);
      }
    } else if (newPassword.length < 8) {
      throw new ValidationError("New password must be at least 8 characters");
    }
    const user = await this.repo.findPasswordHash(decoded.userId);
    if (!user) throw new NotFoundError("User", decoded.userId);

    // Break-glass exception: when account is SSO-only (no existing local password),
    // allow setting an initial local password from an authenticated session.
    if (isPrimaryAdminBaselineExceptionEmail(String(row.email ?? "")) && !user.password_hash) {
      await this.repo.updatePasswordHash(decoded.userId, await bcrypt.hash(newPassword, SALT_ROUNDS));
      return { message: "Local password enabled successfully" };
    }

    if (!currentPassword) throw new ValidationError("Current password is required");
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new ValidationError("Current password is incorrect", 401);
    await this.repo.updatePasswordHash(decoded.userId, await bcrypt.hash(newPassword, SALT_ROUNDS));
    return { message: "Password changed successfully" };
  }

  // Microsoft SSO — main app only (MS_CLIENT_ID). Interview calendar uses MS_DELEGATED_* separately.
  getMicrosoftAuthUrl(state: string) {
    if (!MS_SSO_CLIENT_ID) throw new ValidationError("Microsoft SSO is not configured", 501);
    const params = new URLSearchParams({ client_id: MS_SSO_CLIENT_ID, response_type: "code", redirect_uri: MS_SSO_REDIRECT_URI, response_mode: "query", scope: MS_LOGIN_SCOPES, state, prompt: "select_account" });
    return `${MS_AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  /** Connect delegated calendar app (interview scheduling on the scheduler's mailbox). */
  getMicrosoftCalendarAuthUrl(state: string) {
    if (!MS_INTERVIEW_CALENDAR_OAUTH_ENABLED) {
      throw new ValidationError("Interview calendar Microsoft app is not configured", 501);
    }
    if (looksLikeAzureSecretId(MS_DELEGATED_CLIENT_SECRET)) {
      throw new ValidationError(
        "MS_DELEGATED_CLIENT_SECRET looks like a Secret ID (GUID). In Azure → HR Project Delegated → Certificates & secrets, copy the secret Value (not the ID).",
        501,
      );
    }
    const params = new URLSearchParams({
      client_id: MS_DELEGATED_CLIENT_ID,
      response_type: "code",
      redirect_uri: MS_DELEGATED_REDIRECT_URI,
      response_mode: "query",
      scope: MS_CALENDAR_SCOPES,
      state,
    });
    return `${MS_AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async handleMicrosoftCalendarCallback(code: string, userId: string) {
    if (!MS_INTERVIEW_CALENDAR_OAUTH_ENABLED) {
      throw new ValidationError("Interview calendar Microsoft app is not configured", 501);
    }
    const tokenResponse = await fetch(`${MS_AUTHORITY}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MS_DELEGATED_CLIENT_ID,
        client_secret: MS_DELEGATED_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: MS_DELEGATED_REDIRECT_URI,
      }),
    });
    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      let errMsg = "Calendar token exchange failed";
      try {
        const j = JSON.parse(errText) as { error_description?: string; error?: string };
        errMsg = j.error_description || j.error || errMsg;
      } catch {
        errMsg = `${errMsg}: ${errText.slice(0, 240)}`;
      }
      console.error("[auth] Calendar token exchange failed:", tokenResponse.status, errText.slice(0, 500));
      throw new Error(errMsg);
    }
    const tokens = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error("No calendar refresh token received — grant consent for calendar access");
    }
    const expiresIn = typeof tokens.expires_in === "number" ? tokens.expires_in : 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    await this.repo.saveMicrosoftCalendarTokens(userId, tokens.access_token, tokens.refresh_token, expiresAt);
  }

  async handleMicrosoftCallback(code: string) {
    const tokenResponse = await fetch(`${MS_AUTHORITY}/oauth2/v2.0/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: MS_SSO_CLIENT_ID, client_secret: MS_SSO_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: MS_SSO_REDIRECT_URI, scope: MS_LOGIN_SCOPES }),
    });
    if (!tokenResponse.ok) throw new Error("Token exchange failed");
    const tokens = await tokenResponse.json();
    if (!tokens.access_token) throw new Error("No access token received");
    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!profileResponse.ok) throw new Error("Failed to fetch profile");
    const msProfile = await profileResponse.json();
    const msEmail = (msProfile.mail || msProfile.userPrincipalName || "").toLowerCase().trim();
    if (!msEmail) throw new Error("No email found in Microsoft account");

    let user: any = await this.repo.findUserByEmail(msEmail);
    if (user) {
      if (user.is_active !== true && user.is_active !== "true") throw new ValidationError("Account is deactivated", 401);
      if (!user.employee_id) {
        const emp = await this.repo.findEmployeeByWorkEmail(msEmail);
        if (emp) {
          const owner = await this.repo.findUserByEmployeeId(emp.id);
          if (owner && owner.id !== user.id) {
            if (owner.is_active !== true && owner.is_active !== "true") {
              throw new ValidationError("Account is deactivated", 401);
            }
            await this.repo.syncMicrosoftUser(owner.id, msEmail);
            user = { ...owner, email: msEmail };
          } else {
            await this.repo.linkEmployeeToUser(user.id, emp.id);
            user.employee_id = emp.id;
            await this.repo.syncMicrosoftUser(user.id, msEmail);
          }
        } else {
          await this.repo.syncMicrosoftUser(user.id, msEmail);
        }
      } else {
        await this.repo.syncMicrosoftUser(user.id, msEmail);
      }
    } else {
      const emp = await this.repo.findEmployeeByWorkEmail(msEmail);
      if (!emp) {
        throw new ValidationError(MS_SSO_NO_ACCOUNT_MESSAGE, 401);
      }
      const employeeId = emp.id;
      const existing = await this.repo.findUserByEmployeeId(employeeId);
      if (existing) {
        if (existing.is_active !== true && existing.is_active !== "true") throw new ValidationError("Account is deactivated", 401);
        await this.repo.syncMicrosoftUser(existing.id, msEmail);
        user = { ...existing, email: msEmail };
      } else {
        try {
          user = await this.repo.createMicrosoftUser(msEmail, employeeId);
        } catch (e: unknown) {
          const code = (e as { code?: string })?.code;
          if (code === "23505" && employeeId) {
            const retry = await this.repo.findUserByEmployeeId(employeeId);
            if (!retry) throw e;
            if (retry.is_active !== true && retry.is_active !== "true") {
              throw new ValidationError("Account is deactivated", 401);
            }
            await this.repo.syncMicrosoftUser(retry.id, msEmail);
            user = { ...retry, email: msEmail };
          } else {
            throw e;
          }
        }
      }
    }

    const expiresIn = typeof tokens.expires_in === "number" ? tokens.expires_in : 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    if (tokens.refresh_token) {
      await this.repo.saveMicrosoftTokens(user.id, tokens.access_token, tokens.refresh_token, expiresAt);
    }

    const token = jwt.sign({ userId: user.id, email: user.email || msEmail, role: user.role, roles: [user.role], employeeId: user.employee_id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return token;
  }

  /**
   * Main-app Graph token (SSO login). Used by timezone meetings etc.
   */
  async getValidMicrosoftAccessToken(userId: string): Promise<string | null> {
    const tokens = await this.repo.getMicrosoftTokens(userId);
    if (!tokens?.refreshToken) return null;
    return this.refreshMicrosoftOAuthToken(tokens, MS_SSO_CLIENT_ID, MS_SSO_CLIENT_SECRET, MS_LOGIN_SCOPES, async (access, refresh, expires) => {
      await this.repo.saveMicrosoftTokens(userId, access, refresh, expires);
    });
  }

  /**
   * Delegated-app Graph token for interview calendar (scheduler as organizer).
   */
  async getValidInterviewCalendarAccessToken(userId: string): Promise<string | null> {
    if (!MS_INTERVIEW_CALENDAR_OAUTH_ENABLED) return null;
    const tokens = await this.repo.getMicrosoftCalendarTokens(userId);
    if (!tokens?.refreshToken) return null;
    return this.refreshMicrosoftOAuthToken(tokens, MS_DELEGATED_CLIENT_ID, MS_DELEGATED_CLIENT_SECRET, MS_CALENDAR_SCOPES, async (access, refresh, expires) => {
      await this.repo.saveMicrosoftCalendarTokens(userId, access, refresh, expires);
    });
  }

  async hasInterviewCalendarConnected(userId: string): Promise<boolean> {
    if (!MS_INTERVIEW_CALENDAR_OAUTH_ENABLED) return false;
    const tokens = await this.repo.getMicrosoftCalendarTokens(userId);
    return !!tokens?.refreshToken;
  }

  async disconnectInterviewCalendar(userId: string): Promise<void> {
    await this.repo.clearMicrosoftCalendarTokens(userId);
  }

  private async refreshMicrosoftOAuthToken(
    tokens: { accessToken: string; refreshToken: string; expiresAt: Date },
    clientId: string,
    clientSecret: string,
    scopes: string,
    save: (accessToken: string, refreshToken: string, expiresAt: Date) => Promise<void>,
  ): Promise<string | null> {
    const bufferMs = 5 * 60 * 1000;
    if (tokens.accessToken && tokens.expiresAt.getTime() > Date.now() + bufferMs) {
      return tokens.accessToken;
    }

    const refreshRes = await fetch(`${MS_AUTHORITY}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
        scope: scopes,
      }),
    });
    if (!refreshRes.ok) return null;
    const data = (await refreshRes.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    await save(data.access_token, data.refresh_token || tokens.refreshToken, expiresAt);
    return data.access_token;
  }
}

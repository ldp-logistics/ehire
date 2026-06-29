import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { AuthService, getCookieOptions, JWT_SECRET, MS_CLIENT_ID, MS_SSO_ENABLED, MS_SSO_NO_ACCOUNT_MESSAGE, MS_TENANT_ID, MS_INTERVIEW_CALENDAR_OAUTH_ENABLED, type UserMgmtActor } from "./AuthService.js";
import { OnboardingRepository } from "../onboarding/OnboardingRepository.js";
import { OffboardingRepository } from "../offboarding/OffboardingRepository.js";
import { AuthRepository } from "./AuthRepository.js";
import { ValidationError } from "../../core/types/index.js";
import { appendAuditLog, getClientAuditMeta } from "../../lib/auditAppend.js";
import { hasActiveInterviewDuties } from "../../lib/policy.js";
import { COOKIE_NAME, getSessionTokenFromRequest } from "../../middleware/auth.js";

function grantsFromUserRow(u: { role?: string; roles?: unknown }): Set<string> {
  const s = new Set<string>();
  if (u?.role) s.add(String(u.role).toLowerCase().trim());
  const raw = u?.roles;
  if (Array.isArray(raw)) {
    for (const x of raw) s.add(String(x).toLowerCase().trim());
  }
  return s;
}

export class AuthController {
  private readonly svc = new AuthService();
  private readonly authRepo = new AuthRepository();
  private readonly onboardingRepo = new OnboardingRepository();
  private readonly offboardingRepo = new OffboardingRepository();
  constructor() { const b = (c: any) => { for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(c))) if (k !== "constructor" && typeof c[k] === "function") c[k] = c[k].bind(c); }; b(this); }

  /** Pull the region-scoping actor (region + super-region flag) off req.user for user-management calls. */
  private actorFrom(req: Request): UserMgmtActor {
    const u = (req as any).user;
    return {
      id: u?.id,
      regionCode: u?.regionCode ?? null,
      isRegionalSuperAdmin: u?.isRegionalSuperAdmin === true,
    };
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const meta = getClientAuditMeta(req);
      const result = await this.svc.login(email, password);
      if ("pending" in result) {
        await appendAuditLog({
          entityType: "auth",
          entityId: email?.trim()?.toLowerCase() || "unknown",
          action: "BREAK_GLASS_LOGIN_STEP",
          performedBy: "anonymous",
          details: { pending: result.pending, method: "local" },
          ...meta,
        });
        res.json({ pending: result.pending, tempToken: result.tempToken });
        return;
      }
      await appendAuditLog({
        entityType: "auth",
        entityId: result.user.id,
        action: "LOGIN_SUCCESS",
        performedBy: result.user.id,
        details: { email: result.user.email, method: "local" },
        ...meta,
      });
      res.cookie(COOKIE_NAME, result.token, getCookieOptions());
      res.json({ message: "Login successful", token: result.token, user: result.user });
    } catch (e) {
      if (e instanceof ValidationError && e.statusCode === 401) {
        const raw = typeof req.body?.email === "string" ? req.body.email : "";
        const emailTry = raw.toLowerCase().trim() || "unknown";
        await appendAuditLog({
          entityType: "auth",
          entityId: emailTry,
          action: "LOGIN_FAILURE",
          performedBy: "anonymous",
          details: { email: raw.trim() || null, reason: e.message },
          ...getClientAuditMeta(req),
        });
      }
      next(e);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      let performedBy = "anonymous";
      try {
        const token = getSessionTokenFromRequest(req);
        if (token) {
          const decoded = jwt.verify(token, JWT_SECRET) as { userId?: string };
          if (decoded.userId) performedBy = decoded.userId;
        }
      } catch {
        /* invalid or expired cookie */
      }
      await appendAuditLog({
        entityType: "auth",
        entityId: performedBy,
        action: "LOGOUT",
        performedBy,
        details: {},
        ...getClientAuditMeta(req),
      });
      res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
      res.json({ message: "Logged out successfully" });
    } catch (e) {
      next(e);
    }
  }

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const token = getSessionTokenFromRequest(req);
      if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
      const user = await this.svc.getMe(token);
      res.json(user);
    } catch (e: any) {
      if (e.statusCode === 401 || e.message === "Invalid token") { res.clearCookie(COOKIE_NAME); res.status(401).json({ error: e.message }); return; }
      next(e);
    }
  }

  /** GET /api/auth/assignment-visibility — assignee flags + which primary nav modules to show (mirrors sidebar). */
  async assignmentVisibility(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      const empty = {
        showOnboardingAsAssignee: false,
        showOffboardingAsAssignee: false,
        showRecruitmentNav: false,
        showOnboardingNav: false,
        showOffboardingNav: false,
      };
      if (!userId) {
        res.json(empty);
        return;
      }
      const userRow = await this.authRepo.findUserRow(userId);
      if (!userRow) {
        res.json(empty);
        return;
      }
      const grants = grantsFromUserRow(userRow as { role?: string; roles?: unknown });
      const orgWideRecruit =
        grants.has("admin") ||
        grants.has("hr") ||
        grants.has("limited_hr") ||
        grants.has("recruiter");
      const hasJob = await this.authRepo.hasAnyJobAssignment(userId);
      const activeInterviewDuties = await hasActiveInterviewDuties(userId);
      const limitedRecruiterOnly =
        grants.has("limited_recruiter") &&
        !grants.has("recruiter") &&
        !grants.has("hr") &&
        !grants.has("admin");
      const hiringManagerOrManagerOnly =
        (grants.has("hiring_manager") || grants.has("manager")) &&
        !grants.has("recruiter") &&
        !grants.has("hr") &&
        !grants.has("admin");
      const strictAssignedJobScope = limitedRecruiterOnly || hiringManagerOrManagerOnly;
      const showRecruitmentNav =
        orgWideRecruit ||
        hasJob ||
        (!strictAssignedJobScope && activeInterviewDuties);

      const u = userRow as { email?: string; employee_id?: string | null };
      let employeeId = u.employee_id ?? null;
      if (!employeeId && u.email) {
        const email = String(u.email).toLowerCase().trim();
        const emp = await this.authRepo.findEmployeeByEmail(email);
        employeeId = emp?.id ?? null;
      }
      let showOnboardingAsAssignee = false;
      let showOffboardingAsAssignee = false;
      if (employeeId) {
        [showOnboardingAsAssignee, showOffboardingAsAssignee] = await Promise.all([
          this.onboardingRepo.hasInProgressAssignments(employeeId),
          this.offboardingRepo.hasActiveTaskAssignments(employeeId),
        ]);
      }
      const showOnboardingNav =
        grants.has("admin") ||
        grants.has("hr") ||
        grants.has("limited_hr") ||
        grants.has("onboarding_specialist") ||
        showOnboardingAsAssignee;
      const showOffboardingNav =
        grants.has("admin") || grants.has("hr") || grants.has("limited_hr") || showOffboardingAsAssignee;

      res.json({
        showOnboardingAsAssignee,
        showOffboardingAsAssignee,
        showRecruitmentNav,
        showOnboardingNav,
        showOffboardingNav,
      });
    } catch (e) { next(e); }
  }

  async updateMe(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
      res.json(await this.svc.updateMe(userId));
    } catch (e) { next(e); }
  }

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, role, employeeId, authProvider, branchId } = req.body;
      const actorId = (req as any).user?.id ?? "system";
      const result = await this.svc.register(email, password, role, employeeId, authProvider, branchId, this.actorFrom(req));
      await appendAuditLog({
        entityType: "user",
        entityId: result.user.id,
        action: "USER_CREATE",
        performedBy: actorId,
        details: {
          email: result.user.email,
          role,
          employeeId: employeeId ?? null,
          authProvider: authProvider ?? "local",
        },
        ...getClientAuditMeta(req),
      });
      res.status(201).json(result);
    } catch (e) { next(e); }
  }

  async listUsers(req: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.listUsers(this.actorFrom(req))); } catch (e) { next(e); }
  }

  async roleCatalog(_req: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.getRoleCatalog()); } catch (e) { next(e); }
  }

  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await this.svc.updateUser(req.params.id, req.body, (req as any).user?.id, getClientAuditMeta(req), this.actorFrom(req)));
    } catch (e) { next(e); }
  }

  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      await this.svc.deleteUser(req.params.id, (req as any).user?.id, getClientAuditMeta(req), this.actorFrom(req));
      res.status(204).send();
    } catch (e) { next(e); }
  }

  /** PATCH /api/auth/users/:id/super-region — grant/revoke Pakistan Super Region admin. */
  async setSuperRegion(req: Request, res: Response, next: NextFunction) {
    try {
      const grant = req.body?.grant === true || req.body?.grant === "true";
      const result = await this.svc.setSuperRegion(req.params.id, grant, this.actorFrom(req));
      await appendAuditLog({
        entityType: "user",
        entityId: req.params.id,
        action: grant ? "USER_GRANT_SUPER_REGION" : "USER_REVOKE_SUPER_REGION",
        performedBy: (req as any).user?.id ?? "system",
        details: { grant },
        ...getClientAuditMeta(req),
      });
      res.json(result);
    } catch (e: any) {
      if (e?.statusCode) return res.status(e.statusCode).json({ error: e.message });
      next(e);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const token = getSessionTokenFromRequest(req);
      if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
      res.json(await this.svc.changePassword(token, req.body.currentPassword, req.body.newPassword));
    } catch (e) { next(e); }
  }

  async breakGlassSetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { tempToken, newPassword } = req.body ?? {};
      if (!tempToken || !newPassword) {
        res.status(400).json({ error: "tempToken and newPassword are required" });
        return;
      }
      const out = await this.svc.breakGlassSetPassword(String(tempToken), String(newPassword));
      res.cookie(COOKIE_NAME, out.token, getCookieOptions());
      res.json({ status: "complete", token: out.token, user: out.user });
    } catch (e) {
      next(e);
    }
  }

  async breakGlassTotpSetup(req: Request, res: Response, next: NextFunction) {
    try {
      const tempToken = req.body?.tempToken;
      if (!tempToken) {
        res.status(400).json({ error: "tempToken is required" });
        return;
      }
      const out = await this.svc.breakGlassTotpSetup(String(tempToken));
      res.json(out);
    } catch (e) {
      next(e);
    }
  }

  async breakGlassTotpConfirm(req: Request, res: Response, next: NextFunction) {
    try {
      const { tempToken, code } = req.body ?? {};
      if (!tempToken || !code) {
        res.status(400).json({ error: "tempToken and code are required" });
        return;
      }
      const meta = getClientAuditMeta(req);
      const out = await this.svc.breakGlassConfirmTotp(String(tempToken), String(code));
      await appendAuditLog({
        entityType: "auth",
        entityId: out.user.id,
        action: "BREAK_GLASS_TOTP_ENROLLED",
        performedBy: out.user.id,
        details: { email: out.user.email },
        ...meta,
      });
      res.cookie(COOKIE_NAME, out.token, getCookieOptions());
      await appendAuditLog({
        entityType: "auth",
        entityId: out.user.id,
        action: "LOGIN_SUCCESS",
        performedBy: out.user.id,
        details: { email: out.user.email, method: "local_break_glass_totp_enroll" },
        ...meta,
      });
      res.json({ message: "Authenticator enrolled", token: out.token, user: out.user, recoveryCodes: out.recoveryCodes });
    } catch (e) {
      next(e);
    }
  }

  async breakGlassTotpRotateStart(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as Request & { user?: { id: string } }).user?.id;
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const meta = getClientAuditMeta(req);
      const out = await this.svc.breakGlassTotpRotateStart(userId);
      await appendAuditLog({
        entityType: "auth",
        entityId: userId,
        action: "BREAK_GLASS_TOTP_ROTATE_STARTED",
        performedBy: userId,
        details: {},
        ...meta,
      });
      res.json(out);
    } catch (e) {
      next(e);
    }
  }

  async breakGlassTotpRotateConfirm(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as Request & { user?: { id: string } }).user?.id;
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const code = req.body?.code;
      if (code == null || String(code).trim() === "") {
        res.status(400).json({ error: "code is required" });
        return;
      }
      const meta = getClientAuditMeta(req);
      const out = await this.svc.breakGlassTotpRotateConfirm(userId, String(code));
      await appendAuditLog({
        entityType: "auth",
        entityId: userId,
        action: "BREAK_GLASS_TOTP_ROTATED",
        performedBy: userId,
        details: { recoveryCodesIssued: out.recoveryCodes.length },
        ...meta,
      });
      res.json({ message: "Authenticator rotated", recoveryCodes: out.recoveryCodes });
    } catch (e) {
      next(e);
    }
  }

  async breakGlassTotpVerify(req: Request, res: Response, next: NextFunction) {
    try {
      const { tempToken, code, recoveryCode } = req.body ?? {};
      if (!tempToken) {
        res.status(400).json({ error: "tempToken is required" });
        return;
      }
      const meta = getClientAuditMeta(req);
      const out = await this.svc.breakGlassVerifyTotp(
        String(tempToken),
        code != null ? String(code) : "",
        recoveryCode != null ? String(recoveryCode) : undefined,
      );
      res.cookie(COOKIE_NAME, out.token, getCookieOptions());
      await appendAuditLog({
        entityType: "auth",
        entityId: out.user.id,
        action: "LOGIN_SUCCESS",
        performedBy: out.user.id,
        details: { email: out.user.email, method: "local_break_glass_totp" },
        ...meta,
      });
      res.json({ message: "Login successful", token: out.token, user: out.user });
    } catch (e) {
      next(e);
    }
  }

  microsoftConfig(_req: Request, res: Response) {
    res.json({
      enabled: MS_SSO_ENABLED,
      tenantId: MS_TENANT_ID,
      interviewCalendarConnectEnabled: MS_INTERVIEW_CALENDAR_OAUTH_ENABLED,
    });
  }

  microsoftLogin(req: Request, res: Response) {
    try {
      if (!MS_CLIENT_ID) { res.status(501).json({ error: "Microsoft SSO is not configured" }); return; }
      const state = crypto.randomBytes(16).toString("hex");
      res.cookie("ms_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 10 * 60 * 1000, path: "/" });
      res.redirect(this.svc.getMicrosoftAuthUrl(state));
    } catch (e) { res.redirect("/login?error=SSO+configuration+error"); }
  }

  async microsoftCallback(req: Request, res: Response, _next: NextFunction) {
    try {
      const { code, state, error, error_description } = req.query;
      if (error) { res.redirect(`/login?error=${encodeURIComponent(String(error_description || error))}`); return; }
      if (!code || typeof code !== "string") { res.redirect("/login?error=No+authorization+code+received"); return; }
      const savedState = req.cookies?.ms_oauth_state;
      if (!savedState || savedState !== state) { res.redirect("/login?error=Invalid+state+parameter"); return; }
      res.clearCookie("ms_oauth_state", { path: "/" });
      const token = await this.svc.handleMicrosoftCallback(code);
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId?: string; email?: string };
        if (decoded.userId) {
          await appendAuditLog({
            entityType: "auth",
            entityId: decoded.userId,
            action: "LOGIN_SUCCESS",
            performedBy: decoded.userId,
            details: { email: decoded.email, method: "microsoft" },
            ...getClientAuditMeta(req),
          });
        }
      } catch {
        /* still set session cookie */
      }
      res.cookie(COOKIE_NAME, token, getCookieOptions());
      res.redirect("/dashboard");
    } catch (e: any) {
      console.error("Microsoft SSO callback error:", e);
      if (e instanceof ValidationError && e.message === MS_SSO_NO_ACCOUNT_MESSAGE) {
        res.redirect("/login?sso_error=no_account");
        return;
      }
      const msg = e?.message ? encodeURIComponent(e.message) : "SSO+authentication+failed";
      res.redirect(`/login?error=${msg}`);
    }
  }

  /** Delegated app — connect calendar for interview scheduling (requires eHire session). */
  microsoftCalendarLogin(req: Request, res: Response) {
    try {
      if (!MS_INTERVIEW_CALENDAR_OAUTH_ENABLED) {
        res.status(501).json({ error: "Interview calendar Microsoft app is not configured" });
        return;
      }
      const userId = req.user?.id;
      if (!userId) {
        res.redirect("/login?error=Sign+in+to+eHire+before+connecting+Microsoft+calendar");
        return;
      }
      let returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo.trim() : "/recruitment";
      if (!returnTo.startsWith("/") || returnTo.includes("://")) returnTo = "/recruitment";
      const state = crypto.randomBytes(16).toString("hex");
      const cookieOpts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        maxAge: 10 * 60 * 1000,
        path: "/",
      };
      res.cookie("ms_cal_oauth_state", state, cookieOpts);
      res.cookie("ms_cal_user_id", userId, cookieOpts);
      res.cookie("ms_cal_return_to", returnTo, cookieOpts);
      res.redirect(this.svc.getMicrosoftCalendarAuthUrl(state));
    } catch (e: unknown) {
      let returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo.trim() : "/recruitment";
      if (!returnTo.startsWith("/") || returnTo.includes("://")) returnTo = "/recruitment";
      const msg =
        e instanceof ValidationError
          ? encodeURIComponent(e.message)
          : e instanceof Error
            ? encodeURIComponent(e.message)
            : "configuration";
      const sep = returnTo.includes("?") ? "&" : "?";
      res.redirect(`${returnTo}${sep}calendar_error=${msg}`);
    }
  }

  async microsoftCalendarStatus(req: Request, res: Response) {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ configured: false, connected: false });
      return;
    }
    const connected = await this.svc.hasInterviewCalendarConnected(userId);
    res.json({ configured: MS_INTERVIEW_CALENDAR_OAUTH_ENABLED, connected });
  }

  async microsoftCalendarDisconnect(req: Request, res: Response) {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!MS_INTERVIEW_CALENDAR_OAUTH_ENABLED) {
      res.status(501).json({ error: "Interview calendar Microsoft app is not configured" });
      return;
    }
    await this.svc.disconnectInterviewCalendar(userId);
    res.json({ connected: false });
  }

  async microsoftCalendarCallback(req: Request, res: Response, _next: NextFunction) {
    let returnTo = "/recruitment";
    const resolveReturnTo = () => {
      const returnToRaw = req.cookies?.ms_cal_return_to;
      let path = typeof returnToRaw === "string" ? returnToRaw.trim() : "/recruitment";
      if (!path.startsWith("/") || path.includes("://")) path = "/recruitment";
      return path;
    };
    try {
      const { code, state, error, error_description } = req.query;
      returnTo = resolveReturnTo();
      if (error) {
        const sep = returnTo.includes("?") ? "&" : "?";
        res.redirect(`${returnTo}${sep}calendar_error=${encodeURIComponent(String(error_description || error))}`);
        return;
      }
      if (!code || typeof code !== "string") {
        const sep = returnTo.includes("?") ? "&" : "?";
        res.redirect(`${returnTo}${sep}calendar_error=No+authorization+code`);
        return;
      }
      const savedState = req.cookies?.ms_cal_oauth_state;
      const userId = req.cookies?.ms_cal_user_id;
      if (!savedState || savedState !== state || typeof userId !== "string") {
        const sep = returnTo.includes("?") ? "&" : "?";
        res.redirect(`${returnTo}${sep}calendar_error=Invalid+OAuth+state`);
        return;
      }
      res.clearCookie("ms_cal_oauth_state", { path: "/" });
      res.clearCookie("ms_cal_user_id", { path: "/" });
      res.clearCookie("ms_cal_return_to", { path: "/" });
      await this.svc.handleMicrosoftCalendarCallback(code, userId);
      const sep = returnTo.includes("?") ? "&" : "?";
      res.redirect(`${returnTo}${sep}calendar=connected`);
    } catch (e: unknown) {
      console.error("Microsoft calendar callback error:", e);
      const msg = e instanceof Error ? encodeURIComponent(e.message) : "Calendar+connect+failed";
      const sep = returnTo.includes("?") ? "&" : "?";
      res.redirect(`${returnTo}${sep}calendar_error=${msg}`);
    }
  }
}

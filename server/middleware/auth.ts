import { Request, Response, NextFunction } from "express";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import jwt from "jsonwebtoken";
import { type SystemRole, ALL_ROLES, normalizeRole, hasAnyRole, getEffectiveRole, mergeRolesWithOrgDerivedManager } from "../lib/rbac";
import { hasSuperRegionAccess } from "../lib/regionAccess.js";
import { isPrimaryAdminBaselineExceptionEmail } from "@shared/roleCatalog";

config();

const sql = neon(process.env.DATABASE_URL!);
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
export const COOKIE_NAME = "auth_token";

// Re-export for backwards compat (other files import Role from here)
export type Role = SystemRole;

export interface UserPayload {
  id: string;
  email: string;
  role: SystemRole;
  roles?: string[];
  employeeId: string | null;
  /** Direct branch link (users.branch_id, falls back to employee's branch). */
  branchId: string | null;
  /** Region of the user's branch (branches.region_code). Null = no region (fail-closed). */
  regionCode: string | null;
  /** True when user has the regional_super_admin grant (cross-region access). */
  isRegionalSuperAdmin: boolean;
}

interface JWTPayload extends UserPayload {
  userId: string; // JWT uses userId, we map to id
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

/** Read session JWT from Authorization: Bearer, auth cookie, or (dev) X-User-Id only — not both token sources required. */
export function getSessionTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer.length > 0) return bearer;
  }
  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (typeof cookieToken === "string" && cookieToken.length > 0) return cookieToken;
  return null;
}

async function resolveUserFromJwt(token: string, res: Response): Promise<UserPayload | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

    // Region resolution: user's own branch wins, else fall back to the linked
    // employee's branch; region_code comes from whichever branch resolves.
    const users = await sql`
      SELECT u.is_active, u.role, u.roles, u.employee_id,
             COALESCE(u.branch_id, e.branch_id) AS branch_id,
             b.region_code
      FROM users u
      LEFT JOIN employees e ON e.id = u.employee_id
      LEFT JOIN branches b  ON b.id = COALESCE(u.branch_id, e.branch_id)
      WHERE u.id = ${decoded.userId}
    `;
    if (users.length === 0 || (users[0].is_active !== true && users[0].is_active !== "true")) {
      res.clearCookie(COOKIE_NAME);
      return null;
    }

    const u = users[0] as { role: string; roles: string[] | null; employee_id: string | null; branch_id: string | null; region_code: string | null };
    const employeeId = u.employee_id ?? decoded.employeeId ?? null;
    const effectiveRole = await getEffectiveRole({
      id: decoded.userId,
      email: decoded.email,
      role: u.role,
      employee_id: employeeId,
      roles: u.roles,
    });

    const dbAdditional = Array.isArray(u.roles)
      ? u.roles.filter((r) => (ALL_ROLES as readonly string[]).includes(r) && r !== "manager" && r !== effectiveRole)
      : [];
    let rolesArray = [effectiveRole, ...dbAdditional];
    rolesArray = await mergeRolesWithOrgDerivedManager(rolesArray, employeeId);

    return {
      id: decoded.userId,
      email: decoded.email,
      role: effectiveRole,
      roles: rolesArray,
      employeeId,
      branchId: u.branch_id ?? null,
      regionCode: u.region_code ?? null,
      isRegionalSuperAdmin: hasSuperRegionAccess({
        regionCode: u.region_code,
        role: u.role,
        roles: u.roles,
        email: decoded.email,
      }),
    };
  } catch {
    res.clearCookie(COOKIE_NAME);
    return null;
  }
}

/**
 * Extract user from Bearer JWT, HTTP-only cookie, or X-User-Id header (dev).
 * Role is re-resolved from DB on every request.
 */
async function extractUser(req: Request, res: Response): Promise<UserPayload | null> {
  const token = getSessionTokenFromRequest(req);
  if (token) {
    const user = await resolveUserFromJwt(token, res);
    if (user) return user;
  }

  // Fallback to X-User-Id header (development only)
  const headerUserId = req.headers["x-user-id"] as string;
  if (headerUserId) {
    const users = await sql`
      SELECT u.id, u.email, u.role, u.roles, u.employee_id,
             COALESCE(u.branch_id, e.branch_id) AS branch_id,
             b.region_code
      FROM users u
      LEFT JOIN employees e ON e.id = u.employee_id
      LEFT JOIN branches b  ON b.id = COALESCE(u.branch_id, e.branch_id)
      WHERE u.id = ${headerUserId} AND u.is_active = true
    `;
    if (users.length > 0) {
      const u = users[0];
      const employeeIdH = u.employee_id as string | null;
      const effectiveRoleH = await getEffectiveRole({ id: u.id as string, email: u.email as string, role: u.role as string, employee_id: employeeIdH, roles: u.roles as string[] | null });
      const dbAdditionalH = Array.isArray(u.roles)
        ? (u.roles as string[]).filter((r) => (ALL_ROLES as readonly string[]).includes(r) && r !== "manager" && r !== effectiveRoleH)
        : [];
      let rolesArrayH = [effectiveRoleH, ...dbAdditionalH];
      rolesArrayH = await mergeRolesWithOrgDerivedManager(rolesArrayH, employeeIdH);
      return {
        id: u.id as string,
        email: u.email as string,
        role: effectiveRoleH,
        roles: rolesArrayH,
        employeeId: employeeIdH,
        branchId: (u.branch_id as string | null) ?? null,
        regionCode: (u.region_code as string | null) ?? null,
        isRegionalSuperAdmin: hasSuperRegionAccess({
          regionCode: u.region_code as string | null,
          role: u.role as string,
          roles: u.roles as string[] | null,
          email: u.email as string,
        }),
      };
    }
  }

  return null;
}

/**
 * Require authentication.
 * Priority: Authorization Bearer > JWT cookie > X-User-Id header (dev)
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await extractUser(req, res);
    
    if (!user) {
      if (req.method === "GET" && req.accepts("html")) {
        const returnTo = encodeURIComponent(req.originalUrl || "/dashboard");
        return res.redirect(`/login?returnTo=${returnTo}`);
      }
      return res.status(401).json({ error: "Authentication required" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Authentication failed" });
  }
}

/**
 * Optional authentication – attach user if present, don't fail if not.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await extractUser(req, res);
    if (user) req.user = user;
  } catch {
    // Ignore errors for optional auth
  }
  next();
}

/**
 * Require specific roles.
 * Uses normalizeRole + roles array so both primary role and secondary roles are checked.
 * Usage: requireRole(['admin', 'hr'])
 */
export function requireRole(allowedRoles: SystemRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Build a UserRow-compatible object for hasAnyRole
    const userRow = {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      roles: req.user.roles ?? [],
    };

    if (!hasAnyRole(userRow, allowedRoles)) {
      return res.status(403).json({ error: "Access denied" });
    }

    next();
  };
}

/** FreshTeam migration / bulk import — break-glass admin only (BREAK_GLASS_PRIMARY_EMAIL). */
export function requireBreakGlassAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (!isPrimaryAdminBaselineExceptionEmail(req.user.email)) {
    return res.status(403).json({ error: "Access denied" });
  }
  next();
}

/** Cross-region Super Region admin only (regional_super_admin grant, PK admin, global scope, or break-glass). */
export function requireSuperRegionAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (!req.user.isRegionalSuperAdmin) {
    return res.status(403).json({ error: "Access denied — Super Region admin only." });
  }
  next();
}

/**
 * Check if user can access employee record.
 * Admin, HR, and IT: may access any employee profile (IT for support/asset context).
 * Other employees: may view any profile (overview/directory only); GET /api/employees/:id returns
 * limited fields when viewer is not admin/hr and not the employee themselves.
 */
export function canAccessEmployee(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const privilegedRoles: SystemRole[] = ["admin", "hr", "it"];
  const userRow = {
    id: req.user.id,
    email: req.user.email,
    role: req.user.role,
    roles: req.user.roles ?? [],
  };

  if (hasAnyRole(userRow, privilegedRoles)) {
    return next();
  }

  // Any authenticated employee can view other profiles (API and UI restrict to overview / limited data)
  next();
}

// ==================== Guard-rail helpers ====================

/**
 * Prevent a user from acting on their own records (e.g. approving own leave).
 * Usage: preventSelfAction('employeeId')
 */
export function preventSelfAction(paramName = "employeeId") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    const targetId = req.params[paramName] || req.body?.[paramName];
    if (targetId && req.user.employeeId && targetId === req.user.employeeId) {
      return res.status(403).json({ error: "You cannot perform this action on your own record" });
    }
    next();
  };
}

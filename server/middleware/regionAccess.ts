/**
 * Region-isolation middleware (Step 3 / enforcement).
 *
 * Reads the requesting user's region from `req.user` (already resolved in
 * extractUser — no extra query), and the target entity's region from its own
 * region_code column (jobs/applications/onboarding) or via branch
 * (employees/offboarding).
 *
 * Pakistan Super Region admins (regional_super_admin) always pass through.
 * Users with no region are fail-closed (403).
 */
import { Request, Response, NextFunction } from "express";
import {
  type RegionCode,
  type RegionFilter,
  getEmployeeRegion,
  getJobRegion,
  getApplicationRegion,
  getOnboardingRegion,
  getOffboardingRegion,
} from "../lib/regionAccess";

declare global {
  namespace Express {
    interface Request {
      /** Set by injectRegionFilter — list handlers use this to scope queries. */
      regionFilter?: RegionFilter;
    }
  }
}

export type RegionEntity = "employee" | "job" | "application" | "onboarding" | "offboarding";

const RESOLVERS: Record<RegionEntity, (id: string) => Promise<RegionCode | null>> = {
  employee: getEmployeeRegion,
  job: getJobRegion,
  application: getApplicationRegion,
  onboarding: getOnboardingRegion,
  offboarding: getOffboardingRegion,
};

/**
 * requireSameRegion(entity, paramName?) — guard for region-isolated routes.
 *
 * Factory (mirrors requireRole): pick the entity type and the route param that
 * holds its id. Defaults to `:id`.
 *
 *   router.get("/:id",  requireAuth, requireSameRegion("employee"), ctrl.getById)
 *   router.get("/employee/:employeeId", requireAuth, requireSameRegion("employee", "employeeId"), ...)
 *
 * Super region admins pass through. Mismatched / unassigned region → 403.
 */
export function requireSameRegion(entity: RegionEntity, paramName = "id") {
  const resolve = RESOLVERS[entity];
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "Authentication required" });

      // Super Region (Pakistan) — full cross-region access.
      if (user.isRegionalSuperAdmin) return next();

      const targetId = req.params[paramName];
      if (!targetId) return next(); // nothing to scope; let other guards decide

      // A user can always reach their OWN employee record (self-service), even
      // if their branch/region is unassigned.
      if (entity === "employee" && user.employeeId && targetId === user.employeeId) {
        return next();
      }

      if (!user.regionCode) {
        return res.status(403).json({ error: "Region not assigned to your account. Contact admin." });
      }

      const targetRegion = await resolve(targetId);

      // Unassigned target region → only super admins (handled above) may see it.
      if (targetRegion === null) {
        return res.status(403).json({ error: "Access denied. This record has no region assigned." });
      }

      if (targetRegion !== user.regionCode) {
        return res.status(403).json({ error: "Access denied. This record belongs to a different region." });
      }

      next();
    } catch (err) {
      console.error(`[requireSameRegion:${entity}]`, err);
      return res.status(500).json({ error: "Region access check failed." });
    }
  };
}

/**
 * injectRegionFilter — for LIST endpoints.
 *
 * Attaches req.regionFilter = { isSuperAdmin, regionCode } so handlers/repositories
 * can apply `WHERE region_code = $1` (or skip for super admins). Reads from
 * req.user (already resolved) — no DB round-trip.
 */
export function injectRegionFilter(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Authentication required" });

  req.regionFilter = user.isRegionalSuperAdmin
    ? { isSuperAdmin: true, regionCode: null }
    : { isSuperAdmin: false, regionCode: (user.regionCode as RegionCode | null) ?? null };

  next();
}

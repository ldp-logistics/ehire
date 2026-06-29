import type { Request } from "express";
import type { UserPayload } from "../middleware/auth.js";

/** Shared region context for module services (mirrors leave/attendance). */
export type ModuleRegionCtx = {
  isRegionalSuperAdmin?: boolean;
  regionCode?: string | null;
  requestedRegion?: string | null;
};

export function regionCtxFromRequest(req: Request): ModuleRegionCtx | undefined {
  const u = req.user as UserPayload | undefined;
  if (!u) return undefined;
  return {
    regionCode: u.regionCode ?? null,
    isRegionalSuperAdmin: u.isRegionalSuperAdmin,
    requestedRegion: (req.query.region as string) ?? null,
  };
}

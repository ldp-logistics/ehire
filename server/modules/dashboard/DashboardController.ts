import type { Request, Response, NextFunction } from "express";
import { DashboardService } from "./DashboardService.js";
import { getRequestTz, todayInTz } from "../../lib/timezone.js";
import { neon } from "@neondatabase/serverless";

export class DashboardController {
  private readonly svc = new DashboardService();
  constructor() { const b = (c: any) => { for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(c))) if (k !== "constructor" && typeof c[k] === "function") c[k] = c[k].bind(c); }; b(this); }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const role = String(req.user!.role || "employee").toLowerCase();
      const sql = neon(process.env.DATABASE_URL!);
      const userTz = await getRequestTz(req, sql);
      const todayStr = todayInTz(userTz);
      const startOfMonthStr = todayStr.slice(0, 8) + "01";
      const data = await this.svc.getDashboard(
        role,
        req.user!.employeeId,
        todayStr,
        startOfMonthStr,
        req.user!.email,
        req.user!.roles,
        req.user!,
        (req.query.region as string) ?? null,
      );
      res.json(data); // preserve legacy shape (no ApiResponse wrapper — frontend depends on root fields)
    } catch (e) { next(e); }
  }

  async probationAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const role = String(req.user!.role || "").toLowerCase();
      const sql = neon(process.env.DATABASE_URL!);
      const userTz = await getRequestTz(req, sql);
      res.json(await this.svc.getProbationAlerts(role, todayInTz(userTz), { regionCode: req.user!.regionCode ?? null, isRegionalSuperAdmin: req.user!.isRegionalSuperAdmin }));
    } catch (e) { next(e); }
  }

  async runProbationReminders(_: Request, res: Response, next: NextFunction) {
    try { const r = await this.svc.runProbationReminders(); res.json({ message: "Probation reminders run complete.", sent: r.sent, details: r.details }); } catch (e) { next(e); }
  }
}

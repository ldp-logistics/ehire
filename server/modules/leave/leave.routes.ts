import { Router, type Request, type Response } from "express";
import { requireAuth, requireRole, requireBreakGlassAdmin } from "../../middleware/auth.js";
import { LeaveController } from "./LeaveController.js";

const router = Router();
const ctrl = new LeaveController();
const adminHR = requireRole(["admin", "hr"]);

// ── FreshTeam sync (registered before param routes to avoid shadowing) ──────────
router.all("/migrate-from-freshteam", (req: Request, res: Response, next) => {
  if (req.method !== "POST") return res.status(405).set("Allow","POST").json({ error: "Method Not Allowed. Use POST." });
  next();
});
router.post("/migrate-from-freshteam",       requireAuth, adminHR, ctrl.migrateFromFreshteam);

router.all("/sync-balances-from-freshteam", (req: Request, res: Response, next) => {
  if (req.method !== "POST") return res.status(405).set("Allow","POST").json({ error: "Method Not Allowed. Use POST." });
  next();
});
router.post("/sync-balances-from-freshteam", requireAuth, requireBreakGlassAdmin, ctrl.syncBalancesFromFreshteam);

// ── Policies ──────────────────────────────────────────────────────────────────────
router.get("/policies",            requireAuth, ctrl.listPolicies);
router.post("/policies",           requireAuth, adminHR, ctrl.createPolicy);
router.get("/policies/:id",        requireAuth, ctrl.getPolicyById);
router.patch("/policies/:id",      requireAuth, adminHR, ctrl.updatePolicy);
router.delete("/policies/:id",     requireAuth, adminHR, ctrl.deletePolicy);

// ── Leave types ───────────────────────────────────────────────────────────────────
router.post("/types",              requireAuth, adminHR, ctrl.createType);
router.patch("/types/:id",         requireAuth, adminHR, ctrl.updateType);
router.delete("/types/:id",        requireAuth, adminHR, ctrl.deleteType);
router.post("/types/:id/bulk-init", requireAuth, adminHR, ctrl.bulkInitType);

// ── Balances ──────────────────────────────────────────────────────────────────────
router.get("/all-balances",                         requireAuth, adminHR, ctrl.getAllBalances);
router.get("/balances/:employeeId",                 requireAuth, ctrl.getBalances);
router.post("/balances/initialize/:employeeId",    requireAuth, adminHR, ctrl.initializeBalances);
router.patch("/balances/:balanceId/adjust",        requireAuth, adminHR, ctrl.adjustBalance);
router.post("/balances/add",                       requireAuth, adminHR, ctrl.addBalance);
router.post("/accrue",                             requireAuth, adminHR, ctrl.runAccrual);
router.post("/process-year-end",                   requireAuth, adminHR, ctrl.processYearEnd);

// ── Holidays ──────────────────────────────────────────────────────────────────────
router.get("/holidays",            requireAuth, ctrl.listHolidays);
router.post("/holidays",           requireAuth, adminHR, ctrl.createHoliday);
router.delete("/holidays/:id",     requireAuth, adminHR, ctrl.deleteHoliday);

// ── Per-employee requests (before /:id routes) ─────────────────────────────────────
router.get("/employee/:employeeId/requests",   requireAuth, ctrl.getEmployeeRequests);
router.get("/types-for-employee/:employeeId",  requireAuth, ctrl.getTypesForEmployee);

// ── Self-service ──────────────────────────────────────────────────────────────────
router.get("/my-requests",                     requireAuth, ctrl.getMyRequests);
router.post("/request",                        requireAuth, ctrl.submitRequest);
router.post("/request/:id/cancel",             requireAuth, ctrl.cancelRequest);
router.delete("/request/:id",                  requireAuth, adminHR, ctrl.deleteRequest);

// ── Approval actions ──────────────────────────────────────────────────────────────
router.get("/pending-approvals",               requireAuth, ctrl.getPendingApprovals);
router.post("/approve/:approvalId",            requireAuth, ctrl.approveRequest);
router.post("/reject/:approvalId",             requireAuth, ctrl.rejectApproval);

// ── HR / admin queries ────────────────────────────────────────────────────────────
router.get("/requests",            requireAuth, ctrl.listRequests);
router.get("/request/:id",         requireAuth, ctrl.getRequestDetail);

// ── Calendar / team / stats ───────────────────────────────────────────────────────
router.get("/calendar",            requireAuth, ctrl.getCalendar);
router.get("/team/:managerId",     requireAuth, ctrl.getTeam);
router.get("/stats",               requireAuth, ctrl.getStats);

export default router;

// Named exports for backward-compatible registration in routes.ts
export const migrateFromFreshteamHandler = ctrl.migrateFromFreshteam.bind(ctrl);
export const syncBalancesFromFreshteamHandler = ctrl.syncBalancesFromFreshteam.bind(ctrl);

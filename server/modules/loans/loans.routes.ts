import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { LoansController } from "./LoansController.js";

const router = Router();
const ctrl   = new LoansController();
const adminHR = requireRole(["admin", "hr"]);

// ── Employee-facing (authenticated user with employee record) ──────────────
router.get( "/my-applications", requireAuth,         ctrl.getMyApplications);
router.post("/applications",    requireAuth,         ctrl.createApplication);
router.get( "/my-records",      requireAuth,         ctrl.getMyRecords);

// ── HR / Admin: applications ───────────────────────────────────────────────
router.get(  "/applications",          requireAuth, adminHR, ctrl.getAllApplications);
router.get(  "/applications/:id",      requireAuth, adminHR, ctrl.getApplicationById);
router.patch("/applications/:id/approve", requireAuth, adminHR, ctrl.approveApplication);
router.patch("/applications/:id/reject",  requireAuth, adminHR, ctrl.rejectApplication);

// ── HR / Admin: loan records ───────────────────────────────────────────────
router.get(   "/records",     requireAuth, adminHR, ctrl.getAllRecords);
router.post(  "/records",     requireAuth, adminHR, ctrl.createRecord);
router.get(   "/records/:id", requireAuth, adminHR, ctrl.getRecordById);
router.patch( "/records/:id", requireAuth, adminHR, ctrl.updateRecord);
router.delete("/records/:id", requireAuth, adminHR, ctrl.deleteRecord);

// ── HR / Admin: payments ───────────────────────────────────────────────────
router.get( "/records/:id/payments", requireAuth, adminHR, ctrl.getPayments);
router.post("/records/:id/payments", requireAuth, adminHR, ctrl.addPayment);

// ── Per-employee profile tab (role-checked inside service) ────────────────
router.get("/employee/:employeeId", requireAuth, ctrl.getEmployeeLoans);

// ── Stats (HR dashboard) ───────────────────────────────────────────────────
router.get("/stats", requireAuth, adminHR, ctrl.getStats);

export default router;

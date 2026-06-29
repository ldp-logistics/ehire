import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { BenefitsController } from "./BenefitsController.js";

const router = Router();
const ctrl   = new BenefitsController();
const adminHR = requireRole(["admin", "hr"]);

// Employee: get own assigned benefits
router.get("/my",                                      requireAuth, ctrl.getMyBenefits);
// Profile: HR/admin or self — employee's assigned benefits
router.get("/employee/:employeeId",                    requireAuth, ctrl.getEmployeeBenefits);

// HR/Admin: manage benefit cards
router.get("/cards",                                   requireAuth, adminHR, ctrl.listCards);
router.post("/cards",                                  requireAuth, adminHR, ctrl.createCard);
router.get("/cards/:id",                               requireAuth, adminHR, ctrl.getCard);
router.patch("/cards/:id",                             requireAuth, adminHR, ctrl.updateCard);
router.delete("/cards/:id",                            requireAuth, adminHR, ctrl.deleteCard);

// HR/Admin: manage which employees are on a card
router.get("/cards/:id/assignments",                   requireAuth, adminHR, ctrl.getCardAssignments);
router.post("/cards/:id/assignments",                  requireAuth, adminHR, ctrl.addAssignment);
router.patch("/cards/:id/assignments/:assignmentId",   requireAuth, adminHR, ctrl.updateAssignment);
router.delete("/cards/:id/assignments/:assignmentId",  requireAuth, adminHR, ctrl.removeAssignment);

export default router;

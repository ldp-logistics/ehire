import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { CompensationController } from "./CompensationController.js";

const router = Router();
const ctrl = new CompensationController();
const adminHR = requireRole(["admin", "hr"]);

router.get("/emergency-contacts",                 requireAuth, adminHR, ctrl.getAllEmergencyContacts);

router.get("/:employeeId/salary",                 requireAuth, ctrl.getSalary);
router.post("/:employeeId/salary",                requireAuth, adminHR, ctrl.createSalary);
router.patch("/salary/:id",                       requireAuth, adminHR, ctrl.updateSalary);
router.delete("/salary/:id",                      requireAuth, adminHR, ctrl.deleteSalary);

router.get("/:employeeId/banking",                requireAuth, ctrl.getBanking);
router.post("/:employeeId/banking",               requireAuth, adminHR, ctrl.createBanking);
router.patch("/banking/:id",                      requireAuth, adminHR, ctrl.updateBanking);
router.delete("/banking/:id",                     requireAuth, adminHR, ctrl.deleteBanking);

router.get("/:employeeId/bonuses",                requireAuth, ctrl.getBonuses);
router.post("/:employeeId/bonuses",               requireAuth, adminHR, ctrl.createBonus);
router.patch("/bonuses/:id",                      requireAuth, adminHR, ctrl.updateBonus);
router.delete("/bonuses/:id",                     requireAuth, adminHR, ctrl.deleteBonus);

router.get("/:employeeId/stock-grants",           requireAuth, ctrl.getStockGrants);
router.post("/:employeeId/stock-grants",          requireAuth, adminHR, ctrl.createStockGrant);
router.patch("/stock-grants/:id",                 requireAuth, adminHR, ctrl.updateStockGrant);
router.delete("/stock-grants/:id",                requireAuth, adminHR, ctrl.deleteStockGrant);

export default router;

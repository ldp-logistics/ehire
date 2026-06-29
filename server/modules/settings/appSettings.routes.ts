import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { AppSettingsController } from "./AppSettingsController.js";
import { RegionSettingsController } from "./RegionSettingsController.js";

const router = Router();
const ctrl = new AppSettingsController();
const regionCtrl = new RegionSettingsController();
const adminHr = requireRole(["admin", "hr", "limited_hr"]);
const adminOnly = requireRole(["admin"]);

// Proxied banner image (must be before JSON route if paths ever overlap — distinct paths OK)
router.get("/employee-profile-banner/image", requireAuth, ctrl.getEmployeeProfileBannerImage);
router.get("/employee-profile-banner", requireAuth, ctrl.getEmployeeProfileBanner);
router.put("/employee-profile-banner", requireAuth, adminHr, ctrl.putEmployeeProfileBanner);
router.delete("/employee-profile-banner", requireAuth, adminHr, ctrl.deleteEmployeeProfileBanner);

// Email branding (colors, logo for notification email chrome)
router.get("/email-branding", requireAuth, adminHr, ctrl.getEmailBranding);
router.put("/email-branding", requireAuth, adminHr, ctrl.putEmailBranding);
router.post("/email-branding/reset", requireAuth, adminHr, ctrl.resetEmailBranding);
router.get("/email-branding/logos", requireAuth, adminHr, ctrl.listPublicLogos);

// Onsite interview locations (saved defaults for the schedule screen)
router.get("/interview-onsite-locations", requireAuth, ctrl.getInterviewOnsiteLocations);
router.put("/interview-onsite-locations", requireAuth, adminHr, ctrl.putInterviewOnsiteLocations);

// Multi-region access control (admin only): region overview + branch→region mapping
router.get("/regions", requireAuth, adminOnly, regionCtrl.getOverview);
router.patch("/regions/branches/:branchId", requireAuth, adminOnly, regionCtrl.setBranchRegion);
router.get("/regions/unassigned-employees", requireAuth, adminOnly, regionCtrl.listEmployeesWithoutRegion);
router.patch("/regions/employees/:employeeId/branch", requireAuth, adminOnly, regionCtrl.setEmployeeBranch);

export default router;

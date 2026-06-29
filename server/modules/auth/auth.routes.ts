import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { AuthController } from "./AuthController.js";

const router = Router();
const ctrl = new AuthController();

const breakGlassLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});

// Local auth
router.post("/login",            ctrl.login);
router.post("/break-glass/set-password", breakGlassLimiter, ctrl.breakGlassSetPassword);
router.post("/break-glass/totp-setup", breakGlassLimiter, ctrl.breakGlassTotpSetup);
router.post("/break-glass/totp-confirm", breakGlassLimiter, ctrl.breakGlassTotpConfirm);
router.post("/break-glass/totp-verify", breakGlassLimiter, ctrl.breakGlassTotpVerify);
router.post("/break-glass/totp-rotate/start", breakGlassLimiter, requireAuth, ctrl.breakGlassTotpRotateStart);
router.post("/break-glass/totp-rotate/confirm", breakGlassLimiter, requireAuth, ctrl.breakGlassTotpRotateConfirm);
router.post("/logout",           ctrl.logout);
router.get("/me",                ctrl.me);
router.get("/assignment-visibility", requireAuth, ctrl.assignmentVisibility);
router.patch("/me",              requireAuth, ctrl.updateMe);
router.post("/register",         requireAuth, requireRole(["admin"]), ctrl.register);
router.post("/change-password",  ctrl.changePassword);

// User management (admin)
router.get("/roles/catalog",     requireAuth, requireRole(["admin"]), ctrl.roleCatalog);
router.get("/users",             requireAuth, requireRole(["admin"]), ctrl.listUsers);
router.patch("/users/:id",       requireAuth, requireRole(["admin"]), ctrl.updateUser);
router.patch("/users/:id/super-region", requireAuth, requireRole(["admin"]), ctrl.setSuperRegion);
router.delete("/users/:id",      requireAuth, requireRole(["admin"]), ctrl.deleteUser);

// Microsoft SSO
router.get("/microsoft/config",              ctrl.microsoftConfig);
router.get("/microsoft/login",               ctrl.microsoftLogin);
router.get("/microsoft/callback",            ctrl.microsoftCallback);
router.get("/Microsoft/callback",            ctrl.microsoftCallback);
router.get("/microsoft/calendar/login",      requireAuth, ctrl.microsoftCalendarLogin);
router.get("/microsoft/calendar/callback",   ctrl.microsoftCalendarCallback);
router.get("/microsoft/calendar/status",     requireAuth, ctrl.microsoftCalendarStatus);
router.post("/microsoft/calendar/disconnect", requireAuth, ctrl.microsoftCalendarDisconnect);

export const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
export const COOKIE_NAME = "auth_token";
export default router;

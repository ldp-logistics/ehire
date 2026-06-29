import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { AssetController } from "./AssetController.js";

const router = Router();
const ctrl = new AssetController();
const adminHRIT = requireRole(["admin", "hr", "it"]);
const adminIT = requireRole(["admin", "it"]);

// Public view (no auth) — support both /public/:assetId and /public/view/:assetId for QR/client compatibility
router.get("/public/view/:assetId",              ctrl.publicView);
router.get("/public/:assetId",                   ctrl.publicView);

// Stats / overview
router.get("/stats",                             requireAuth, ctrl.getStats);
router.get("/recent-returns",                    requireAuth, adminHRIT, ctrl.getRecentReturns);

// Self-service
router.get("/my-tickets",                        requireAuth, ctrl.getMyTickets);
router.get("/my-systems",                        requireAuth, ctrl.getMySystems);

// Stock
router.get("/stock",                             requireAuth, ctrl.listStock);
router.post("/stock",                            requireAuth, adminHRIT, ctrl.createStock);
router.get("/stock/:id/qr",                      requireAuth, ctrl.stockQR);
router.get("/stock/:id",                         requireAuth, ctrl.getStockById);
router.patch("/stock/:id",                       requireAuth, adminHRIT, ctrl.updateStock);
router.delete("/stock/:id",                      requireAuth, adminIT, ctrl.deleteStock);

// Assigned systems
router.get("/systems",                           requireAuth, ctrl.listSystems);
router.post("/systems/assign-from-stock",        requireAuth, adminHRIT, ctrl.assignFromStock);
router.post("/systems",                          requireAuth, adminHRIT, ctrl.createSystem);
router.get("/systems/user/:userId",              requireAuth, ctrl.getSystemsByUser);
router.get("/systems/:id/qr",                    requireAuth, ctrl.systemQR);
router.get("/systems/:id",                       requireAuth, ctrl.getSystemById);
router.patch("/systems/:id",                     requireAuth, adminHRIT, ctrl.updateSystem);
router.delete("/systems/:id",                    requireAuth, adminIT, ctrl.deleteSystem);

// Tickets
router.get("/tickets",                           requireAuth, ctrl.listTickets);
router.get("/tickets/it-assignees",              requireAuth, adminHRIT, ctrl.listItAssignees);
router.post("/tickets",                          requireAuth, ctrl.createTicket);
router.get("/tickets/:ticketId/comments",        requireAuth, ctrl.getTicketComments);
router.post("/tickets/:ticketId/comments",       requireAuth, ctrl.addComment);
router.patch("/tickets/:ticketId/status",        requireAuth, adminHRIT, ctrl.updateTicketStatus);
router.get("/tickets/:id/attachment",            requireAuth, ctrl.getTicketAttachment);
router.get("/tickets/:id",                       requireAuth, ctrl.getTicketById);
router.patch("/tickets/:id",                     requireAuth, ctrl.updateTicket);
router.delete("/tickets/:id",                    requireAuth, adminIT, ctrl.deleteTicket);

// Audit log
router.get("/audit",                             requireAuth, adminIT, ctrl.getAuditLog);

// Invoices
router.get("/invoices",                          requireAuth, ctrl.listInvoices);
router.post("/invoices",                         requireAuth, adminHRIT, ctrl.createInvoice);
router.get("/invoices/:id/file",                 requireAuth, ctrl.getInvoiceFile);
router.get("/invoices/:id",                      requireAuth, ctrl.getInvoiceById);
router.patch("/invoices/:id",                    requireAuth, adminHRIT, ctrl.updateInvoice);
router.delete("/invoices/:id",                   requireAuth, adminIT, ctrl.deleteInvoice);

export default router;

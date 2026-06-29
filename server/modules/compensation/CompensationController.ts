import type { Request, Response, NextFunction } from "express";
import { CompensationService } from "./CompensationService.js";
import { ApiResponse } from "../../core/utils/apiResponse.js";

export class CompensationController {
  private readonly svc = new CompensationService();
  constructor() {
    const bindAll = (c: any) => { for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(c))) { if (k !== "constructor" && typeof c[k] === "function") c[k] = c[k].bind(c); } };
    bindAll(this);
  }

  async getAllEmergencyContacts(_r: Request, res: Response, next: NextFunction) { try { ApiResponse.ok(res, await this.svc.getAllEmergencyContacts()); } catch (e) { next(e); } }

  async getSalary(req: Request, res: Response, next: NextFunction) { try { ApiResponse.ok(res, await this.svc.getSalary(req.params.employeeId)); } catch (e) { next(e); } }
  async createSalary(req: Request, res: Response, next: NextFunction) { try { ApiResponse.created(res, await this.svc.createSalary(req.params.employeeId, req.body, req.user!.id)); } catch (e) { next(e); } }
  async updateSalary(req: Request, res: Response, next: NextFunction) { try { ApiResponse.ok(res, await this.svc.updateSalary(req.params.id, req.body, req.user!.id)); } catch (e) { next(e); } }
  async deleteSalary(req: Request, res: Response, next: NextFunction) { try { await this.svc.deleteSalary(req.params.id); ApiResponse.ok(res, { message: "Deleted" }); } catch (e) { next(e); } }

  async getBanking(req: Request, res: Response, next: NextFunction) { try { ApiResponse.ok(res, await this.svc.getBanking(req.params.employeeId)); } catch (e) { next(e); } }
  async createBanking(req: Request, res: Response, next: NextFunction) { try { ApiResponse.created(res, await this.svc.createBanking(req.params.employeeId, req.body, req.user!.id)); } catch (e) { next(e); } }
  async updateBanking(req: Request, res: Response, next: NextFunction) { try { ApiResponse.ok(res, await this.svc.updateBanking(req.params.id, req.body, req.user!.id)); } catch (e) { next(e); } }
  async deleteBanking(req: Request, res: Response, next: NextFunction) { try { await this.svc.deleteBanking(req.params.id); ApiResponse.ok(res, { message: "Deleted" }); } catch (e) { next(e); } }

  async getBonuses(req: Request, res: Response, next: NextFunction) { try { ApiResponse.ok(res, await this.svc.getBonuses(req.params.employeeId)); } catch (e) { next(e); } }
  async createBonus(req: Request, res: Response, next: NextFunction) { try { ApiResponse.created(res, await this.svc.createBonus(req.params.employeeId, req.body, req.user!.id)); } catch (e) { next(e); } }
  async updateBonus(req: Request, res: Response, next: NextFunction) { try { ApiResponse.ok(res, await this.svc.updateBonus(req.params.id, req.body, req.user!.id)); } catch (e) { next(e); } }
  async deleteBonus(req: Request, res: Response, next: NextFunction) { try { await this.svc.deleteBonus(req.params.id); ApiResponse.ok(res, { message: "Deleted" }); } catch (e) { next(e); } }

  async getStockGrants(req: Request, res: Response, next: NextFunction) { try { ApiResponse.ok(res, await this.svc.getStockGrants(req.params.employeeId)); } catch (e) { next(e); } }

  async createStockGrant(req: Request, res: Response, next: NextFunction) { try { ApiResponse.created(res, await this.svc.createStockGrant(req.params.employeeId, req.body, req.user!.id)); } catch (e) { next(e); } }
  async updateStockGrant(req: Request, res: Response, next: NextFunction) { try { ApiResponse.ok(res, await this.svc.updateStockGrant(req.params.id, req.body, req.user!.id)); } catch (e) { next(e); } }
  async deleteStockGrant(req: Request, res: Response, next: NextFunction) { try { await this.svc.deleteStockGrant(req.params.id); ApiResponse.ok(res, { message: "Deleted" }); } catch (e) { next(e); } }
}

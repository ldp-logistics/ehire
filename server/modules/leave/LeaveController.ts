import type { Request, Response, NextFunction } from "express";
import { LeaveService, type LeaveRegionCtx } from "./LeaveService.js";
import { getRequestTz, todayInTz } from "../../lib/timezone.js";
import { neon } from "@neondatabase/serverless";

export class LeaveController {
  private readonly svc = new LeaveService();

  private regionCtx(req: Request): LeaveRegionCtx | undefined {
    const u = req.user;
    if (!u) return undefined;
    return {
      regionCode: u.regionCode ?? null,
      isRegionalSuperAdmin: u.isRegionalSuperAdmin,
      requestedRegion: (req.query.region as string) ?? null,
    };
  }

  constructor() { const b=(c:any)=>{for(const k of Object.getOwnPropertyNames(Object.getPrototypeOf(c)))if(k!=="constructor"&&typeof c[k]==="function")c[k]=c[k].bind(c)};b(this); }

  async listPolicies(_: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.listPolicies()); } catch (e) { next(e); } }
  async getPolicyById(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getPolicyById(req.params.id)); } catch (e) { next(e); } }
  async createPolicy(req: Request, res: Response, next: NextFunction) { try { res.status(201).json(await this.svc.createPolicy(req.body, req.user!.employeeId||req.user!.id)); } catch (e) { next(e); } }
  async updatePolicy(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.updatePolicy(req.params.id, req.body, req.user!.employeeId||req.user!.id)); } catch (e) { next(e); } }
  async deletePolicy(req: Request, res: Response, next: NextFunction) { try { await this.svc.deletePolicy(req.params.id); res.json({success:true}); } catch (e) { next(e); } }

  async createType(req: Request, res: Response, next: NextFunction) { try { res.status(201).json(await this.svc.createType(req.body, req.user!.employeeId||req.user!.id)); } catch (e) { next(e); } }
  async bulkInitType(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.bulkInitNewType(req.params.id)); } catch (e) { next(e); } }
  async updateType(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.updateType(req.params.id, req.body, req.user!.employeeId||req.user!.id)); } catch (e) { next(e); } }
  async deleteType(req: Request, res: Response, next: NextFunction) { try { await this.svc.deleteType(req.params.id); res.json({success:true}); } catch (e) { next(e); } }

  async getBalances(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getBalances(req.params.employeeId, this.regionCtx(req), req.user!.employeeId, req.user!.role)); } catch (e) { next(e); } }
  async getAllBalances(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getAllBalances(this.regionCtx(req))); } catch (e) { next(e); } }
  async initializeBalances(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.initializeBalances(req.params.employeeId, req.user!.id, this.regionCtx(req))); } catch (e) { next(e); } }
  async adjustBalance(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.adjustBalance(req.params.balanceId, req.body.newBalance, req.body.reason, req.user!.employeeId||req.user!.id, this.regionCtx(req))); } catch (e) { next(e); } }
  async addBalance(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.addBalance(req.body.employeeId, req.body.leaveTypeId, req.body.daysToAdd, req.body.reason, req.user!.employeeId||req.user!.id, req.body.dateWorked, this.regionCtx(req))); } catch (e) { next(e); } }
  async runAccrual(_: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.runAccrual()); } catch (e) { next(e); } }
  async processYearEnd(req: Request, res: Response, next: NextFunction) {
    try {
      const year = req.body?.year!=null?parseInt(String(req.body.year),10):new Date().getFullYear();
      if(Number.isNaN(year)||year<2000||year>2100){res.status(400).json({error:"Invalid year; use 2000–2100 or omit for current year."});return;}
      const policyId = req.body?.policyId ?? null;
      const result=await this.svc.processYearEnd(year,req.user?.employeeId??req.user?.id??null,policyId);
      res.json({success:true,year,processed:result.processed,skipped:result.skipped,bereavementProcessed:result.bereavementProcessed??0,errors:result.errors.length>0?result.errors:undefined});
    } catch (e) { next(e); }
  }

  async listHolidays(_: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.listHolidays()); } catch (e) { next(e); } }
  async createHoliday(req: Request, res: Response, next: NextFunction) { try { res.status(201).json(await this.svc.createHoliday(req.body.date, req.body.name)); } catch (e: any) { if(e?.code==="23505"){res.status(400).json({error:"A holiday already exists for this date"});return;} next(e); } }
  async deleteHoliday(req: Request, res: Response, next: NextFunction) { try { await this.svc.deleteHoliday(req.params.id); res.json({success:true}); } catch (e) { next(e); } }

  async getMyRequests(req: Request, res: Response, next: NextFunction) { try { const limit=Math.min(parseInt(req.query.limit as string)||100,200),offset=parseInt(req.query.offset as string)||0; res.json(await this.svc.getMyRequests(req.user!.employeeId,limit,offset)); } catch (e) { next(e); } }
  async submitRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const sql=neon(process.env.DATABASE_URL!); const tz=await getRequestTz(req,sql);
      const body={...req.body};
      const role=(req.user!.role||"").toString().toLowerCase();
      const canApplyOnBehalf=role==="admin"||role==="hr";
      const applicantId=canApplyOnBehalf&&body.employeeId?body.employeeId:req.user!.employeeId;
      delete body.employeeId;
      body._callerEmployeeId=req.user!.employeeId; // used to detect on-behalf in service
      const result=await this.svc.submitRequest(applicantId,body,req.user!.id,tz,this.regionCtx(req));
      res.status(201).json(result);
    } catch (e) { next(e); }
  }
  async cancelRequest(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.cancelRequest(req.params.id,req.user!.employeeId,req.user!.id,req.user!.role)); } catch (e) { next(e); } }
  async deleteRequest(req: Request, res: Response, next: NextFunction) { try { await this.svc.deleteRequest(req.params.id,req.user!.role,this.regionCtx(req)); res.json({success:true}); } catch (e) { next(e); } }
  async listRequests(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.listRequests(req.user!.role,req.user!.employeeId,req.query,req.user,this.regionCtx(req))); } catch (e) { next(e); } }
  async getRequestDetail(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getRequestDetail(req.params.id,req.user!.role,req.user!.employeeId,this.regionCtx(req))); } catch (e) { next(e); } }
  async getEmployeeRequests(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(
        await this.svc.getEmployeeRequests(req.params.employeeId, req.user!.id, req.user!.role, req.user!.employeeId, req.user!, this.regionCtx(req)),
      );
    } catch (e) {
      next(e);
    }
  }

  async getPendingApprovals(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getPendingApprovals(req.user!.employeeId,req.user!.role,req.user,this.regionCtx(req))); } catch (e) { next(e); } }
  async approveRequest(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.approveRequest(req.params.approvalId,req.body,req.user!.employeeId,req.user!.id,req.user!.role,req.user,this.regionCtx(req))); } catch (e) { next(e); } }
  async rejectApproval(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.rejectApproval(req.params.approvalId,req.body,req.user!.employeeId,req.user!.id,req.user!.role,req.user,this.regionCtx(req))); } catch (e) { next(e); } }

  async getCalendar(req: Request, res: Response, next: NextFunction) {
    try {
      const sql=neon(process.env.DATABASE_URL!); const tz=await getRequestTz(req,sql); const today=todayInTz(tz);
      res.json(await this.svc.getCalendar(today,req.query.from as string,req.query.to as string,req.query.department as string,this.regionCtx(req)));
    } catch (e) { next(e); }
  }
  async getTeam(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getTeam(req.params.managerId)); } catch (e) { next(e); } }
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const sql=neon(process.env.DATABASE_URL!); const tz=await getRequestTz(req,sql); const today=todayInTz(tz);
      res.json(await this.svc.getStats(req.user!.role,req.user!.employeeId,today,req.user,this.regionCtx(req)));
    } catch (e) { next(e); }
  }
  async getTypesForEmployee(req: Request, res: Response, next: NextFunction) {
    try {
      const sql=neon(process.env.DATABASE_URL!); const tz=await getRequestTz(req,sql); const today=todayInTz(tz);
      res.json(await this.svc.getTypesForEmployee(req.params.employeeId,req.user!.role,today,this.regionCtx(req),req.user!.employeeId));
    } catch (e) { next(e); }
  }

  async migrateFromFreshteam(_: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.migrateFromFreshteam()); } catch (e: any) { if(e?.statusCode===503){res.status(503).json({error:e.message});return;} next(e); } }
  async syncBalancesFromFreshteam(_: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.syncBalancesFromFreshteam()); } catch (e: any) { if(e?.statusCode===503){res.status(503).json({error:e.message});return;} next(e); } }
}

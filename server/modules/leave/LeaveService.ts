import { LeaveRepository } from "./LeaveRepository.js";
import { AppError, ValidationError, NotFoundError, ForbiddenError } from "../../core/types/index.js";
import { resolvePolicy, hrScopeFilter } from "../../lib/policy.js";
import type { UserPayload } from "../../middleware/auth.js";
import { memCache } from "../../lib/perf.js";
import { emitRefreshAll } from "../../lib/notificationEvents.js";
import { notifyEmail, getEmployeeEmail, getEmailsByRoleForRegion, dedupeRecipientsByEmail, resolveActorDisplayForEmail } from "../../lib/emailNotifications.js";
import type { Recipient } from "../../lib/emailNotifications.js";
import { isFreshTeamConfigured, listEmployees as listFtEmployees, listTimeOffTypes as listFtTimeOffTypes, listTimeOffs as listFtTimeOffs, getEmployeeWithTimeOff as getFtEmployeeWithTimeOff, sleep, getFreshTeamDelayMs, freshteamWorkEmailMatchKeys, type FreshTeamTimeOff } from "../../lib/freshteamApi.js";
import { parseDataUrl, uploadFileToSharePoint, isSharePointAvatarConfigured } from "../../lib/sharepoint.js";
import { hasOrgDerivedManagerScope } from "../../lib/rbac.js";
import { effectiveRegionsFor, getEmployeeRegion } from "../../lib/regionAccess.js";

export type LeaveRegionCtx = {
  isRegionalSuperAdmin?: boolean;
  regionCode?: string | null;
  requestedRegion?: string | null;
};
import { formatLeaveAppliedAt, formatTimezoneContextLabel } from "../../../shared/dateTimeFormat.js";
import {
  formatLeaveDayTypeLabel,
  formatLeaveDurationSummary,
  isHalfDayLeaveType,
} from "../../../shared/leaveDayType.js";
import {
  addCalendarDaysYmd,
  diffCalendarDaysInclusive,
  getDefaultTz,
  publicDisplayFromBranch,
  todayInTz,
  toYmdDateOnly,
  yesterdayYmdFromTodayYmd,
} from "../../lib/timezone.js";

const repo = () => new LeaveRepository();

/** Fire-and-forget email helper for leave events. */
async function leaveNotify(
  r: LeaveRepository,
  eventKey: string,
  requestId: string,
  recipientEmployeeIds: string[],
  extraCtx: Record<string, string> = {},
  extraRecipients: Recipient[] = [],
): Promise<void> {
  try {
    if (!recipientEmployeeIds.length && !extraRecipients.length) return;
    const req = await r.getRequestWithType(requestId);
    if (!req) return;
    const empName = `${req.first_name || ""} ${req.last_name || ""}`.trim() || "Employee";
    const dayType = String(req.day_type ?? "full");
    const branchRow = await r.getEmployeeBranchDisplay(req.employee_id);
    const { displayTimeZone, displayDateFormat } = publicDisplayFromBranch(
      branchRow?.branch_tz,
      branchRow?.branch_df,
    );
    const appliedInstant = req.applied_at ? new Date(req.applied_at) : new Date();
    const appliedAtFormatted = formatLeaveAppliedAt(req.applied_at, displayTimeZone, displayDateFormat);
    const ctx: Record<string, string> = {
      employee_name: empName,
      leave_type: req.type_name || "Leave",
      start_date: String(req.start_date).slice(0, 10),
      end_date: String(req.end_date).slice(0, 10),
      total_days: String(req.total_days),
      day_type: dayType,
      day_type_label: formatLeaveDayTypeLabel(dayType),
      duration_summary: formatLeaveDurationSummary(req.total_days, dayType),
      applied_at: appliedAtFormatted,
      submitted_at: appliedAtFormatted,
      timezone_label: formatTimezoneContextLabel(displayTimeZone, appliedInstant),
      reason: req.reason || "—",
      rejection_reason: req.rejection_reason || "—",
      request_id: requestId,
      ...extraCtx,
    };
    const recipients: Recipient[] = [];
    for (const id of recipientEmployeeIds) {
      const rec = await getEmployeeEmail(id);
      if (rec) recipients.push(rec);
    }
    recipients.push(...extraRecipients);
    const merged = dedupeRecipientsByEmail(recipients);
    if (merged.length) await notifyEmail(eventKey, ctx, merged);
  } catch (e) {
    console.error("[leave-notify]", (e as Error)?.message);
  }
}

// ── Business day counting ────────────────────────────────────────────────────────
/** workweek: array of JS Date.getDay() values that are working days (0=Sun…6=Sat). Default Mon–Fri = [1,2,3,4,5]. */
async function countBusinessDays(startDate: string, endDate: string, dayType: string, workweek?: number[]): Promise<number> {
  const r = new LeaveRepository();
  const holidays = await r.getHolidaysBetween(startDate, endDate);
  const holidaySet = new Set(holidays.map((h) => typeof h.date==="string"?h.date:(h.date as any).toISOString?.().slice(0,10)));
  const workdaySet = new Set(workweek ?? [1,2,3,4,5]);
  const start=new Date(startDate+"T00:00:00"), end=new Date(endDate+"T00:00:00");
  let count=0; const cur=new Date(start);
  while(cur<=end) { const dow=cur.getDay(); const ds=cur.toISOString().slice(0,10); if(workdaySet.has(dow)&&!holidaySet.has(ds)) count++; cur.setDate(cur.getDate()+1); }
  const isHalf = isHalfDayLeaveType(dayType);
  return isHalf?count*0.5:count;
}

// ── Policy matching ─────────────────────────────────────────────────────────────
function parseJsonArray(v: any): string[] { if(Array.isArray(v)) return v; if(typeof v==="string"&&v) try{return JSON.parse(v)}catch{return []} return []; }
function policyAllowedForRole(policy: any, userRole: string) { const roles=parseJsonArray(policy.applicable_roles); return roles.length===0||roles.includes(userRole); }

function isBereavementLeaveType(lt: { name?: unknown }): boolean {
  const name = String(lt.name ?? "").trim().toLowerCase();
  return name.includes("bereavement") || name === "b l" || name === "bl";
}

function isEarnedLeaveTypeName(name: unknown): boolean {
  return /earned|annual|^el$/i.test(String(name ?? "").trim());
}

function isCompensationLeaveType(lt: { is_compensation_leave?: boolean; isCompensationLeave?: boolean; name?: unknown; type_name?: unknown }): boolean {
  if (lt.is_compensation_leave ?? lt.isCompensationLeave) return true;
  const n = String(lt.type_name ?? lt.name ?? "").trim().toLowerCase();
  return /compensation|comp[\s-]?off/.test(n);
}

function allowsManualBalanceCredit(lt: { name?: unknown; type_name?: unknown; is_compensation_leave?: boolean; isCompensationLeave?: boolean }): boolean {
  if (isCompensationLeaveType(lt)) return true;
  const name = lt.type_name ?? lt.name ?? "";
  return isEarnedLeaveTypeName(name);
}

/** When compensation leave is enabled, enforce no accrual / no carry forward. */
function normalizeCompensationLeaveBody(body: Record<string, unknown>): Record<string, unknown> {
  if (!body.isCompensationLeave) return body;
  return {
    ...body,
    accrualType: "none",
    accrualRate: null,
    carryForwardAllowed: false,
    maxCarryForward: null,
    prorationRequired: false,
    carryoverExpiryDays: null,
  };
}

/** Opening balance when a row is first created (and bereavement default when max_balance unset). */
function initialLeaveBalanceForType(lt: any): { balance: number; useNullAccrual: boolean } {
  if (isCompensationLeaveType(lt)) return { balance: 0, useNullAccrual: false };
  const isEarned = lt.accrual_type === "monthly" && isEarnedLeaveTypeName(lt.name);
  const maxBal = lt.max_balance != null ? parseInt(String(lt.max_balance), 10) : 0;
  if (isEarned) return { balance: 0, useNullAccrual: true };
  if (isBereavementLeaveType(lt)) {
    const n = Number.isFinite(maxBal) && maxBal > 0 ? maxBal : 2;
    return { balance: n, useNullAccrual: false };
  }
  const balance =
    lt.accrual_type === "yearly"
      ? maxBal
      : lt.accrual_type === "none" && maxBal > 0
        ? maxBal
        : 0;
  return { balance, useNullAccrual: false };
}

async function findAllMatchingPolicies(department: string, employeeType: string, userRole?: string, todayStr?: string): Promise<any[]> {
  const r = new LeaveRepository();
  const today = todayStr??new Date().toISOString().split("T")[0];
  const policies = await r.getAllActivePolicies(today);
  const scored: {policy:any;score:number}[] = [];
  for (const p of policies) {
    if (userRole&&!policyAllowedForRole(p,userRole)) continue;
    const depts=parseJsonArray(p.applicable_departments); const types=parseJsonArray(p.applicable_employment_types);
    const deptMatch=depts.length===0||depts.includes(department); const typeMatch=types.length===0||types.includes(employeeType);
    if(!deptMatch||!typeMatch) continue;
    let score=0; if(depts.length>0) score+=2; if(types.length>0) score+=1;
    scored.push({policy:p,score});
  }
  scored.sort((a,b)=>b.score-a.score);
  return scored.map(s=>s.policy);
}

async function initializeEmployeeBalances(employeeId: string, department: string, employeeType: string, performedBy?: string) {
  const r = new LeaveRepository();
  const policies = await findAllMatchingPolicies(department, employeeType);
  if(!policies.length) return;
  const policy = policies[0];
  const leaveTypes = await r.getPolicyTypes(policy.id);
  const existingSet = new Set((await r.getBalancesForEmployee(employeeId, leaveTypes.map((lt:any)=>lt.id))).map((b:any)=>b.leave_type_id));
  const toInsert = leaveTypes.filter((lt:any)=>!existingSet.has(lt.id));
  await Promise.all(toInsert.map(async (lt:any)=>{
    const { balance: init, useNullAccrual } = initialLeaveBalanceForType(lt);
    if (useNullAccrual) await r.insertBalanceWithNullAccrual(employeeId, lt.id);
    else await r.insertBalance(employeeId, lt.id, init);
    await r.audit("balance",employeeId,"initialize",performedBy||"system",{leaveTypeId:lt.id,policyId:policy.id,initialBalance:useNullAccrual?0:init});
  }));
  const bereavementLt = leaveTypes.find((lt: any) => isBereavementLeaveType(lt));
  if (bereavementLt) {
    const maxB = bereavementLt.max_balance != null ? parseInt(String(bereavementLt.max_balance), 10) : 0;
    const target = Number.isFinite(maxB) && maxB > 0 ? maxB : 2;
    const rows = await r.getBalance(employeeId, bereavementLt.id);
    if (rows.length && target > 0) {
      const row = rows[0];
      const bal = parseFloat(String(row.balance ?? "0"));
      const used = parseFloat(String(row.used ?? "0"));
      if (bal === 0 && used === 0) {
        await r.adjustBalance(row.id, target);
        await r.audit("balance",employeeId,"initialize",performedBy||"system",{leaveTypeId:bereavementLt.id,policyId:policy.id,initialBalance:target,bereavementSync:true});
      }
    }
  }
}

// ── Accrual engines ─────────────────────────────────────────────────────────────

/**
 * Accrual calendar month (YYYY-MM). On the 1st in DEFAULT_TIMEZONE we accrue the
 * current month (month-start cron). Otherwise use yesterday so catch-up runs align
 * with the month that just ended.
 */
function accrualPeriodYmd(): string {
  const today = todayInTz(getDefaultTz());
  const ref =
    today.length >= 10 && today.slice(8, 10) === "01"
      ? today
      : yesterdayYmdFromTodayYmd(today);
  return ref.slice(0, 7);
}

/** Last calendar day of YYYY-MM (UTC date math; join/accrual dates are date-only). */
function lastDayOfPeriodYmd(period: string): string {
  const [ys, ms] = period.split("-");
  const y = parseInt(ys, 10);
  const m = parseInt(ms, 10);
  if (!y || !m) return `${period}-28`;
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Earned Leave monthly credit (migration 0022): 1 day per month, pro-rated in join
 * month (15+ days in month → 0.5, 30+ → full rate).
 */
export function earnedLeaveMonthlyCredit(
  joinYmd: string,
  period: string,
  rate: number,
): number {
  if (!joinYmd || rate <= 0) return 0;
  const monthStart = `${period}-01`;
  const monthEnd = lastDayOfPeriodYmd(period);
  if (joinYmd > monthEnd) return 0;
  if (joinYmd <= monthStart) return rate;
  const days = diffCalendarDaysInclusive(joinYmd, monthEnd);
  if (days >= 30) return rate;
  if (days >= 15) return rate >= 1 ? 0.5 : rate * 0.5;
  return 0;
}

function monthlyAccrualCredit(
  b: { type_name?: string; join_date?: unknown; accrual_rate?: string },
  period: string,
): number {
  const baseRate = parseFloat(b.accrual_rate || "0");
  if (!Number.isFinite(baseRate) || baseRate <= 0) return 0;
  if (!isEarnedLeaveTypeName(b.type_name)) return baseRate;
  const joinYmd = b.join_date ? toYmdDateOnly(b.join_date as string | Date) : "";
  return earnedLeaveMonthlyCredit(joinYmd, period, baseRate);
}

/**
 * Monthly accrual for all `accrual_type = monthly` types (including Earned Leave).
 * Gate is `YYYY-MM` in leave_accrual_run — one run per calendar month.
 */
async function runMonthlyAccrual(period: string): Promise<{ total: number; earnedLeave: number }> {
  const r = new LeaveRepository();
  const elTypeId = await r.findEarnedLeaveTypeId();
  if (elTypeId) await r.ensureEarnedLeaveBalanceRowsForActive(elTypeId);

  const balances = await r.getMonthlyAccrualBalances(period);
  const toAccrue = balances
    .map((b: any) => {
      const rate = monthlyAccrualCredit(b, period);
      if (rate <= 0) return null;
      const cur = parseFloat(b.balance || "0");
      const max = parseInt(b.max_balance || "999", 10);
      const nb = Math.min(cur + rate, max);
      const isEl = isEarnedLeaveTypeName(b.type_name);
      return nb > cur ? { ...b, rate, cur, nb, isEl } : null;
    })
    .filter(Boolean) as any[];

  const BATCH = 20;
  for (let i = 0; i < toAccrue.length; i += BATCH) {
    const batch = toAccrue.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (b: any) => {
        await r.updateAccrual(b.id, b.nb);
        await r.audit("balance", b.employee_id, "accrue", "system", {
          leaveTypeId: b.leave_type_id,
          accrued: b.rate,
          prev: b.cur,
          new: b.nb,
          period,
        });
      }),
    );
  }
  return {
    total: toAccrue.length,
    earnedLeave: toAccrue.filter((b) => b.isEl).length,
  };
}

/**
 * Lazy accrual on balance / stats reads. Gated by YYYY-MM — safe on every page load.
 */
export async function ensureAccrualRun() {
  const period = accrualPeriodYmd();
  const r = new LeaveRepository();
  try {
    const inserted = await r.tryInsertAccrualRun(period);
    if (inserted.length > 0) await runMonthlyAccrual(period);
  } catch {}
}
// ── Year-end reset ──────────────────────────────────────────────────────────────
async function processBereavementYearEnd(year: number, employees: any[], performedBy: string|null, policyId?: string|null) {
  const r = new LeaveRepository();
  const btId=await r.findBereavementLeaveTypeId(policyId); if(!btId) return 0;
  const resetDate=`${year}-01-01T00:00:00.000Z`; const DAYS=2; let count=0;
  for(const emp of employees) {
    try {
      const rows=await r.getELBalance(emp.id,btId);
      if(!rows.length) { await r.snapshotBalance(emp.id,btId,year,0,0); await r.insertBereavementBalance(emp.id,btId,DAYS,resetDate); await r.audit("balance",emp.id,"YEAR_END_RESET",performedBy,{leave_type_id:btId,year,set_balance:DAYS}); count++; continue; }
      const row=rows[0]; if(row.last_reset_at&&new Date(row.last_reset_at).getFullYear()===year) continue;
      await r.snapshotBalance(emp.id,btId,year,row.balance||0,row.used||0); await r.resetBereavementBalance(row.id,DAYS,resetDate); await r.audit("balance",row.id,"YEAR_END_RESET",performedBy,{employee_id:emp.id,leave_type_id:btId,year,set_balance:DAYS}); count++;
    } catch {}
  }
  return count;
}

async function processCompensationYearEnd(year: number, employees: any[], performedBy: string|null, policyId?: string|null) {
  const r = new LeaveRepository();
  const compTypes = await r.findCompensationLeaveTypes(policyId);
  if (!compTypes.length) return 0;
  const resetDate = `${year}-01-01T00:00:00.000Z`;
  let count = 0;
  for (const lt of compTypes) {
    for (const emp of employees) {
      try {
        const rows = await r.getBalance(emp.id, lt.id);
        if (!rows.length) continue;
        const row = rows[0];
        if (row.last_reset_at && new Date(row.last_reset_at).getFullYear() === year) continue;
        await r.snapshotBalance(emp.id, lt.id, year, row.balance || 0, row.used || 0);
        await r.resetELBalance(row.id, resetDate);
        await r.audit("balance", row.id, "YEAR_END_RESET", performedBy, {
          employee_id: emp.id,
          leave_type_id: lt.id,
          year,
          set_balance: 0,
          compensation_leave: true,
        });
        count++;
      } catch { /* per-employee */ }
    }
  }
  return count;
}

// ── Approval chain ──────────────────────────────────────────────────────────────
function shouldAutoApprove(leaveType: any, totalDays: number, inNotice: boolean) {
  if(inNotice) return false;
  if(!leaveType.requires_approval) return true;
  const rules=leaveType.auto_approve_rules;
  if(rules&&typeof rules==="object") { const maxDays=(rules as any).maxDays; if(maxDays!=null&&totalDays<=maxDays) return true; }
  return false;
}

async function resolveManagerEmpId(r: LeaveRepository, emp: { manager_id?: string | null; manager_email?: string | null } | null, selfId: string): Promise<string | null> {
  if (!emp) return null;
  let mgrEmpId: string | null = null;
  if (emp.manager_id) {
    if (await r.getEmployeeById(emp.manager_id)) mgrEmpId = emp.manager_id;
    else { const byUser = await r.getUserEmployeeId(emp.manager_id); if (byUser) mgrEmpId = byUser; }
  }
  if (!mgrEmpId && emp.manager_email && String(emp.manager_email).trim()) {
    const rows = await r.getEmployeeIdByEmailForFtSync(String(emp.manager_email).trim());
    if (rows.length) mgrEmpId = (rows[0] as { id: string }).id;
  }
  return mgrEmpId && mgrEmpId !== selfId ? mgrEmpId : null;
}

async function buildApprovalChain(employeeId: string, leaveType: any, totalDays: number, inNotice: boolean) {
  const r = new LeaveRepository();
  const chain: {approverId:string;approverRole:string;stepOrder:number}[] = [];

  // ── Step 1: Direct manager ────────────────────────────────────────────────
  const emp = await r.getEmployeeManager(employeeId);
  const mgrEmpId = await resolveManagerEmpId(r, emp, employeeId);
  if (mgrEmpId) chain.push({ approverId: mgrEmpId, approverRole: "manager", stepOrder: 1 });

  // ── Step 2: Skip-level manager (three_step tier only) ────────────────────
  const tier = await r.getEmployeeApprovalTier(employeeId);
  if (tier === "three_step" && mgrEmpId) {
    const mgrRow = await r.getManagersManager(mgrEmpId);
    const skipMgrId = await resolveManagerEmpId(r, mgrRow, mgrEmpId);
    // Only add if distinct from step-1 manager and from the applicant
    if (skipMgrId && skipMgrId !== mgrEmpId && skipMgrId !== employeeId && !chain.some(s => s.approverId === skipMgrId)) {
      chain.push({ approverId: skipMgrId, approverRole: "second_manager", stepOrder: 2 });
    }
  }

  // ── Step N: HR (conditionally) ────────────────────────────────────────────
  const noManager = chain.length === 0;
  const needsHR = leaveType.hr_approval_required || inNotice || totalDays > 5 || noManager || tier === "three_step";
  // HR step: only users with role='hr'. Admins excluded — if admin is also reporting manager they enter as "manager".
  if (needsHR) {
    let hrs = await r.getHrAdminUsers(employeeId);
    if (!hrs.length) {
      const hrUsers = await r.getHrUsers();
      for (const hu of hrUsers) {
        if (hu.employee_id) { if ((await r.verifyEmployee(hu.employee_id)) && hu.employee_id !== employeeId) { hrs = [{ employee_id: hu.employee_id, user_id: hu.id, role: hu.role }]; break; } }
        if (hu.email) { const eByEmail = await r.getEmployeeByEmail(hu.email); if (eByEmail?.id && eByEmail.id !== employeeId) { await r.updateUserEmployeeId(hu.id, eByEmail.id); hrs = [{ employee_id: eByEmail.id, user_id: hu.id, role: hu.role }]; break; } if (hu.email) { const ne = await r.createSystemEmployee(hu.email, hu.role); if (ne) { await r.updateUserEmployeeId(hu.id, ne.id); hrs = [{ employee_id: ne.id, user_id: hu.id, role: hu.role }]; break; } } }
      }
    }
    if (hrs.length > 0 && !chain.some(s => s.approverId === hrs[0].employee_id)) chain.push({ approverId: hrs[0].employee_id, approverRole: "hr", stepOrder: chain.length + 1 });
    else if (!hrs.length) console.warn("[leave] WARNING: No HR/admin approver found.");
  }

  const ids = chain.map(s => s.approverId);
  if (!ids.length) return [];
  const verified = await r.verifyEmployees(ids);
  const vSet = new Set(verified.map((r: any) => r.id));
  return chain.filter(s => vSet.has(s.approverId));
}

/** Reporting manager employee id (same resolution as the manager step in the leave approval chain). */
async function resolveReportingManagerEmployeeId(r: LeaveRepository, employeeId: string): Promise<string | null> {
  const emp = await r.getEmployeeManager(employeeId);
  let mgrEmpId: string | null = null;
  if (emp?.manager_id) {
    if (await r.getEmployeeById(emp.manager_id)) mgrEmpId = emp.manager_id;
    else {
      const byUser = await r.getUserEmployeeId(emp.manager_id);
      if (byUser) mgrEmpId = byUser;
    }
  }
  if (!mgrEmpId && emp?.manager_email && String(emp.manager_email).trim()) {
    const rows = await r.getEmployeeIdByEmailForFtSync(String(emp.manager_email).trim());
    if (rows.length) mgrEmpId = (rows[0] as { id: string }).id;
  }
  if (mgrEmpId && mgrEmpId !== employeeId) return mgrEmpId;
  return null;
}

// ── Attendance sync ─────────────────────────────────────────────────────────────
async function syncLeaveToAttendance(requestId: string): Promise<boolean> {
  const r = new LeaveRepository();
  const req=await r.getRequestForSync(requestId); if(!req) return false;
  const start=new Date(req.start_date+"T00:00:00"), end=new Date(req.end_date+"T00:00:00");
  const holidays=await r.getHolidaysBetween(req.start_date,req.end_date);
  const holidaySet=new Set(holidays.map((h:any)=>typeof h.date==="string"?h.date:(h.date as any).toISOString?.().slice(0,10)));
  const cur=new Date(start);
  const isHalf = isHalfDayLeaveType(req.day_type);
  const halfLabel = formatLeaveDayTypeLabel(req.day_type);
  while(cur<=end) { const dateStr=cur.toISOString().split("T")[0]; const dow=cur.getDay(); if(dow!==0&&dow!==6&&!holidaySet.has(dateStr)) { const status=isHalf?"half_day":"absent"; const remarks=isHalf?`On leave: ${req.type_name} (${halfLabel})`:`On leave: ${req.type_name}`; const existing=await r.getAttendanceRecord(req.employee_id,dateStr); await r.upsertAttendanceLeave(req.employee_id,dateStr,status,remarks,existing); } cur.setDate(cur.getDate()+1); }
  return true;
}

async function reverseAttendanceSync(requestId: string) {
  const r = new LeaveRepository();
  const req=await r.getRequestById(requestId); if(!req) return;
  const start=new Date(req.start_date+"T00:00:00"), end=new Date(req.end_date+"T00:00:00"); const cur=new Date(start);
  while(cur<=end) { if(cur.getDay()!==0&&cur.getDay()!==6) { const ds=cur.toISOString().split("T")[0]; await r.deleteLeaveAttendance(req.employee_id,ds); } cur.setDate(cur.getDate()+1); }
}

export class LeaveService {
  private readonly r = new LeaveRepository();

  private regionsFor(ctx?: LeaveRegionCtx): string[] | null {
    return ctx ? effectiveRegionsFor(ctx, ctx.requestedRegion) : null;
  }

  private async assertEmployeeInScope(ctx: LeaveRegionCtx | undefined, employeeId: string): Promise<void> {
    if (!ctx) return;
    const regions = this.regionsFor(ctx);
    if (regions === null) return;
    const empRegion = await getEmployeeRegion(employeeId);
    if (regions.length === 0 || !empRegion || !regions.includes(empRegion)) {
      throw new ForbiddenError("This employee belongs to a different region.");
    }
  }

  private async assertRequestInScope(ctx: LeaveRegionCtx | undefined, requestId: string): Promise<void> {
    const req = await this.r.getRequestById(requestId);
    if (!req?.employee_id) return;
    await this.assertEmployeeInScope(ctx, String(req.employee_id));
  }

  /** Match FreshTeam employee to ours: try official_email then personal_email vs our work_email or personal_email. */
  private async resolveOurEmployeeIdFromFt(ft: { official_email?: string; personal_email?: string | null }) {
    const tried = new Set<string>();
    for (const raw of [ft.official_email, ft.personal_email]) {
      const e = String(raw ?? "").trim().toLowerCase();
      if (!e) continue;
      for (const key of freshteamWorkEmailMatchKeys(e)) {
        if (!key || tried.has(key)) continue;
        tried.add(key);
        const rows = await this.r.getEmployeeIdByEmailForFtSync(key);
        if (rows.length) return (rows[0] as { id: string }).id;
      }
    }
    return null;
  }

  /**
   * When `users.employee_id` is unset, match login email to `employees.work_email` or `personal_email`
   * so managers/approvers can see pending leave and act on approvals.
   */
  private async effectiveEmployeeIdForLeave(employeeId: string | null | undefined, user: UserPayload | undefined): Promise<string | null> {
    if (employeeId) return employeeId;
    const email = user?.email?.trim().toLowerCase();
    if (!email) return null;
    for (const key of freshteamWorkEmailMatchKeys(email)) {
      const rows = await this.r.getEmployeeIdByEmailForFtSync(key);
      if (rows.length) return (rows[0] as { id: string }).id;
    }
    return null;
  }

  // ── Policies ────────────────────────────────────────────────────────────────────
  async listPolicies() {
    const cached=memCache.get<any[]>("leave:policies"); if(cached) return cached;
    const p=await this.r.listPolicies(); memCache.set("leave:policies",p,30_000); return p;
  }
  async getPolicyById(id: string) {
    const p=await this.r.getPolicyById(id); if(!p) throw new NotFoundError("Policy",id);
    const types=await this.r.getPolicyTypes(id); return {...p, leave_types:types};
  }
  async createPolicy(body: any, performedBy: string) {
    if(!body.name?.trim()) throw new ValidationError("Policy name is required");
    if(!body.effectiveFrom) throw new ValidationError("effectiveFrom date is required (YYYY-MM-DD)");
    const p=await this.r.insertPolicy({
      name: body.name.trim(),
      effectiveFrom: body.effectiveFrom,
      effectiveTo: body.effectiveTo||null,
      applicableDepartments: body.applicableDepartments||[],
      applicableEmploymentTypes: body.applicableEmploymentTypes||[],
      applicableRoles: body.applicableRoles||[],
      policyYear: body.policyYear||null,
      isActive: body.isActive!==false,
      isDefault: !!body.isDefault,
      unit: body.unit||"days",
      workweek: body.workweek||(body.unit==="hours"?[1,2,3,4,5]:[1,2,3,4,5]),
      holidayCalendarName: body.holidayCalendarName||null,
      periodStartMonth: body.periodStartMonth||1,
      createdBy: performedBy,
    });
    await this.r.audit("policy",p.id,"create",performedBy,{name:p.name,effectiveFrom:p.effective_from});
    memCache.invalidate("leave:policies");
    return p;
  }
  async updatePolicy(id: string, body: any, performedBy: string) {
    const p=await this.r.updatePolicy(id, body); if(!p) throw new NotFoundError("Policy",id);
    await this.r.audit("policy",id,"update",performedBy,body); memCache.invalidate("leave:policies"); return p;
  }
  async deletePolicy(id: string) {
    if(await this.r.policyHasRequests(id)) throw new ForbiddenError("Cannot delete policy: leave requests exist.");
    await this.r.deletePolicy(id); memCache.invalidate("leave:policies");
  }

  // ── Leave Types ──────────────────────────────────────────────────────────────────
  async createType(body: any, performedBy: string) {
    if(!body.policyId) throw new ValidationError("policyId is required");
    if(!body.name?.trim()) throw new ValidationError("Leave type name is required");
    const policy=await this.r.getPolicyById(body.policyId);
    if(!policy) throw new NotFoundError("Policy",body.policyId);
    const normalized = normalizeCompensationLeaveBody(body);
    const t=await this.r.insertType({
      policyId: normalized.policyId,
      name: String(normalized.name).trim(),
      paid: normalized.paid!==false,
      accrualType: normalized.accrualType||"none",
      accrualRate: normalized.accrualRate!=null?String(normalized.accrualRate):null,
      maxBalance: normalized.maxBalance!=null?parseInt(String(normalized.maxBalance),10):21,
      carryForwardAllowed: !!normalized.carryForwardAllowed,
      maxCarryForward: normalized.maxCarryForward!=null?parseInt(String(normalized.maxCarryForward),10):null,
      requiresDocument: !!normalized.requiresDocument,
      requiresApproval: normalized.requiresApproval!==false,
      autoApproveRules: normalized.autoApproveRules||null,
      hrApprovalRequired: !!normalized.hrApprovalRequired,
      minDays: normalized.minDays!=null?parseInt(String(normalized.minDays),10):null,
      maxDaysPerRequest: normalized.maxDaysPerRequest!=null?parseInt(String(normalized.maxDaysPerRequest),10):null,
      blockedDuringNotice: !!normalized.blockedDuringNotice,
      prorationRequired: !!normalized.prorationRequired,
      allowNegativeBalance: !!normalized.allowNegativeBalance,
      carryoverExpiryDays: normalized.carryoverExpiryDays!=null?parseInt(String(normalized.carryoverExpiryDays),10):null,
      backdatingLimitDays: normalized.backdatingLimitDays!=null?parseInt(String(normalized.backdatingLimitDays),10):null,
      minNoticeDays: normalized.minNoticeDays!=null?parseInt(String(normalized.minNoticeDays),10):null,
      mandatoryAttachmentAboveDays: normalized.mandatoryAttachmentAboveDays!=null?parseInt(String(normalized.mandatoryAttachmentAboveDays),10):null,
      mandatoryAttachmentOnBehalf: !!normalized.mandatoryAttachmentOnBehalf,
      waitingPeriodDays: normalized.waitingPeriodDays!=null?parseInt(String(normalized.waitingPeriodDays),10):null,
      isCompensationLeave: !!normalized.isCompensationLeave,
      color: normalized.color||"#3b82f6",
    });
    await this.r.audit("type",t.id,"create",performedBy,{name:t.name,policyId:t.policy_id});
    // Auto-initialize balances for all active employees
    await this.bulkInitNewType(t.id);
    return t;
  }
  async bulkInitNewType(typeId: string) {
    const lt=await this.r.getTypeById(typeId);
    if(!lt) throw new NotFoundError("Leave type",typeId);
    const employees=await this.r.getActiveEmployees();
    let initialized=0;
    const { balance: initBalance, useNullAccrual } = initialLeaveBalanceForType(lt);
    for(const emp of employees as any[]) {
      try {
        const existing=await this.r.getBalance(emp.id,typeId);
        if(existing.length>0) continue;
        if(useNullAccrual) await this.r.insertBalanceWithNullAccrual(emp.id,typeId);
        else await this.r.insertBalance(emp.id,typeId,initBalance);
        initialized++;
      } catch {}
    }
    return {success:true,initialized,total:(employees as any[]).length};
  }
  async updateType(id: string, body: any, performedBy: string) {
    const normalized = normalizeCompensationLeaveBody(body);
    if(normalized.maxBalance!=null) { const n=parseInt(String(normalized.maxBalance),10); if(!Number.isNaN(n)&&(await this.r.typeBalancesAbove(id,n))) throw new ValidationError("Cannot reduce max_balance: some employees have balance above the new maximum."); }
    const t=await this.r.updateType(id, normalized); if(!t) throw new NotFoundError("Leave type",id);
    await this.r.audit("type",id,"update",performedBy,normalized); return t;
  }
  async deleteType(id: string) {
    if(await this.r.typeHasRequests(id)) throw new ForbiddenError("Cannot delete leave type: leave requests reference it.");
    await this.r.deleteType(id);
  }

  // ── Balances ──────────────────────────────────────────────────────────────────────
  async getBalances(employeeId: string, ctx?: LeaveRegionCtx, viewerEmployeeId?: string | null, role?: string) {
    if (viewerEmployeeId !== employeeId && (role === "admin" || role === "hr")) {
      await this.assertEmployeeInScope(ctx, employeeId);
    }
    await ensureAccrualRun();
    return this.r.getBalances(employeeId);
  }
  async getAllBalances(ctx?: LeaveRegionCtx) { await ensureAccrualRun(); return this.r.getAllBalances(this.regionsFor(ctx)); }
  async initializeBalances(employeeId: string, performedBy: string, ctx?: LeaveRegionCtx) {
    await this.assertEmployeeInScope(ctx, employeeId);
    const emp=await this.r.getEmployeeDeptType(employeeId); if(!emp) throw new NotFoundError("Employee",employeeId);
    await initializeEmployeeBalances(employeeId, emp.department||"Other", emp.employee_type||"full_time", performedBy);
    return {success:true};
  }
  /** Leave balances use half-day or full-day only (.5 or 1). */
  private static roundToHalfDay(n: number): number { return Number.isFinite(n) ? Math.round(n * 2) / 2 : 0; }
  async adjustBalance(balanceId: string, newBalance: number, reason: string, performedBy: string, ctx?: LeaveRegionCtx) {
    if(newBalance==null) throw new ValidationError("newBalance required");
    if(!reason) throw new ValidationError("Reason required");
    const rounded = LeaveService.roundToHalfDay(Number(newBalance));
    const existing=await this.r.getBalanceById(balanceId); if(!existing) throw new NotFoundError("Balance",balanceId);
    await this.assertEmployeeInScope(ctx, String(existing.employee_id));
    if(!allowsManualBalanceCredit(existing)) throw new ForbiddenError("Balance adjustments are only allowed for Earned Leave or Compensation Leave.");
    let capped = rounded;
    if (existing.is_compensation_leave) {
      const maxBal = existing.type_max_balance != null ? parseInt(String(existing.type_max_balance), 10) : null;
      if (maxBal != null && Number.isFinite(maxBal)) capped = Math.min(capped, maxBal);
    }
    await this.r.adjustBalance(balanceId, capped);
    await this.r.audit("balance",existing.employee_id,"adjust",performedBy,{balanceId,previousBalance:existing.balance,newBalance:capped,reason});
    return {success:true};
  }
  async addBalance(employeeId: string, leaveTypeId: string, daysToAdd: number, reason: string, performedBy: string, dateWorked?: string, ctx?: LeaveRegionCtx) {
    if(!reason) throw new ValidationError("Reason required");
    const delta=LeaveService.roundToHalfDay(parseFloat(String(daysToAdd))); if(Number.isNaN(delta)) throw new ValidationError("daysToAdd must be a number");
    await this.assertEmployeeInScope(ctx, employeeId);
    const emp=await this.r.getEmployeeDeptType(employeeId); if(!emp) throw new NotFoundError("Employee",employeeId);
    const lt=await this.r.getTypeById(leaveTypeId); if(!lt) throw new NotFoundError("Leave type",leaveTypeId);
    if(!allowsManualBalanceCredit(lt)) throw new ForbiddenError("Adding days is only allowed for Earned Leave or Compensation Leave.");
    let balRows=await this.r.getBalance(employeeId,leaveTypeId);
    if(!balRows.length) { await initializeEmployeeBalances(employeeId,emp.department||"Other",emp.employee_type||"full_time",performedBy); balRows=await this.r.getBalance(employeeId,leaveTypeId); }
    if(!balRows.length) throw new NotFoundError("Balance record",`${employeeId}/${leaveTypeId}`);
    const cur=parseFloat((balRows[0] as any).balance||"0");
    let nb=LeaveService.roundToHalfDay(Math.max(0,cur+delta));
    if (isCompensationLeaveType(lt)) {
      const maxBal = lt.max_balance != null ? parseInt(String(lt.max_balance), 10) : null;
      if (maxBal != null && Number.isFinite(maxBal)) nb = Math.min(nb, maxBal);
    }
    await this.r.addToBalance((balRows[0] as any).id, nb);
    await this.r.audit("balance",employeeId,"add",performedBy,{leaveTypeId,daysToAdd:delta,previousBalance:cur,newBalance:nb,reason,dateWorked:dateWorked||null});
    if (isCompensationLeaveType(lt)) {
      (async () => {
        try {
          const empRec = await getEmployeeEmail(employeeId);
          if (!empRec) return;
          const granterName = performedBy ? await resolveActorDisplayForEmail(performedBy) : "HR";
          const dw = (dateWorked ?? "").trim().slice(0, 10);
          let dateWorkedDisplay = "—";
          if (dw) {
            try {
              dateWorkedDisplay = new Date(`${dw}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
            } catch {
              dateWorkedDisplay = dw;
            }
          }
          const daysLabel = delta === 1 ? "1 day" : `${delta} days`;
          await notifyEmail("leave.comp_off_granted", {
            employee_name: empRec.name || "Employee",
            granter_name: granterName,
            doer_name: granterName,
            leave_type: String(lt.name ?? lt.type_name ?? "Compensation Leave"),
            days_granted: String(delta),
            days_granted_label: daysLabel,
            previous_balance: String(cur),
            new_balance: String(nb),
            reason: reason.trim() || "—",
            date_worked: dateWorkedDisplay,
          }, [empRec]);
        } catch (e) {
          console.error("[leave-notify] comp_off_granted", (e as Error)?.message);
        }
      })();
    }
    emitRefreshAll();
    return {success:true,previousBalance:cur,newBalance:nb};
  }
  async runAccrual() {
    const period = accrualPeriodYmd();
    const r = new LeaveRepository();
    const inserted = await r.tryInsertAccrualRun(period);
    const { total, earnedLeave } =
      inserted.length > 0 ? await runMonthlyAccrual(period) : { total: 0, earnedLeave: 0 };
    return { success: true, accruedCount: total, earnedLeaveAccrued: earnedLeave };
  }
  async processYearEnd(year: number, performedBy: string|null, policyId?: string|null) {
    const r=this.r; const errors: string[] = []; let processed=0, skipped=0;
    const elTypeId=await r.findEarnedLeaveTypeId(policyId);
    if(elTypeId) {
      const resetDate=`${year}-01-01T00:00:00.000Z`;
      const employees=await r.getActiveEmployeesWithCode();
      for(const emp of employees as any[]) {
        try {
          let balRows=await r.getELBalance(emp.id,elTypeId);
          if(!balRows.length) { const d=await r.getEmployeeDeptType(emp.id); if(d) await initializeEmployeeBalances(emp.id,d.department||"Other",d.employee_type||"full_time",performedBy||undefined); balRows=await r.getELBalance(emp.id,elTypeId); }
          if(!balRows.length) { skipped++; continue; }
          const row=balRows[0]; if(row.last_reset_at&&new Date(row.last_reset_at).getFullYear()===year) { skipped++; continue; }
          await r.snapshotBalance(emp.id,elTypeId,year,row.balance||0,row.used||0);
          await r.resetELBalance(row.id,resetDate);
          await r.audit("balance",row.id,"YEAR_END_RESET",performedBy,{employee_id:emp.id,leave_type_id:elTypeId,year,set_balance:0});
          processed++;
        } catch(e:any) { errors.push(`employee ${(emp as any).employee_id}: ${e?.message??String(e)}`); }
      }
    }
    const employees=await r.getActiveEmployeesWithCode();
    const bereavementProcessed=await processBereavementYearEnd(year,employees,performedBy,policyId);
    const compensationProcessed=await processCompensationYearEnd(year,employees,performedBy,policyId);
    return {processed,skipped,errors,bereavementProcessed,compensationProcessed};
  }

  // ── Holidays ──────────────────────────────────────────────────────────────────────
  async listHolidays() { return this.r.listHolidays(); }
  async createHoliday(date: string, name?: string) {
    if(!date||typeof date!=="string") throw new ValidationError("date required (YYYY-MM-DD)");
    const d=String(date).trim().slice(0,10); if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ValidationError("Invalid date; use YYYY-MM-DD");
    return this.r.createHoliday(d, name?String(name).trim()||null:null);
  }
  async deleteHoliday(id: string) { const ok=await this.r.deleteHoliday(id); if(!ok) throw new NotFoundError("Holiday",id); }

  // ── Leave Requests ────────────────────────────────────────────────────────────────
  async getMyRequests(employeeId: string|null|undefined, limit: number, offset: number) {
    if(!employeeId) return [];
    return this.r.getMyRequests(employeeId, Math.min(limit,200), offset);
  }
  async submitRequest(employeeId: string|null|undefined, body: any, userId: string, userTz: string, ctx?: LeaveRegionCtx) {
    if(!employeeId) throw new ValidationError("No employee profile linked");
    const isOnBehalf = body._callerEmployeeId && body._callerEmployeeId !== employeeId;
    if (isOnBehalf) await this.assertEmployeeInScope(ctx, employeeId);
    const {leaveTypeId,startDate,endDate,dayType,reason,attachmentUrl,notifyEmployeeIds}=body;
    if(!leaveTypeId||!startDate||!endDate) throw new ValidationError("leaveTypeId, startDate, endDate required");
    if(endDate<startDate) throw new ValidationError("End date cannot be before start date");
    const [emp,lt]=await Promise.all([this.r.getEmployeeDetails(employeeId), this.r.getTypeById(leaveTypeId)]);
    if(!emp) throw new NotFoundError("Employee",employeeId);
    if(!lt) throw new NotFoundError("Leave type",leaveTypeId);
    if(emp.employment_status==="offboarded") throw new ValidationError("Offboarded employees cannot apply");
    if(emp.join_date&&startDate<new Date(emp.join_date).toISOString().split("T")[0]) throw new ValidationError("Cannot apply before joining date");
    if(emp.exit_date) { const exitStr=new Date(emp.exit_date).toISOString().split("T")[0]; if(endDate>exitStr) throw new ValidationError(`Cannot take leave beyond exit date (${exitStr})`); }
    const ltPolicy=await this.r.getPolicyById(lt.policy_id); if(!ltPolicy?.is_active) throw new ValidationError(`Leave type "${lt.name}" belongs to an inactive or missing policy`);
    const today=userTz.slice(0,10)||new Date().toISOString().slice(0,10);
    if(ltPolicy.effective_from>today||(ltPolicy.effective_to&&ltPolicy.effective_to<today)) throw new ValidationError(`Leave type "${lt.name}" belongs to a policy outside its effective date range`);
    const inNotice=await this.r.isInNoticePeriod(employeeId);
    if(lt.blocked_during_notice&&inNotice) throw new ValidationError(`${lt.name} is blocked during notice period`);

    // ── Waiting period after join ──
    if(lt.waiting_period_days!=null&&emp.join_date) {
      const joinDate=new Date(new Date(emp.join_date).toISOString().slice(0,10)+"T00:00:00");
      const todayDate=new Date(today+"T00:00:00");
      const daysSinceJoin=Math.floor((todayDate.getTime()-joinDate.getTime())/86400000);
      if(daysSinceJoin<lt.waiting_period_days) throw new ValidationError(`${lt.name} has a ${lt.waiting_period_days}-day waiting period from your joining date. ${lt.waiting_period_days-daysSinceJoin} day(s) remaining.`);
    }

    // ── Back-dating limit ──
    if(lt.backdating_limit_days!=null) {
      const startD=new Date(startDate+"T00:00:00"); const todayD=new Date(today+"T00:00:00");
      const daysBack=Math.floor((todayD.getTime()-startD.getTime())/86400000);
      if(daysBack>lt.backdating_limit_days) throw new ValidationError(`${lt.name} allows back-dating by at most ${lt.backdating_limit_days} day(s). Your start date is ${daysBack} day(s) in the past.`);
    }

    // ── Minimum notice before leave start ──
    if(lt.min_notice_days!=null) {
      const startD=new Date(startDate+"T00:00:00"); const todayD=new Date(today+"T00:00:00");
      const daysAhead=Math.floor((startD.getTime()-todayD.getTime())/86400000);
      if(daysAhead<lt.min_notice_days) throw new ValidationError(`${lt.name} requires at least ${lt.min_notice_days} day(s) notice before the leave start date.`);
    }

    // ── Attachment requirements ──
    const needsDocByType = lt.requires_document;
    const needsDocByDays = lt.mandatory_attachment_above_days != null; // evaluated after totalDays
    const needsDocOnBehalf = !!lt.mandatory_attachment_on_behalf && isOnBehalf;
    if(needsDocByType&&!attachmentUrl) throw new ValidationError(`${lt.name} requires a supporting document`);
    let attachmentUrlToStore: string | null = attachmentUrl && typeof attachmentUrl === "string" ? attachmentUrl.trim() || null : null;
    if(attachmentUrlToStore?.startsWith("data:") && isSharePointAvatarConfigured()) {
      const parsed = parseDataUrl(attachmentUrlToStore);
      if(parsed) {
        try {
          const extMap: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
          const ext = extMap[parsed.contentType?.toLowerCase?.().split(";")[0]?.trim() || ""] || "pdf";
          const fileName = `leave-${employeeId}-${Date.now()}.${ext}`;
          const url = await uploadFileToSharePoint("Leave/SupportingDocuments", fileName, parsed.buffer, parsed.contentType);
          if(url) attachmentUrlToStore = url;
        } catch (e) {
          console.warn("[leave] SharePoint supporting document upload failed:", (e as Error)?.message);
        }
      }
    }
    const policyWorkweek = ltPolicy.workweek ? (Array.isArray(ltPolicy.workweek) ? ltPolicy.workweek as number[] : (() => { try { return JSON.parse(ltPolicy.workweek as any) as number[]; } catch { return undefined; } })()) : undefined;
    const totalDays=await countBusinessDays(startDate,endDate,dayType||"full",policyWorkweek);
    if(totalDays<=0) throw new ValidationError("Invalid date range (no business days)");

    // Attachment mandatory above N days
    if(needsDocByDays&&lt.mandatory_attachment_above_days!=null&&totalDays>lt.mandatory_attachment_above_days&&!attachmentUrl) {
      throw new ValidationError(`${lt.name} requires a supporting document for requests longer than ${lt.mandatory_attachment_above_days} day(s).`);
    }
    // Attachment mandatory when applying on behalf
    if(needsDocOnBehalf&&!attachmentUrl) throw new ValidationError(`${lt.name} requires a supporting document when applying on behalf of an employee.`);
    if(lt.max_days_per_request&&totalDays>lt.max_days_per_request) throw new ValidationError(`Max ${lt.max_days_per_request} days per request`);
    if(lt.min_days&&totalDays<lt.min_days) throw new ValidationError(`Min ${lt.min_days} days required`);
    if(lt.paid) {
      const balRows=await this.r.getBalance(employeeId,leaveTypeId);
      const rawBal=balRows.length>0?parseFloat((balRows[0] as any).balance):0;
      const availableBal=Number.isFinite(rawBal)?Math.floor(rawBal*2)/2:0;
      if(availableBal<totalDays) throw new ValidationError(`Insufficient balance (${availableBal} available, ${totalDays} requested).`);
    }
    const overlap=await this.r.checkOverlap(employeeId,startDate,endDate);
    if(overlap.length>0) throw new ValidationError("Overlapping leave request exists for these dates");
    const policySnapshot=JSON.stringify({policyName:ltPolicy.name||null,leaveTypeName:lt.name||null,maxBalance:lt.max_balance!=null?Number(lt.max_balance):null,paid:!!lt.paid,requiresApproval:!!lt.requires_approval});
    const autoApprove=shouldAutoApprove(lt,totalDays,inNotice);
    const notifyIds=Array.isArray(notifyEmployeeIds)?notifyEmployeeIds.filter((id:unknown)=>typeof id==="string"):[];
    const notifyPeerIds=notifyIds.filter((id)=>id!==employeeId);
    if(autoApprove) {
      const req=await this.r.createAutoApprovedRequest({employeeId,leaveTypeId,startDate,endDate,dayType,totalDays,reason,attachmentUrl:attachmentUrlToStore,policySnapshot,notifyEmployeeIds:notifyIds.length?notifyIds:null});
      // Post-insert race check: another concurrent request may have slipped through the overlap check at the same time.
      const raceOverlap=await this.r.checkOverlapExcluding(employeeId,startDate,endDate,req.id);
      if(raceOverlap.length>0) { await this.r.deleteRequestById(req.id); throw new ValidationError("Overlapping leave request exists for these dates (concurrent submission detected). Please try again."); }
      if(lt.paid) {
        const deducted=await this.r.deductBalance(employeeId,leaveTypeId,totalDays);
        if(!deducted.length) {
          // Balance exhausted by a concurrent approval/auto-approve — roll back the request.
          await this.r.deleteRequestById(req.id);
          throw new ValidationError("Insufficient balance (concurrent update). Please refresh and try again.");
        }
      }
      let syncOk=false; try{syncOk=await syncLeaveToAttendance(req.id)}catch{}
      await this.r.updateRequestSyncStatus(req.id,syncOk?"synced":"failed");
      await this.r.audit("request",req.id,"auto_approve","system",{totalDays,leaveType:lt.name});
      if(notifyPeerIds.length) leaveNotify(this.r,"leave.notify_others",req.id,notifyPeerIds).catch(()=>{});
      emitRefreshAll();
      return {...req,autoApproved:true};
    }
    const chain=await buildApprovalChain(employeeId,lt,totalDays,inNotice);
    if(!chain.length) throw new ValidationError("Leave requires approval but no valid approvers found.");
    const req=await this.r.createRequest({employeeId,leaveTypeId,startDate,endDate,dayType,totalDays,reason,attachmentUrl:attachmentUrlToStore,policySnapshot,notifyEmployeeIds:notifyIds.length?notifyIds:null});
    // Post-insert race check: two concurrent submissions for the same dates both pass checkOverlap before either inserts.
    const raceOverlap=await this.r.checkOverlapExcluding(employeeId,startDate,endDate,req.id);
    if(raceOverlap.length>0) { await this.r.deleteRequestById(req.id); throw new ValidationError("Overlapping leave request exists for these dates (concurrent submission detected). Please try again."); }
    for(const step of chain) await this.r.createApproval({requestId:req.id,approverId:step.approverId,approverRole:step.approverRole,stepOrder:step.stepOrder});
    await this.r.audit("request",req.id,"create",employeeId,{totalDays,leaveType:lt.name,chain:chain.map(s=>({role:s.approverRole,approverId:s.approverId,step:s.stepOrder}))});
    // Email: notify only step-1 approver(s). Later steps are notified when the previous step approves.
    // For standard 2-step chains HR is always copied; for 3-step HR only notified at their own step.
    (async () => {
      const step1Ids = chain.filter((s) => s.stepOrder === 1).map((s) => s.approverId);
      const isThreeStep = chain.some((s) => s.approverRole === "second_manager");
      const empRegion = await getEmployeeRegion(employeeId);
      // HR gets a CC on submission only for the standard (non-three-step) chain
      const hrRecipients = isThreeStep ? [] : await getEmailsByRoleForRegion("hr", empRegion);
      await leaveNotify(this.r, "leave.submitted", req.id, step1Ids, {}, hrRecipients);
    })().catch(() => {});
    if (isOnBehalf) {
      (async () => {
        const caller = body._callerEmployeeId as string | undefined;
        const doerName = caller ? await resolveActorDisplayForEmail(caller) : "HR";
        await leaveNotify(this.r, "leave.on_behalf", req.id, [employeeId], { doer_name: doerName });
      })().catch(() => {});
    }
    if(notifyPeerIds.length) leaveNotify(this.r,"leave.notify_others",req.id,notifyPeerIds).catch(()=>{});
    emitRefreshAll();
    return req;
  }
  async cancelRequest(id: string, employeeId: string|null|undefined, userId: string, role: string) {
    const req=await this.r.getRequestById(id); if(!req) throw new NotFoundError("Request",id);
    if(req.employee_id!==employeeId&&role!=="admin"&&role!=="hr") throw new ForbiddenError("Can only cancel your own requests");
    if(req.status==="cancelled") throw new ValidationError("Already cancelled");
    const wasApproved=req.status==="approved";
    const cancelled=await this.r.cancelRequest(id);
    if(!cancelled.length) throw new ValidationError("Request already cancelled or rejected");
    await this.r.cancelPendingApprovals(id);
    if(wasApproved&&req.paid) { await this.r.restoreBalance(req.employee_id,req.leave_type_id,req.total_days); await reverseAttendanceSync(id); }
    await this.r.audit("request",id,"cancel",employeeId||userId,{wasApproved});
    // Email: reporting manager + role `hr` only (same audience as leave.submitted)
    (async () => {
      try {
        const reqRow = await this.r.getRequestById(id);
        if (!reqRow) return;
        const mgrId = await resolveReportingManagerEmployeeId(this.r, reqRow.employee_id);
        const empRegion = await getEmployeeRegion(reqRow.employee_id);
        const hrRecipients = await getEmailsByRoleForRegion("hr", empRegion);
        const managerIds = mgrId ? [mgrId] : [];
        await leaveNotify(this.r, "leave.cancelled", id, managerIds, {}, hrRecipients);
      } catch {
        /* ignore */
      }
    })();
    emitRefreshAll();
    return {success:true};
  }
  async deleteRequest(id: string, role: string, ctx?: LeaveRegionCtx) {
    if(role!=="admin"&&role!=="hr") throw new ForbiddenError("Only HR or admin can delete leave requests");
    const req=await this.r.getRequestById(id); if(!req) throw new NotFoundError("Request",id);
    await this.assertRequestInScope(ctx, id);
    const wasApproved=req.status==="approved";
    if(wasApproved&&req.paid) { await this.r.restoreBalance(req.employee_id,req.leave_type_id,req.total_days); await reverseAttendanceSync(id); }
    await this.r.cancelPendingApprovals(id);
    const deleted=await this.r.deleteRequest(id);
    if(!deleted.length) throw new NotFoundError("Request",id);
    await this.r.audit("request",id,"delete",null,{wasApproved,employee_id:req.employee_id});
    emitRefreshAll();
    return {success:true};
  }
  async listRequests(role: string, employeeId: string|null|undefined, query: any, user?: UserPayload, ctx?: LeaveRegionCtx) {
    const limit = 50;
    if (role === "employee") return { data: [], total: 0, page: 1, limit };
    const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
    const offset = (page - 1) * limit;
    const q = typeof query.q === "string" ? query.q : "";

    // Resolve limited_hr dept/office scope
    let scopedDepts: string[] | undefined;
    let scopedOffices: string[] | undefined;
    if (user) {
      const policy = await resolvePolicy(user);
      const sf = hrScopeFilter(policy);
      if (sf) {
        scopedDepts = sf.departments;
        scopedOffices = sf.offices;
      }
    }

    const lineMgrScope = hasOrgDerivedManagerScope(role, user?.roles);
    let scopedEmployeeId = employeeId;
    if (lineMgrScope && user) {
      scopedEmployeeId = await this.effectiveEmployeeIdForLeave(employeeId, user);
      if (!scopedEmployeeId) return { data: [], total: 0, page, limit };
    }

    const listRoleForTeamFilter = lineMgrScope ? "manager" : role;

    const { rows, total } = await this.r.listRequests({
      role: listRoleForTeamFilter,
      employeeId: scopedEmployeeId,
      status: query.status,
      from: query.from,
      to: query.to,
      q,
      limit,
      offset,
      scopedDepts,
      scopedOffices,
      regions: this.regionsFor(ctx),
    });
    return { data: rows, total, page, limit };
  }
  async getRequestDetail(id: string, role: string, employeeId: string|null|undefined, ctx?: LeaveRegionCtx) {
    const req=await this.r.getRequestWithTypeAndDecider(id); if(!req) throw new NotFoundError("Request",id);
    if(role==="employee"&&req.employee_id!==employeeId) throw new ForbiddenError("Access denied");
    if(role==="employee") return req;
    await this.assertRequestInScope(ctx, id);
    const approvals=await this.r.getApprovals(id);
    return {...req, approvals};
  }
  async getEmployeeRequests(employeeId: string, userId: string, role: string, myEmployeeId: string|null|undefined, user?: UserPayload, ctx?: LeaveRegionCtx) {
    const mgrView =
      hasOrgDerivedManagerScope(role, user?.roles) &&
      !!myEmployeeId &&
      (await this.r.isManagerOf(myEmployeeId, employeeId));
    const allowed = role === "admin" || role === "hr" || myEmployeeId === employeeId || mgrView;
    if (!allowed) throw new ForbiddenError("Access denied");
    if (role === "admin" || role === "hr") await this.assertEmployeeInScope(ctx, employeeId);
    return this.r.getEmployeeRequests(employeeId);
  }

  // ── Approvals ──────────────────────────────────────────────────────────────────────
  async getPendingApprovals(employeeId: string|null|undefined, role: string, user?: UserPayload, ctx?: LeaveRegionCtx) {
    const regions = this.regionsFor(ctx);
    const eid = await this.effectiveEmployeeIdForLeave(employeeId, user);
    const isHRLevel = role === "hr" || role === "admin" || role === "limited_hr";

    // Break-glass / system admins often have no users.employee_id and no employees row for their email —
    // effectiveEmployeeIdForLeave is null, but they must still see the org inbox (manager + hr + admin steps).
    if (!eid) {
      if (!isHRLevel) return [];
      if (role === "limited_hr") return [];
      if (role === "admin" || role === "hr") return this.r.getHrApprovalsOrgWide(regions);
      return [];
    }

    const mine = await this.r.getMyApprovals(eid, regions);
    if (!isHRLevel) return mine;

    // HR-level users: everything assigned to their employee (manager + HR steps), plus org-wide pending steps
    // (manager + hr + admin) so old manager-only backlogs still appear for HR override.
    if (role === "limited_hr" && user) {
      const policy = await resolvePolicy(user);
      const sf = hrScopeFilter(policy);
      if (sf) {
        const hrApprovals = await this.r.getHrApprovalsScopedDepts(eid, sf.departments, sf.offices, regions);
        const seen = new Set(mine.map((r: any) => r.id));
        return [...mine, ...hrApprovals.filter((r: any) => !seen.has(r.id))];
      }
    }

    const hrApprovals = await this.r.getHrApprovals(eid, regions);
    const seen = new Set(mine.map((r: any) => r.id));
    return [...mine, ...hrApprovals.filter((r: any) => !seen.has(r.id))];
  }
  async approveRequest(approvalId: string, body: any, employeeId: string|null|undefined, userId: string, role: string, user?: UserPayload, ctx?: LeaveRegionCtx) {
    const {remarks,hrOverride}=body||{};
    const isHRAdmin=role==="hr"||role==="admin"||role==="limited_hr";
    const actorEmpId = await this.effectiveEmployeeIdForLeave(employeeId, user);
    if (!isHRAdmin && !actorEmpId) throw new ValidationError("Your login is not linked to an employee record. Ask HR to link your user to your profile, or use a work email that matches your employee record.");
    const approval=await this.r.getApprovalById(approvalId); if(!approval) throw new NotFoundError("Approval",approvalId);
    const lr=await this.r.getRequestById(approval.leave_request_id); if(!lr) throw new NotFoundError("Request",approval.leave_request_id);
    if (role === "hr" || role === "admin" || role === "limited_hr") await this.assertRequestInScope(ctx, approval.leave_request_id);
    if(actorEmpId && lr.employee_id===actorEmpId) throw new ForbiddenError("Cannot approve your own leave request");
    const isAssigned=!!actorEmpId && approval.approver_id===actorEmpId;
    if(!isAssigned&&!isHRAdmin) throw new ForbiddenError("Not authorized");
    if(hrOverride===true&&!isHRAdmin) throw new ForbiddenError("HR override is only allowed for HR/Admin");
    // Sequential chain: manager (step 1) before HR (step 2). HR may skip only with hrOverride + auto-approve prior steps.
    const priorPending=await this.r.getPendingApprovalsBeforeStep(approval.leave_request_id,approval.step_order);
    if(priorPending.length>0) {
      if(!isHRAdmin||hrOverride!==true) throw new ValidationError("A prior approval step must be completed before this one.");
      const skipActedBy=actorEmpId||userId;
      for(const p of priorPending) {
        const u=await this.r.setApprovalApproved(p.id,skipActedBy,"Auto-approved: HR override (prior step(s) advanced)");
        if(!u.length) throw new ValidationError("Could not advance a prior approval step; refresh and try again.");
        await this.r.audit("approval",p.id,"approve",skipActedBy,{hrOverridePriorSteps:true,forwardedToStep:approval.step_order});
      }
    }
    const actedById=isHRAdmin&&!isAssigned?(actorEmpId||userId):null;
    const updated=await this.r.setApprovalApproved(approvalId, actedById ?? null, remarks);
    if(!updated.length) throw new ValidationError("Already actioned");
    const pending=await this.r.getPendingApprovals(approval.leave_request_id);
    if(pending.length>0) {
      await this.r.audit("approval",approvalId,"approve",actorEmpId||userId,{step:approval.step_order,remaining:pending.length,hrOverride:hrOverride===true||undefined});
      // Step-by-step email: notify the next step approver(s)
      (async () => {
        const nextApprovers = await this.r.getNextPendingApprovers(approval.leave_request_id);
        const nextIds = nextApprovers.map((a: any) => a.approver_id);
        if (nextIds.length) await leaveNotify(this.r, "leave.submitted", approval.leave_request_id, nextIds);
      })().catch(() => {});
      emitRefreshAll();
      return {success:true,fullyApproved:false};
    }
    const reqDetail=await this.r.getRequestById(approval.leave_request_id); if(!reqDetail) throw new NotFoundError("Request",approval.leave_request_id);
    if(reqDetail.status!=="pending") return {success:true,fullyApproved:true,alreadyApproved:true};
    if(reqDetail.paid) { const deducted=await this.r.deductBalance(reqDetail.employee_id,reqDetail.leave_type_id,reqDetail.total_days); if(!deducted.length) throw new ValidationError("Insufficient balance (concurrent update). Please retry."); }
    const approved=await this.r.approveRequest(approval.leave_request_id,actorEmpId||userId);
    if(!approved.length) { if(reqDetail.paid) await this.r.restoreBalance(reqDetail.employee_id,reqDetail.leave_type_id,reqDetail.total_days); return {success:true,fullyApproved:true,alreadyApproved:true}; }
    let syncOk=false; try{syncOk=await syncLeaveToAttendance(approval.leave_request_id)}catch{}
    await this.r.updateRequestSyncStatus(approval.leave_request_id,syncOk?"synced":"failed");
    await this.r.audit("request",approval.leave_request_id,"approve",actorEmpId||userId,{finalApprover:true,totalDays:reqDetail.total_days,hrOverride:hrOverride===true||undefined,attendance_sync:syncOk?"synced":"failed"});
    emitRefreshAll();
    // Email: notify employee that leave is fully approved
    leaveNotify(this.r,"leave.approved",approval.leave_request_id,[reqDetail.employee_id]).catch(()=>{});
    return {success:true,fullyApproved:true};
  }
  async rejectApproval(approvalId: string, body: any, employeeId: string|null|undefined, userId: string, role: string, user?: UserPayload, ctx?: LeaveRegionCtx) {
    const {remarks,hrOverride}=body||{};
    const isHRAdmin=role==="hr"||role==="admin"||role==="limited_hr";
    const actorEmpId = await this.effectiveEmployeeIdForLeave(employeeId, user);
    if (!isHRAdmin && !actorEmpId) throw new ValidationError("Your login is not linked to an employee record. Ask HR to link your user to your profile, or use a work email that matches your employee record.");
    const approval=await this.r.getApprovalById(approvalId); if(!approval) throw new NotFoundError("Approval",approvalId);
    const reqRow=await this.r.getRequestById(approval.leave_request_id); if(!reqRow) throw new NotFoundError("Request",approval.leave_request_id);
    if (role === "hr" || role === "admin" || role === "limited_hr") await this.assertRequestInScope(ctx, approval.leave_request_id);
    if(actorEmpId && reqRow.employee_id===actorEmpId) throw new ForbiddenError("Cannot reject your own leave request");
    const isAssigned=!!actorEmpId && approval.approver_id===actorEmpId;
    if(!isAssigned&&!isHRAdmin) throw new ForbiddenError("Not authorized");
    if(hrOverride===true&&!isHRAdmin) throw new ForbiddenError("HR override is only allowed for HR/Admin");
    const ordered=await this.r.getPendingApprovalsOrdered(approval.leave_request_id);
    if(ordered.length>0&&approval.step_order!==ordered[0].step_order) {
      throw new ValidationError("Reject the current approval step first (earlier steps are still pending).");
    }
    const actedById=isHRAdmin&&!isAssigned?(actorEmpId||userId):null;
    const updated=await this.r.setApprovalRejected(approvalId, actedById, remarks); if(!updated.length) throw new ValidationError("Already actioned");
    await this.r.autoRejectRemaining(approval.leave_request_id);
    const rejected=await this.r.rejectRequest(approval.leave_request_id,actorEmpId||userId,remarks||"Rejected");
    if(!rejected.length) { await this.r.audit("request",approval.leave_request_id,"reject",actorEmpId||userId,{step:approval.step_order,requestAlreadyDecided:true}); return {success:true}; }
    await this.r.audit("request",approval.leave_request_id,"reject",actorEmpId||userId,{step:approval.step_order,remarks,hrOverride:hrOverride===true||undefined});
    emitRefreshAll();
    // Email: notify employee that leave is rejected
    leaveNotify(this.r,"leave.rejected",approval.leave_request_id,[reqRow.employee_id],{rejection_reason:remarks||"—"}).catch(()=>{});
    return {success:true};
  }

  // ── Calendar / Team / Stats ────────────────────────────────────────────────────────
  async getCalendar(userTz: string, from?: string, to?: string, department?: string, ctx?: LeaveRegionCtx) {
    const today=userTz.slice(0,10)||new Date().toISOString().slice(0,10);
    const startDate=from||today.slice(0,8)+"01";
    const endDate=to||(()=>{const[y,m]=[today.slice(0,4),today.slice(5,7)];const last=new Date(Number(y),Number(m),0).getDate();return`${y}-${m}-${String(last).padStart(2,"0")}`})();
    return this.r.getCalendar(startDate, endDate, department, this.regionsFor(ctx));
  }
  async getTeam(managerId: string) {
    const team=await this.r.getTeam(managerId); if(!team.length) return [];
    const teamIds=team.map((m:any)=>m.id); const allBalances=await this.r.getTeamBalances(teamIds);
    const balanceMap=new Map<string,any[]>(); for(const b of allBalances){if(!balanceMap.has(b.employee_id))balanceMap.set(b.employee_id,[]);balanceMap.get(b.employee_id)!.push({balance:b.balance,used:b.used,type_name:b.type_name,color:b.color});}
    return team.map((m:any)=>({...m,balances:balanceMap.get(m.id)||[]}));
  }
  async getStats(role: string, employeeId: string|null|undefined, userTz: string, user?: UserPayload, ctx?: LeaveRegionCtx) {
    await ensureAccrualRun();
    const today=userTz.slice(0,10)||new Date().toISOString().slice(0,10);
    const lineMgrScope = hasOrgDerivedManagerScope(role, user?.roles);
    const statsRole = lineMgrScope ? "manager" : role;
    let eid = employeeId ?? null;
    if (statsRole === "manager" && user) {
      eid = await this.effectiveEmployeeIdForLeave(employeeId, user);
    }
    const regions = (statsRole === "admin" || statsRole === "hr" || statsRole === "limited_hr")
      ? this.regionsFor(ctx)
      : null;
    return this.r.getStats(statsRole, eid, today, regions);
  }
  async getTypesForEmployee(employeeId: string, role: string, userTz: string, ctx?: LeaveRegionCtx, myEmployeeId?: string | null) {
    if (myEmployeeId !== employeeId && (role === "admin" || role === "hr")) {
      await this.assertEmployeeInScope(ctx, employeeId);
    }
    await ensureAccrualRun();
    const emp=await this.r.getEmployeeDeptType(employeeId); if(!emp) throw new NotFoundError("Employee",employeeId);
    const today=userTz.slice(0,10)||new Date().toISOString().slice(0,10);
    let policies=await findAllMatchingPolicies(emp.department,emp.employee_type||"full_time",role,today);
    if(!policies.length) {
      const allPolicies=await this.r.getAllActivePolicies(today);
      for(const p of allPolicies) { if(!policyAllowedForRole(p,role)) continue; const tc=await this.r.getTypeByPolicyId(p.id); if(tc.length>0){policies.push(p);break;} }
    }
    if(!policies.length) return [];
    const policyIds=policies.map((p:any)=>p.id); const allTypes=await this.r.getTypesByPolicyIds(policyIds);
    const policyLookup=new Map(policies.map((p:any)=>[p.id,p.name]));
    const seenNames=new Set<string>(); const result: any[] = [];
    for(const policy of policies) { for(const lt of allTypes.filter((t:any)=>t.policy_id===policy.id)) { if(seenNames.has(lt.name.toLowerCase())) continue; seenNames.add(lt.name.toLowerCase()); result.push({...lt,policy_id:policy.id,policy_name:policyLookup.get(policy.id)}); } }
    const typeIds=result.map((lt:any)=>lt.id); const balances=await this.r.getBalancesForEmployee(employeeId,typeIds);
    const balMap=new Map(balances.map((b:any)=>[b.leave_type_id,b]));
    return result.map((lt:any)=>{const bal=balMap.get(lt.id);return{...lt,balance:bal?.balance??0,used:bal?.used??0};});
  }

  // ── FreshTeam sync ────────────────────────────────────────────────────────────────
  async migrateFromFreshteam() {
    const LOG = "[leave/migrate-requests]";
    if(!isFreshTeamConfigured()) throw new AppError(503,"FreshTeam is not configured.","SERVICE_UNAVAILABLE");
    const delayMs=getFreshTeamDelayMs();
    console.log(`${LOG} Starting migrate. delayMs=${delayMs}`);
    const stats={total:0,created:0,updated:0,skipped:0,failed:0,employeeNotFound:0,leaveTypeNotFound:0,skippedPreCutoff:0};
    const ftEmpMap=new Map<number,string>(); let page=1; const pp=50;
    do {
      const ftEmps = await listFtEmployees(page, pp);
      await sleep(delayMs);
      for (const ft of ftEmps) {
        const ourId = await this.resolveOurEmployeeIdFromFt(ft);
        if (ourId) ftEmpMap.set(ft.id, ourId);
      }
      if (ftEmps.length < pp) break;
      page++;
    } while (true);
    console.log(`${LOG} Employee map: ${ftEmpMap.size} matched`);
    const ftTypeMap=new Map<number,string>(); page=1;
    do { const ftTypes=await listFtTimeOffTypes(page,pp); await sleep(delayMs); const before=ftTypeMap.size; for(const ft of ftTypes){if(ft.deleted)continue;const ourId=await this.r.resolveLeaveTypeByName(ft.name||"");if(ourId)ftTypeMap.set(ft.id,ourId);} if(ftTypes.length<pp||ftTypeMap.size===before)break; page++; } while(true);
    console.log(`${LOG} Leave type map: ${ftTypeMap.size} matched`);
    page=1;
    // Migrate full history by default. Optional env can still narrow the start date.
    const rawFrom = (process.env.FRESHTEAM_LEAVE_MIGRATE_FROM || "1900-01-01").trim().slice(0, 10);
    const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : "1900-01-01";
    const toDate = "2030-12-31";
    console.log(`${LOG} Fetching time-offs from ${fromDate} to ${toDate} (set FRESHTEAM_LEAVE_MIGRATE_FROM to narrow start date)`);
    do {
      const timeOffs=await listFtTimeOffs({page,per_page:pp,start_date:fromDate,end_date:toDate}); await sleep(delayMs); stats.total+=timeOffs.length;
      console.log(`${LOG} Time-offs page ${page}: ${timeOffs.length} items (total so far: ${stats.total}, created: ${stats.created}, updated: ${stats.updated}, skipped: ${stats.skipped}, failed: ${stats.failed})`);
      for(const to of timeOffs as FreshTeamTimeOff[]) {
        try {
          const leaveStart = to.start_date ? String(to.start_date).slice(0, 10) : "";
          if (!leaveStart || leaveStart < fromDate) {
            if (leaveStart && leaveStart < fromDate) stats.skippedPreCutoff++;
            stats.skipped++;
            continue;
          }
          const ourEmpId=ftEmpMap.get(to.user_id)??ftEmpMap.get(to.applied_by_id); if(!ourEmpId){stats.employeeNotFound++;stats.skipped++;continue;}
          const ourTypeId=ftTypeMap.get(to.leave_type_id); if(!ourTypeId){stats.leaveTypeNotFound++;stats.skipped++;continue;}
          const status=((s:string)=>s==="approved"?"approved":s==="declined"?"rejected":s==="cancelled"?"cancelled":"pending")((to.status||"").toLowerCase());
          const totalDays=Math.max(0.5,Number(to.leave_units)||0); const appliedAt=to.created_at||new Date().toISOString();
          const decidedAt=to.rejected_at||to.cancelled_at||(status==="approved"?to.updated_at:null)||null;
          const rejectionReason=status==="rejected"||status==="cancelled"?(to.status_comments??null):null;
          const decidedBy=status==="approved"?(to.approved_by_id!=null?ftEmpMap.get(to.approved_by_id)??null:null):status==="rejected"?(to.rejected_by_id!=null?ftEmpMap.get(to.rejected_by_id)??null:null):status==="cancelled"?(to.cancelled_by_id!=null?ftEmpMap.get(to.cancelled_by_id)??null:null):null;
          const ftId=String(to.id); const existing=await this.r.getRequestsByFtId(ftId);
          if(existing.length>0) {
            const row=existing[0]; const oldStatus=row.status; const oldDays=parseFloat(row.total_days||"0")||0;
            if(oldStatus==="approved"&&status!=="approved"&&oldDays>0) { const bal=await this.r.getBalance(ourEmpId,ourTypeId); if(bal.length>0){const pu=parseFloat((bal[0] as any).used||"0")||0;await this.r.updateFtBalance(ourEmpId,ourTypeId,Math.max(0,pu-oldDays));} }
            else if(oldStatus!=="approved"&&status==="approved"&&totalDays>0) { const bal=await this.r.getBalance(ourEmpId,ourTypeId); const pu=bal.length>0?parseFloat((bal[0] as any).used||"0")||0:0;await this.r.updateFtBalance(ourEmpId,ourTypeId,pu+totalDays); }
            await this.r.updateFtRequest(row.id,{employeeId:ourEmpId,leaveTypeId:ourTypeId,startDate:to.start_date,endDate:to.end_date,totalDays,reason:to.comments??null,status,appliedAt,decidedAt,decidedBy,rejectionReason}); stats.updated++;
          } else {
            await this.r.createFtRequest({employeeId:ourEmpId,leaveTypeId:ourTypeId,startDate:to.start_date,endDate:to.end_date,totalDays,reason:to.comments??null,status,appliedAt,decidedAt,decidedBy,rejectionReason,ftId}); stats.created++;
            if(status==="approved"&&totalDays>0) { const bal=await this.r.getBalance(ourEmpId,ourTypeId); const pu=bal.length>0?parseFloat((bal[0] as any).used||"0")||0:0; await this.r.updateFtBalance(ourEmpId,ourTypeId,pu+totalDays); }
          }
        } catch(err){stats.failed++;}
      }
      page++; if(timeOffs.length<pp) break;
    } while(true);
    console.log(`${LOG} Done. total=${stats.total}, created=${stats.created}, updated=${stats.updated}, skipped=${stats.skipped}, skippedPreCutoff=${stats.skippedPreCutoff}, failed=${stats.failed}, employeeNotFound=${stats.employeeNotFound}, leaveTypeNotFound=${stats.leaveTypeNotFound}`);
    return {success:true,...stats,message:`Processed ${stats.total} time-offs: ${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped (${stats.skippedPreCutoff} before ${fromDate}), ${stats.failed} failed.`};
  }

  async syncBalancesFromFreshteam() {
    const LOG = "[leave/sync-balances]";
    if(!isFreshTeamConfigured()) throw new AppError(503,"FreshTeam is not configured.","SERVICE_UNAVAILABLE");
    const domain = process.env.FRESHTEAM_DOMAIN?.trim() || "";
    const delayMs = getFreshTeamDelayMs();
    console.log(`${LOG} Starting sync. FRESHTEAM_DOMAIN=${domain ? domain + ".freshteam.com" : "(not set)"}, delayMs=${delayMs}`);
    const stats={employeesProcessed:0,balancesUpdated:0,skipped:0,failed:0};
    const elTypeId=await this.r.findEarnedLeaveTypeId();
    const bereavementTypeId=await this.r.findBereavementLeaveTypeId();
    const bereavementType=bereavementTypeId?await this.r.getTypeById(bereavementTypeId):null;
    const defaultBereavementBalance=bereavementType?.max_balance!=null?Math.max(0,Number(bereavementType.max_balance)):0;
    console.log(`${LOG} Earned leave type id: ${elTypeId ?? "none"}, Bereavement type id: ${bereavementTypeId ?? "none"} (default balance when FT omits: ${defaultBereavementBalance})`);
    const ftEmpMap=new Map<number,string>(); let page=1; const pp=50;
    do {
      const ftEmps=await listFtEmployees(page,pp); await sleep(delayMs);
      console.log(`${LOG} Employees page ${page}: ${ftEmps.length} from FreshTeam`);
      for (const ft of ftEmps) {
        const ourId = await this.resolveOurEmployeeIdFromFt(ft);
        if (ourId) ftEmpMap.set(ft.id, ourId);
      }
      if(ftEmps.length<pp)break; // last page
      page++;
    } while(true);
    console.log(`${LOG} Employee map built: ${ftEmpMap.size} FreshTeam employees matched to our system`);
    const ftTypeMap=new Map<number,string>(); page=1;
    do {
      const ftTypes=await listFtTimeOffTypes(page,pp); await sleep(delayMs);
      console.log(`${LOG} Time-off types page ${page}: ${ftTypes.length} types`);
      const mapSizeBefore=ftTypeMap.size;
      for(const ft of ftTypes){if(ft.deleted)continue;const ourId=await this.r.resolveLeaveTypeByName(ft.name||"");if(ourId)ftTypeMap.set(ft.id,ourId);}
      // Break when last page (fewer than pp) OR when API returned same set again (no new ids) — FreshTeam often returns same types every page
      if(ftTypes.length<pp||ftTypeMap.size===mapSizeBefore){break;}
      page++;
    } while(true);
    console.log(`${LOG} Leave type map built: ${ftTypeMap.size} FreshTeam types matched`);
    // For earned leave: compute balance as 0.5 per 15-day block from join date to today (not FreshTeam credits)
    const ourEmpIds=Array.from(new Set(ftEmpMap.values()));
    const joinDateRows=await this.r.getEmployeeJoinDates(ourEmpIds);
    const joinDateMap=new Map<string,string|null>(joinDateRows.map((r:any)=>{
      const jd=r.join_date; if(!jd) return [r.id,null];
      const str=typeof jd==="string"?jd.trim().slice(0,10):new Date(jd).toISOString().slice(0,10);
      return [r.id,str];
    }));
    const elType=elTypeId?await this.r.getTypeById(elTypeId):null;
    const elRate=elType&&elType.accrual_rate!=null?parseFloat(String(elType.accrual_rate)):0.5;
    const elCap=elType&&elType.max_balance!=null?parseInt(String(elType.max_balance),10):12;
    const tz = getDefaultTz();
    const yesterdayYmd = yesterdayYmdFromTodayYmd(todayInTz(tz));
    function computeELBalanceAsOfToday(joinDateStr: string|null): number {
      if(!joinDateStr) return 0;
      const joinYmd = joinDateStr.trim().slice(0, 10);
      if(!joinYmd || joinYmd > yesterdayYmd) return 0;
      const days = diffCalendarDaysInclusive(joinYmd, yesterdayYmd);
      const blocks=Math.floor(days/15); if(blocks<=0) return 0;
      const accrued=blocks*elRate;
      return Math.min(accrued,elCap);
    }
    // Round to 2 decimals to match DB decimal(6,2)
    function round2(n: number): number {
      return Math.round(n * 100) / 100;
    }
    // Resolve our leave type: by FT type id first, then by type name (value/leave_type_name) if API sends it
    const resolveOurLeaveType = async (to: { leave_type?: { id?: number; value?: string } | null; leave_type_id?: number; leave_type_name?: string }): Promise<string | null> => {
      const ftId = to.leave_type?.id ?? to.leave_type_id;
      if (ftId != null) {
        const byId = ftTypeMap.get(Number(ftId));
        if (byId) return byId;
      }
      const name = (to.leave_type?.value ?? to.leave_type_name ?? "").toString().trim();
      if (name) return await this.r.resolveLeaveTypeByName(name);
      return null;
    };
    const totalToProcess = ftEmpMap.size;
    let processed = 0;
    const startTime = Date.now();
    for(const [ftId,ourEmpId] of Array.from(ftEmpMap)) {
      try {
        const ftEmp=await getFtEmployeeWithTimeOff(ftId); await sleep(delayMs);
        const timeOff=ftEmp.time_off; if(!Array.isArray(timeOff)||!timeOff.length){stats.skipped++;processed++;if(processed%10===0||processed===totalToProcess)console.log(`${LOG} Progress ${processed}/${totalToProcess} (skipped: no time_off)`);continue;}
        for(const to of timeOff){
          const ourLtId=await resolveOurLeaveType(to); if(!ourLtId)continue;
          const availedRaw = to.leaves_availed ?? to.leaves_used;
          const availed=typeof availedRaw==="number"?availedRaw:Number(availedRaw);
          const isEL=ourLtId===elTypeId;
          const isBereavement=ourLtId===bereavementTypeId;
          const used=round2(Number.isFinite(availed)?Math.max(0,availed):0);
          const grossRaw = to.leave_credits;
          const availRaw = to.leave_credits_available;
          const gross = typeof grossRaw === "number" ? grossRaw : Number(grossRaw);
          const avail = typeof availRaw === "number" ? availRaw : Number(availRaw);
          /**
           * FreshTeam often sends `leave_credits` as cumulative / gross credited, and `leaves_availed` separately.
           * Our DB stores `balance` = **remaining** (same as after approval deductions). So:
           * remaining = gross − used when both are present.
           * Use `leave_credits_available` only when we cannot derive from gross (explicit “remaining” from API).
           */
          let balance: number;
          if (Number.isFinite(gross) && gross >= 0) {
            balance = round2(Math.max(0, gross - used));
          } else if (Number.isFinite(avail) && avail >= 0) {
            balance = round2(avail);
          } else if(isEL){
            balance=round2(computeELBalanceAsOfToday(joinDateMap.get(ourEmpId)??null));
          } else if(isBereavement){
            // Bereavement: sync even when FT doesn't send credits (use type max_balance or 0 so row is created/updated)
            balance=round2(defaultBereavementBalance);
          } else {
            continue; // other non-EL with no valid credits from FT: skip
          }
          await this.r.syncFtBalance(ourEmpId,ourLtId,balance,used,isEL);
          stats.balancesUpdated++;
        }
        stats.employeesProcessed++;
        processed++;
        if(processed%10===0||processed===totalToProcess)console.log(`${LOG} Progress ${processed}/${totalToProcess} — processed: ${stats.employeesProcessed}, balancesUpdated: ${stats.balancesUpdated}, skipped: ${stats.skipped}, failed: ${stats.failed}`);
      } catch(err){
        stats.failed++;
        processed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`${LOG} FreshTeam employee id ${ftId} failed: ${msg}`);
        if(processed%10===0||processed===totalToProcess)console.log(`${LOG} Progress ${processed}/${totalToProcess} — failed: ${stats.failed}`);
      }
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`${LOG} Done in ${elapsed}s. employeesProcessed=${stats.employeesProcessed}, balancesUpdated=${stats.balancesUpdated}, skipped=${stats.skipped}, failed=${stats.failed}`);
    return {success:true,...stats,message:`Synced latest leave balances from FreshTeam for ${stats.employeesProcessed} employees, ${stats.balancesUpdated} balance rows updated.`};
  }
}

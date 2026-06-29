import { DashboardRepository } from "./DashboardRepository.js";
import { memCache } from "../../lib/perf.js";
import { runProbationReminders } from "../../services/probationReminders.js";
import { isTransientDbError } from "../../lib/dbConnectivity.js";
import { hasOrgDerivedManagerScope } from "../../lib/rbac.js";
import { allowedRegionsFor, effectiveRegionsFor } from "../../lib/regionAccess.js";
import type { UserPayload } from "../../middleware/auth.js";
import { LeaveService } from "../leave/LeaveService.js";
import { formatEmployeeLegalName } from "../../../shared/employeeDisplayName.js";

/** Safe shapes when Neon / pool times out — dashboard still loads with empty metrics. */
const HR_PANEL_FALLBACK = {
  role: "hr" as const,
  headcount: 0,
  joinersToday: 0,
  leaversToday: 0,
  pendingOnboarding: [] as unknown[],
  tentativePending: [] as unknown[],
  offboardingPending: [] as unknown[],
  interviewStage: [] as unknown[],
  risks: { noManager: 0, noLeavePolicy: 0, stuckTentative: 0, offboardingNoAssetReturn: 0 },
  transientDbError: true,
};

const ADMIN_PANEL_FALLBACK = {
  role: "admin" as const,
  headcount: 0,
  attritionThisMonth: 0,
  joinersThisMonth: 0,
  leaversThisMonth: 0,
  departmentBreakdown: [] as unknown[],
  attendanceToday: { present: 0, total: 1, percentage: 0 },
  assets: { assigned: 0, stock_items: 0, pending_return: 0 },
  openRisks: { offboarding: 0, tentative: 0, onboarding: 0 },
  transientDbError: true,
};

const EMPLOYEE_PANEL_FALLBACK = {
  employee: null,
  attendance: { checkedIn: false, checkedOut: false, status: null, checkInTime: null, checkOutTime: null },
  leaveBalances: [] as unknown[],
  pendingLeaveRequests: [] as unknown[],
  upcomingTimeOff: [] as unknown[],
  assets: [] as unknown[],
  onboarding: null,
  transientDbError: true,
};

export class DashboardService {
  private readonly repo = new DashboardRepository();

  async getDashboard(
    role: string,
    employeeId: string|null,
    todayStr: string,
    startOfMonthStr: string,
    userEmail?: string|null,
    userRoles?: string[] | null,
    leaveUser?: UserPayload | null,
    requestedRegion?: string | null,
  ) {
    let eid = employeeId;
    if (!eid && userEmail?.trim()) {
      try {
        const resolved = await this.repo.findEmployeeIdByLoginEmail(userEmail);
        if (resolved) eid = resolved;
      } catch (e) {
        if (!isTransientDbError(e)) throw e;
        console.warn("[dashboard] findEmployeeIdByLoginEmail transient DB failure:", (e as Error)?.message ?? e);
      }
    }
    let data: any = {};
    const t = todayStr; const som = startOfMonthStr;

    // Multi-region scope: null = all (super admin / no user), [] = none (fail-closed), [code] = that region.
    // Super admins may narrow to one region via ?region= (ignored for everyone else).
    const regions = leaveUser ? effectiveRegionsFor(leaveUser, requestedRegion) : null;
    const regionKey = regions === null ? "all" : (regions.length ? regions.join(",") : "none");

    const buildEmployeePanel = async (eid: string) => {
      try {
        const [empRows, attendanceRows, balances, pendingLeave, upcoming, assets, onboardingRows] = await this.repo.employeePanel(eid, t);
        const emp = empRows[0] ?? null;
        const att = attendanceRows[0] ?? null;
        const ob = onboardingRows[0] ?? null;
        return { employee: emp, attendance: att ? { checkedIn: !!att.check_in_time, checkedOut: !!att.check_out_time, status: att.status, checkInTime: att.check_in_time, checkOutTime: att.check_out_time } : { checkedIn: false, checkedOut: false, status: null, checkInTime: null, checkOutTime: null }, leaveBalances: balances.slice(0, 4), pendingLeaveRequests: pendingLeave, upcomingTimeOff: upcoming, assets, onboarding: ob ? { id: ob.id, taskCount: ob.task_count, completedCount: ob.completed_count } : null };
      } catch (e) {
        if (!isTransientDbError(e)) throw e;
        console.warn("[dashboard] buildEmployeePanel transient DB failure:", (e as Error)?.message ?? e);
        return { ...EMPLOYEE_PANEL_FALLBACK };
      }
    };

    const buildHRPanel = async () => {
      const cached = memCache.get<any>(`dashboard:hr:${t}:${regionKey}`);
      if (cached) return cached;
      try {
        const [headcountRow, joiners, leavers, pendingOb, _tentPending, offPending, noMgr, noLeave, stuckTent, offNoAsset, interviews] = await this.repo.hrPanel(t, regions);
        void _tentPending;
        const r = { role: "hr" as const, headcount: headcountRow[0]?.total||0, joinersToday: joiners[0]?.count||0, leaversToday: leavers[0]?.count||0, pendingOnboarding: pendingOb, tentativePending: [] as unknown[], offboardingPending: offPending, interviewStage: interviews, risks: { noManager: noMgr[0]?.count||0, noLeavePolicy: noLeave[0]?.count||0, stuckTentative: stuckTent[0]?.count||0, offboardingNoAssetReturn: offNoAsset[0]?.count||0 } };
        memCache.set(`dashboard:hr:${t}:${regionKey}`, r, 15000);
        return r;
      } catch (e) {
        if (!isTransientDbError(e)) throw e;
        console.warn("[dashboard] buildHRPanel transient DB failure:", (e as Error)?.message ?? e);
        return { ...HR_PANEL_FALLBACK };
      }
    };

    const buildAdminPanel = async () => {
      const cached = memCache.get<any>(`dashboard:admin:${t}:${regionKey}`);
      if (cached) return cached;
      try {
        const [hcRow, attrRow, depts, joinersM, leaversM, attRow, totalRow, assetStats, openRisks] = await this.repo.adminPanel(t, som, regions);
        const totalActive = totalRow[0]?.total||1; const presentToday = attRow[0]?.present||0;
        const r = { role: "admin" as const, headcount: hcRow[0]?.total||0, attritionThisMonth: attrRow[0]?.count||0, joinersThisMonth: joinersM[0]?.count||0, leaversThisMonth: leaversM[0]?.count||0, departmentBreakdown: depts, attendanceToday: { present: presentToday, total: totalActive, percentage: Math.round((presentToday/totalActive)*100) }, assets: assetStats[0]||{ assigned:0,stock_items:0,pending_return:0 }, openRisks: openRisks[0]||{ offboarding:0,tentative:0,onboarding:0 } };
        memCache.set(`dashboard:admin:${t}:${regionKey}`, r, 15000);
        return r;
      } catch (e) {
        if (!isTransientDbError(e)) throw e;
        console.warn("[dashboard] buildAdminPanel transient DB failure:", (e as Error)?.message ?? e);
        return { ...ADMIN_PANEL_FALLBACK };
      }
    };

    const useManagerDashboard = hasOrgDerivedManagerScope(role, userRoles);

    if (role === "admin") {
      const [adminData, hrData3, empData3] = await Promise.all([buildAdminPanel(), buildHRPanel(), eid ? buildEmployeePanel(eid) : null]);
      data = { ...adminData, hr: hrData3, myData: empData3, role: "admin" };
    } else if (role === "hr") {
      const [hrData2, empData2] = await Promise.all([buildHRPanel(), eid ? buildEmployeePanel(eid) : null]);
      data = { ...hrData2, myData: empData2, role: "hr" };
    } else if (useManagerDashboard) {
      if (!eid) return { role: "manager", error: "No employee profile linked. Contact HR." };
      try {
        const [empPanel, mgrRows] = await Promise.all([buildEmployeePanel(eid), this.repo.managerPanel(eid, t)]);
        const [teamRow, teamOnLeave, approvals, absent, inNotice] = mgrRows;
        data = { ...empPanel, role: "manager", teamSize: teamRow[0]?.team_size||0, teamOnLeave, pendingApprovals: approvals, absentToday: absent, inNotice };
      } catch (e) {
        if (!isTransientDbError(e)) throw e;
        console.warn("[dashboard] manager panel transient DB failure:", (e as Error)?.message ?? e);
        const empPanel = await buildEmployeePanel(eid);
        data = { ...empPanel, role: "manager", teamSize: 0, teamOnLeave: [], pendingApprovals: [], absentToday: [], inNotice: [], transientDbError: true };
      }
    } else if (role === "employee" || role === "it") {
      if (!eid) return { role, error: "No employee profile linked. Contact HR." };
      data = { ...(await buildEmployeePanel(eid)), role };
    } else if (eid) {
      data = { ...(await buildEmployeePanel(eid)), role };
    } else {
      return { role, error: "No employee profile linked. Contact HR." };
    }

    // Activity feed
    let activityEvents: any[] = [];
    try {
      if (useManagerDashboard && eid) {
        const r = await this.repo.activityManager(eid);
        activityEvents = r.map(e => ({ type: "leave", id: e.id, message: `${formatEmployeeLegalName((e as { first_name?: string }).first_name, (e as { last_name?: string }).last_name)}: leave ${e.status} (${e.detail})`, timestamp: e.timestamp, severity: e.status==="pending"?"warning":"info", color: e.color, link: "/leave" }));
      } else if (eid && role !== "hr" && role !== "admin" && role !== "limited_hr") {
        const r = await this.repo.activityEmployee(eid);
        activityEvents = r.map(e => ({ type: "leave", id: e.id, message: `Leave ${e.status}: ${e.detail}`, timestamp: e.timestamp, severity: e.status==="rejected"?"warning":"info", color: e.color, link: "/leave" }));
      } else {
        const [hires, leave, off] = await this.repo.activityHR(regions);
        activityEvents = [...hires.map((r: any) => ({ type:"hire", message:`${formatEmployeeLegalName(r.first_name,r.last_name)} joined (${r.department})`, timestamp:r.timestamp, severity:"info", link:"/employees" })), ...leave.map((r: any) => ({ type:"leave", message:`${formatEmployeeLegalName(r.first_name,r.last_name)}: leave ${r.status} (${r.detail})`, timestamp:r.timestamp, severity:r.status==="pending"?"warning":"info", color:r.color, link:"/leave" })), ...off.map((r: any) => ({ type:"offboarding", message:`${formatEmployeeLegalName(r.first_name,r.last_name)}: ${r.offboarding_type} ${r.status}`, timestamp:r.timestamp, severity:r.status==="initiated"?"critical":"warning", link:"/offboarding" }))];
        activityEvents.sort((a,b) => new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime());
        activityEvents = activityEvents.slice(0, 10);
      }
    } catch {}
    data.activityFeed = activityEvents;

    try {
      const [bdays, anni, newHires] = await this.repo.sharedWidgets(t, regions);
      data.birthdaysNext7 = bdays; data.anniversariesNext7 = anni; data.newHires = newHires;
    } catch (e) {
      if (!isTransientDbError(e)) throw e;
      console.warn("[dashboard] sharedWidgets transient DB failure:", (e as Error)?.message ?? e);
      data.birthdaysNext7 = []; data.anniversariesNext7 = []; data.newHires = [];
      (data as { transientDbError?: boolean }).transientDbError = true;
    }

    // Super Region (Pakistan) — attach a cross-region rollup alongside the full admin view.
    if (leaveUser?.isRegionalSuperAdmin) {
      try {
        data.view = "super_region";
        const cachedRollup = memCache.get<any[]>("dashboard:regionRollup");
        if (cachedRollup) {
          data.regionSummary = cachedRollup;
        } else {
          const rollup = await this.repo.regionRollup();
          memCache.set("dashboard:regionRollup", rollup, 15000);
          data.regionSummary = rollup;
        }
      } catch (e) {
        if (!isTransientDbError(e)) throw e;
        console.warn("[dashboard] regionRollup transient DB failure:", (e as Error)?.message ?? e);
        data.regionSummary = [];
      }
    }

    if (leaveUser) {
      try {
        const leaveSvc = new LeaveService();
        const approvals = await leaveSvc.getPendingApprovals(leaveUser.employeeId, leaveUser.role, leaveUser, {
          regionCode: leaveUser.regionCode ?? null,
          isRegionalSuperAdmin: leaveUser.isRegionalSuperAdmin,
          requestedRegion: requestedRegion ?? null,
        });
        (data as { pendingApprovals?: unknown[] }).pendingApprovals = Array.isArray(approvals)
          ? approvals.slice(0, 40)
          : [];
      } catch (e) {
        console.warn("[dashboard] pendingApprovals via LeaveService:", (e as Error)?.message ?? e);
        if (!Array.isArray((data as { pendingApprovals?: unknown[] }).pendingApprovals)) {
          (data as { pendingApprovals: unknown[] }).pendingApprovals = [];
        }
      }
    }

    return data;
  }

  async getProbationAlerts(role: string, todayStr: string, region?: { regionCode?: string | null; isRegionalSuperAdmin?: boolean }) {
    if (role !== "hr" && role !== "admin") return [];
    const regions = region ? allowedRegionsFor(region) : null;
    const rows = await this.repo.probationAlerts(todayStr, regions) as any[];
    return rows.map(r => { const endDate = r.probation_end_date?new Date(r.probation_end_date).toISOString().split("T")[0]:null; const daysLeft = endDate?Math.max(0,Math.ceil((new Date(endDate).getTime()-new Date(todayStr).getTime())/86400000)):0; return { id:r.id, name:formatEmployeeLegalName(r.first_name,r.last_name)||"Unknown", probation_end_date:endDate, days_left:daysLeft }; });
  }

  async runProbationReminders() { return runProbationReminders(); }
}

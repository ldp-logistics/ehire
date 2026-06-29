import Layout from "@/components/layout/Layout";
import { EmployeeAvatar, employeeInitials } from "@/components/EmployeeAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { invalidateLeaveAndNotifications } from "@/lib/leaveQueryInvalidation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Ban, CheckCircle, ChevronLeft, ChevronRight,
  ClipboardList, Download, LayoutDashboard, Plus, Shield, Trash2, Users, XCircle,
  AlertTriangle, Calendar, Gift, Search,
  RefreshCw, SlidersHorizontal,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { ApplyLeaveDialog } from "@/components/ApplyLeaveDialog";
import { useMemo, useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { formatAppliedAtForEmployee, formatDateTimeWithTimezone, formatLeaveDisplayDate } from "@/lib/dateUtils";
import { isCompensationLeaveType, isEarnedLeaveType } from "@/lib/leaveTypeUtils";
import { formatLeaveDurationCompact, formatLeaveDurationSummary, formatLeaveDayTypeLabel } from "@shared/leaveDayType";

// ─────────────────────────── types ───────────────────────────
interface Stats { pendingRequests: number; onLeaveToday: number; approvedThisMonth: number; activePolicies: number; }
interface LeaveBalance { id: string | null; employee_id: string; leave_type_id: string; balance: string; used: string; type_name: string; paid: boolean; max_balance: number; color: string; accrual_type: string; policy_name: string; is_compensation_leave?: boolean; }
interface AllRequest { id: string; leave_type_id: string; start_date: string; end_date: string; day_type: string; total_days: string; reason: string | null; status: string; applied_at: string; type_name: string; color: string; employee_id: string; first_name: string; last_name: string; emp_code: string; department: string; avatar: string | null; employee_branch_tz?: string | null; employee_branch_df?: string | null; }
interface PendingApproval { id: string; leave_request_id: string; approver_id: string; approver_role: string; status: string; step_order: number; total_steps?: number; employee_id: string; start_date: string; end_date: string; day_type: string; total_days: string; reason: string | null; request_status: string; applied_at: string; type_name: string; color: string; paid: boolean; first_name: string; last_name: string; emp_code: string; department: string; avatar: string | null; employee_branch_tz?: string | null; employee_branch_df?: string | null; has_prior_pending?: boolean; }
interface LeavePolicy { id: string; name: string; applicable_departments: string[]; applicable_employment_types: string[]; effective_from: string; effective_to: string | null; is_active: boolean; type_count: number; is_default?: boolean; created_at?: string; }
type Section = "overview" | "approvals" | "requests" | "balances" | "freshteam";

/** Same ordering as server primary-policy CTE for balances (not “newest policy only”). */
function pickPrimaryPolicyId(policies: LeavePolicy[]): string | null {
  if (!policies.length) return null;
  const scored = [...policies].filter((p) => (p.type_count ?? 0) > 0);
  const pool = scored.length ? scored : policies;
  return [...pool].sort((a, b) => {
    if (!!b.is_default !== !!a.is_default) return (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0);
    const as = /^standard leave policy$/i.test(String(a.name ?? "").trim()) ? 0 : 1;
    const bs = /^standard leave policy$/i.test(String(b.name ?? "").trim()) ? 0 : 1;
    if (as !== bs) return as - bs;
    const ac = a.type_count ?? 0, bc = b.type_count ?? 0;
    if (bc !== ac) return bc - ac;
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  })[0]?.id ?? null;
}

// ─────────────────────────── helpers ─────────────────────────
const statusStyle: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-700 border-yellow-200",
  approved:  "bg-green-100 text-green-700 border-green-200",
  rejected:  "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};
function fmtDate(d: string | null, tz?: string | null, df?: string | null) {
  if (!d) return "—";
  return formatLeaveDisplayDate(d + (d.includes("T") ? "" : "T00:00:00"), tz ?? null, df ?? null);
}
/** Submitted instant in employee branch TZ (when known). */
function fmtAppliedAt(
  iso: string | null | undefined,
  row?: { employee_branch_tz?: string | null; employee_branch_df?: string | null },
  viewerTz?: string | null,
  viewerDf?: string | null,
) {
  if (!iso) return "—";
  return formatAppliedAtForEmployee(iso, row?.employee_branch_tz, row?.employee_branch_df, viewerTz, viewerDf);
}
/** Decided / generic instant in viewer branch TZ. */
function fmtDateTime(iso: string | null | undefined, tz?: string | null, df?: string | null) {
  if (!iso) return "—";
  return formatDateTimeWithTimezone(iso, tz ?? null, df ?? null);
}
/** Leave balances use half-day or full-day only (.5 or 1). Round to nearest 0.5 when saving. */
function roundToHalfDay(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 2) / 2;
}
/** Display balance as .5 or whole only: floor to nearest 0.5 (e.g. 1.29 → 1, 1.67 → 1.5). */
function displayBalance(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n * 2) / 2;
}
function formatBalanceDays(n: number): string {
  const x = displayBalance(n);
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}
/** Short label for inline balance chips */
function leaveTypeShortLabel(name: unknown): string {
  const n = String(name ?? "").trim();
  if (/earned|annual|^el$/i.test(n)) return "EL";
  if (/compensation|comp[\s-]?off/i.test(n)) return "Comp";
  if (/lwop|without pay/i.test(n)) return "LWOP";
  if (/bereavement/i.test(n)) return "Bereavement";
  return n.length > 14 ? `${n.slice(0, 13)}…` : n;
}

// ─────────────────────────── main page ───────────────────────
export default function LeaveAdmin() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  // ── auth ──
  const { data: me } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try { const r = await apiRequest("GET", "/api/auth/me"); return r.json(); } catch { return null; }
    },
  });
  const leaveTz = (me?.timeZone as string | undefined) ?? null;
  const leaveDf = (me?.dateFormat as string | undefined) ?? null;
  const employeeId: string | null = me?.employeeId || me?.employee_id || null;
  const role: string = (me?.role || "employee").toString().toLowerCase();
  const roles: string[] = Array.isArray(me?.roles) ? me.roles.map((r: unknown) => String(r).toLowerCase()) : [];
  const isHR    = role === "hr"      || role === "admin"   || roles.includes("hr")      || roles.includes("admin");
  const isLimitedHR = role === "limited_hr" || roles.includes("limited_hr");
  /** HR / Admin / Limited HR — show workflow hints on approval cards */
  const isHrLevel = isHR || isLimitedHR;
  const isManager = role === "manager" || roles.includes("manager");
  const isBreakGlass = me?.isBreakGlassAccount === true;

  // ── state ──
  const [section, setSection]         = useState<Section>("overview");
  const [statusFilter, setStatusFilter] = useState("all");
  const [requestsTypeFilter, setRequestsTypeFilter] = useState("all");
  const [searchTerm, setSearchTerm]   = useState("");
  const [requestsPage, setRequestsPage] = useState(1);
  const [balanceEmployeeId, setBalanceEmployeeId] = useState<string | null>(null);
  const [balanceDialog, setBalanceDialog] = useState<{ open: boolean; mode: "set" | "add"; balance?: LeaveBalance }>({ open: false, mode: "set" });
  const [balanceForm, setBalanceForm] = useState({ value: "", reason: "" });
  const [approvalRemarks, setApprovalRemarks] = useState<Record<string, string>>({});
  const [approvalOnBehalf, setApprovalOnBehalf] = useState<Record<string, boolean>>({});
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [applyOnBehalfSelectOpen, setApplyOnBehalfSelectOpen] = useState(false);
  const [applyOnBehalfEmployeeId, setApplyOnBehalfEmployeeId] = useState<string | null>(null);
  const [applyOnBehalfSelectedId, setApplyOnBehalfSelectedId] = useState<string | null>(null);

  // ── selected approval for detail modal ──
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);

  // ── selected balance employee for detail modal ──
  const [selectedBalanceEmployeeId, setSelectedBalanceEmployeeId] = useState<string | null>(null);

  // ── balances section filters ──
  const [balanceSearch, setBalanceSearch] = useState("");
  const [balanceDeptFilter, setBalanceDeptFilter] = useState("all");
  const [balanceStatusFilter, setBalanceStatusFilter] = useState("all");

  // ── Grant Comp Off modal ──
  const [grantCompOffOpen, setGrantCompOffOpen] = useState(false);
  const [grantCompOffForm, setGrantCompOffForm] = useState<{
    employeeId: string; leaveTypeId: string; days: string; dateWorked: string; reason: string;
  }>({ employeeId: "", leaveTypeId: "", days: "1", dateWorked: "", reason: "" });
  const [grantCompOffPending, setGrantCompOffPending] = useState(false);

  const urlSearch = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(urlSearch);
    const rid = params.get("requestId");
    if (!rid) return;
    setSection("approvals");
    setSelectedRequestId(rid);
  }, [urlSearch]);

  // ── queries ──
  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/leave/stats"],
    queryFn: async () => (await apiRequest("GET", "/api/leave/stats")).json(),
  });

  const { data: pendingApprovals = [] } = useQuery<PendingApproval[]>({
    queryKey: ["/api/leave/pending-approvals"],
    queryFn: async () => (await apiRequest("GET", "/api/leave/pending-approvals")).json(),
    enabled: isManager || isHR || isLimitedHR,
  });

  const { data: requestsPayload } = useQuery<{
    data: AllRequest[];
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: ["/api/leave/requests", requestsPage, statusFilter, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(requestsPage), status: statusFilter });
      if (searchTerm.trim()) params.set("q", searchTerm.trim());
      const r = await fetch(`/api/leave/requests?${params}`, { credentials: "include" });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b?.message || b?.error || `HTTP ${r.status}`);
      }
      return r.json();
    },
    enabled: isManager || isHR || isLimitedHR,
  });
  const requestRows = requestsPayload?.data ?? [];
  const requestsTotal = requestsPayload?.total ?? 0;
  const requestsLimit = requestsPayload?.limit ?? 50;
  const requestsTotalPages = Math.max(1, Math.ceil(requestsTotal / requestsLimit) || 1);

  const { data: requestDetail } = useQuery<{
    id: string; status: string; type_name: string; color: string; start_date: string; end_date: string; day_type: string; total_days: string; reason: string | null; applied_at: string; decided_at: string | null; decided_by: string | null; decided_by_first_name?: string | null; decided_by_last_name?: string | null; rejection_reason: string | null; first_name?: string; last_name?: string; department?: string; employee_branch_tz?: string | null; employee_branch_df?: string | null;
  }>({
    queryKey: ["/api/leave/request", selectedRequestId],
    queryFn: async () => (await apiRequest("GET", `/api/leave/request/${selectedRequestId}`)).json(),
    enabled: !!selectedRequestId && (isManager || isHR),
  });

  const { data: policies = [] } = useQuery<LeavePolicy[]>({
    queryKey: ["/api/leave/policies"],
    queryFn: async () => (await apiRequest("GET", "/api/leave/policies")).json(),
    enabled: isHR,
  });
  const primaryPolicyId = useMemo(() => pickPrimaryPolicyId(policies), [policies]);
  const { data: standardPolicyDetail } = useQuery<any>({
    queryKey: ["/api/leave/policies", primaryPolicyId],
    queryFn: async () => (await apiRequest("GET", `/api/leave/policies/${primaryPolicyId}`)).json(),
    enabled: !!primaryPolicyId && isHR,
  });
  const leaveTypesList = standardPolicyDetail?.leave_types ?? [];

  const { data: employeesList = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
    queryFn: async () => {
      const json = await (await apiRequest("GET", "/api/employees")).json();
      if (Array.isArray(json)) return json;
      return Array.isArray(json?.data) ? json.data : [];
    },
    enabled: isHR,
  });

  const { data: hrBalances = [] } = useQuery<LeaveBalance[]>({
    queryKey: ["/api/leave/balances", balanceEmployeeId],
    queryFn: async () => (await apiRequest("GET", `/api/leave/balances/${balanceEmployeeId}`)).json(),
    enabled: isHR && !!balanceEmployeeId,
  });

  const { data: allBalancesRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/leave/all-balances"],
    queryFn: async () => (await apiRequest("GET", "/api/leave/all-balances")).json(),
    enabled: isHR && section === "balances",
  });

  // ── mutations ──
  const approveMutation = useMutation({
    mutationFn: async ({ approvalId, action, remarks, hrOverride }: { approvalId: string; action: "approve" | "reject"; remarks?: string; hrOverride?: boolean }) => {
      await apiRequest("POST", `/api/leave/${action}/${approvalId}`, { remarks, hrOverride: hrOverride === true ? true : undefined });
    },
    onSuccess: () => {
      toast.success("Action completed");
      invalidateLeaveAndNotifications(qc);
    },
    onError: (err: any) => toast.error(err?.message || "Action failed"),
  });

  const deleteRequestMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/leave/request/${id}`); },
    onSuccess: (_data, id) => {
      toast.success("Request deleted");
      setSelectedRequestId(null);
      qc.invalidateQueries({ queryKey: ["/api/leave"] });
      qc.invalidateQueries({ queryKey: ["/api/leave/requests"] });
      qc.invalidateQueries({ queryKey: ["/api/leave/request", id] });
      qc.invalidateQueries({ queryKey: ["/api/leave/calendar"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to delete"),
  });

  const adjustBalanceMutation = useMutation({
    mutationFn: async ({ balanceId, newBalance, reason }: { balanceId: string; newBalance: number; reason: string }) => {
      await apiRequest("PATCH", `/api/leave/balances/${balanceId}/adjust`, { newBalance, reason });
    },
    onSuccess: () => {
      toast.success("Balance updated");
      qc.invalidateQueries({ queryKey: ["/api/leave"] });
      qc.invalidateQueries({ queryKey: ["/api/leave/balances", balanceEmployeeId] });
      qc.invalidateQueries({ queryKey: ["/api/leave/all-balances"] });
      setBalanceDialog({ open: false, mode: "set" });
      setBalanceForm({ value: "", reason: "" });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to update balance"),
  });

  const addBalanceMutation = useMutation({
    mutationFn: async ({ employeeId, leaveTypeId, daysToAdd, reason }: { employeeId: string; leaveTypeId: string; daysToAdd: number; reason: string }) => {
      await apiRequest("POST", "/api/leave/balances/add", { employeeId, leaveTypeId, daysToAdd, reason });
    },
    onSuccess: () => {
      toast.success("Days added");
      qc.invalidateQueries({ queryKey: ["/api/leave"] });
      qc.invalidateQueries({ queryKey: ["/api/leave/balances", balanceEmployeeId] });
      qc.invalidateQueries({ queryKey: ["/api/leave/all-balances"] });
      setBalanceDialog({ open: false, mode: "add" });
      setBalanceForm({ value: "", reason: "" });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to add balance"),
  });

  const initializeBalancesMutation = useMutation({
    mutationFn: async (empId: string) => { await apiRequest("POST", `/api/leave/balances/initialize/${empId}`); },
    onSuccess: () => {
      toast.success("Balances initialized");
      qc.invalidateQueries({ queryKey: ["/api/leave/balances", balanceEmployeeId] });
      qc.invalidateQueries({ queryKey: ["/api/leave/all-balances"] });
      qc.invalidateQueries({ queryKey: ["/api/leave"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to initialize balances"),
  });

  /** Migrate can take several minutes. Use 10 min timeout. */
  const MIGRATE_LEAVE_TIMEOUT_MS = 10 * 60 * 1000;
  const migrateFromFreshTeamMutation = useMutation({
    mutationFn: async () => {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), MIGRATE_LEAVE_TIMEOUT_MS);
      try {
        const r = await fetch("/api/leave/migrate-from-freshteam", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: ac.signal,
        });
        clearTimeout(t);
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.message || body?.error || `HTTP ${r.status}`);
        }
        return r.json() as Promise<{ success: boolean; total: number; created: number; updated: number; skipped: number; failed: number; employeeNotFound: number; leaveTypeNotFound: number; message?: string }>;
      } catch (e: unknown) {
        clearTimeout(t);
        if (e instanceof Error && e.name === "AbortError") {
          throw new Error("Migration timed out after 10 minutes. Check the server terminal for progress.");
        }
        throw e;
      }
    },
    onSuccess: (data) => {
      toast.success(data?.message ?? `Migrated: ${data?.created ?? 0} created, ${data?.updated ?? 0} updated.`);
      qc.invalidateQueries({ queryKey: ["/api/leave"] });
    },
    onError: (err: any) => {
      if (err?.message?.includes("503") || err?.message?.toLowerCase().includes("not configured")) {
        toast.error("FreshTeam is not configured. Set FRESHTEAM_DOMAIN and FRESHTEAM_API_KEY.");
      } else if (err?.message?.toLowerCase().includes("failed to fetch") || err?.message?.toLowerCase().includes("network")) {
        toast.error("Request failed or timed out. Migration can take several minutes—check the server terminal.");
      } else {
        toast.error(err?.message || "Migration failed");
      }
    },
  });

  /** Sync can take several minutes (one FreshTeam API call per matched employee). Use 10 min timeout. */
  const SYNC_BALANCES_TIMEOUT_MS = 10 * 60 * 1000;
  const syncBalancesFromFreshTeamMutation = useMutation({
    mutationFn: async () => {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), SYNC_BALANCES_TIMEOUT_MS);
      try {
        const r = await fetch("/api/leave/sync-balances-from-freshteam", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: ac.signal,
        });
        clearTimeout(t);
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.message || body?.error || `HTTP ${r.status}`);
        }
        return r.json() as Promise<{ success: boolean; employeesProcessed: number; balancesUpdated: number; skipped: number; failed: number; message?: string }>;
      } catch (e: unknown) {
        clearTimeout(t);
        if (e instanceof Error && e.name === "AbortError") {
          throw new Error("Sync timed out after 10 minutes. Check the server terminal for progress; the sync may still complete on the server.");
        }
        throw e;
      }
    },
    onSuccess: (data) => {
      toast.success(data?.message ?? `Synced: ${data?.balancesUpdated ?? 0} balance rows for ${data?.employeesProcessed ?? 0} employees.`);
      qc.invalidateQueries({ queryKey: ["/api/leave"] });
    },
    onError: (err: any) => {
      if (err?.message?.includes("503") || err?.message?.toLowerCase().includes("not configured")) {
        toast.error("FreshTeam is not configured. Set FRESHTEAM_DOMAIN and FRESHTEAM_API_KEY.");
      } else if (err?.message?.toLowerCase().includes("failed to fetch") || err?.message?.toLowerCase().includes("network")) {
        toast.error("Request failed or timed out. Sync can take several minutes—check the server terminal for [leave/sync-balances] logs.");
      } else {
        toast.error(err?.message || "Sync failed");
      }
    },
  });

  // ── derived ──
  const allBalancesByEmployee = useMemo(() => {
    const m = new Map<string, { employee_id: string; first_name: string; last_name: string; emp_code: string; department: string; byType: Record<string, LeaveBalance> }>();
    for (const r of allBalancesRaw) {
      if (!m.has(r.employee_id)) {
        m.set(r.employee_id, {
          employee_id: r.employee_id,
          first_name: r.first_name ?? "",
          last_name: r.last_name ?? "",
          emp_code: r.emp_code ?? "",
          department: r.department ?? "",
          byType: {},
        });
      }
      const rec = m.get(r.employee_id)!;
      rec.byType[r.leave_type_id] = {
        id: r.id ?? null,
        employee_id: r.employee_id,
        leave_type_id: r.leave_type_id,
        balance: r.balance,
        used: r.used,
        type_name: r.type_name,
        paid: r.paid,
        max_balance: 0,
        color: r.color ?? "",
        accrual_type: "",
        policy_name: "",
        is_compensation_leave: !!r.is_compensation_leave,
      };
    }
    return Array.from(m.values()).sort((a, b) => (a.last_name + a.first_name).localeCompare(b.last_name + b.first_name));
  }, [allBalancesRaw]);

  const elTypeId = useMemo(
    () => leaveTypesList.find((lt: any) => isEarnedLeaveType(lt))?.id ?? null,
    [leaveTypesList],
  );
  const compensationTypes = useMemo(
    () => leaveTypesList.filter((lt: any) => isCompensationLeaveType(lt)),
    [leaveTypesList],
  );

  const openBalanceDialog = (
    employeeId: string,
    lt: { id: string; name: string; is_compensation_leave?: boolean },
    balance: LeaveBalance | null,
    mode: "set" | "add",
  ) => {
    const balRecord: LeaveBalance = balance ?? {
      id: null,
      employee_id: employeeId,
      leave_type_id: lt.id,
      balance: "0",
      used: "0",
      type_name: lt.name,
      paid: true,
      max_balance: 0,
      color: "",
      accrual_type: "",
      policy_name: "",
      is_compensation_leave: !!lt.is_compensation_leave,
    };
    const balNum = displayBalance(parseFloat(String(balRecord.balance ?? 0)));
    setBalanceEmployeeId(employeeId);
    setBalanceDialog({ open: true, mode, balance: balRecord });
    setBalanceForm({ value: mode === "set" ? String(balNum) : "", reason: "" });
  };

  // ── nav ──
  type NavItem = { id: Section; label: string; icon: React.ReactNode; badge?: number; hrOnly?: boolean; breakGlassOnly?: boolean };
  const navItems: NavItem[] = [
    { id: "overview",    label: "Overview",    icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: "approvals",   label: "Approvals",   icon: <CheckCircle className="h-4 w-4" />, badge: pendingApprovals.length },
    { id: "requests",    label: "Requests",    icon: <ClipboardList className="h-4 w-4" /> },
    { id: "balances",    label: "Balances",    icon: <Users className="h-4 w-4" />, hrOnly: true },
    { id: "freshteam",   label: "FreshTeam",   icon: <Download className="h-4 w-4" />, breakGlassOnly: true },
  ];
  const visibleNav = navItems.filter((n) => {
    if (n.breakGlassOnly) return isBreakGlass;
    if (n.hrOnly) return isHR;
    return true;
  });

  // ── section: overview ──
  const overviewSection = (
    <div className="space-y-6">

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Pending Approvals",
            value: pendingApprovals.length || stats?.pendingRequests || 0,
            icon: <CheckCircle className="h-5 w-5" />,
            color: "text-amber-600", bg: "bg-amber-50",
            trend: "Awaiting your action",
            onClick: () => setSection("approvals"),
          },
          {
            label: "On Leave Today",
            value: stats?.onLeaveToday || 0,
            icon: <Users className="h-5 w-5" />,
            color: "text-blue-600", bg: "bg-blue-50",
            trend: "Currently out of office",
            onClick: undefined,
          },
          {
            label: "Approved This Month",
            value: stats?.approvedThisMonth || 0,
            icon: <CheckCircle className="h-5 w-5" />,
            color: "text-emerald-600", bg: "bg-emerald-50",
            trend: "Leave days granted",
            onClick: () => setSection("requests"),
          },
          {
            label: "Active Policies",
            value: stats?.activePolicies || 0,
            icon: <Shield className="h-5 w-5" />,
            color: "text-purple-600", bg: "bg-purple-50",
            trend: "Leave policies in effect",
            onClick: isHR ? () => setLocation("/settings/leave") : undefined,
          },
        ].map(card => (
          <div
            key={card.label}
            className={cn(
              "bg-white rounded-2xl border border-slate-100 shadow-sm p-4 transition-all duration-200",
              card.onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : "hover:shadow-md",
            )}
            onClick={card.onClick}
          >
            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center mb-3", card.bg, card.color)}>
              {card.icon}
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{card.value}</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5">{card.label}</p>
            <p className="text-xs text-slate-400 mt-1">{card.trend}</p>
          </div>
        ))}
      </div>

      {/* ── Pending approvals preview ── */}
      {pendingApprovals.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">Pending Approvals</span>
              <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                {pendingApprovals.length}
              </span>
            </div>
            <button
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setSection("approvals")}
            >
              View all →
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            {pendingApprovals.slice(0, 4).map(a => {
              const isSameDay = a.start_date === a.end_date;
              return (
                <div key={a.id} className="px-6 py-3.5 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
                  <EmployeeAvatar
                    employeeId={a.employee_id}
                    avatarFromList={a.avatar}
                    fallbackInitials={employeeInitials(a.first_name, a.last_name)}
                    className="h-8 w-8 rounded-lg shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{a.first_name} {a.last_name}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {a.department && <span>{a.department} · </span>}
                      {isSameDay
                        ? formatLeaveDisplayDate(a.start_date, leaveTz, leaveDf)
                        : `${formatLeaveDisplayDate(a.start_date, leaveTz, leaveDf)} – ${formatLeaveDisplayDate(a.end_date, leaveTz, leaveDf)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border"
                      style={{ color: a.color, borderColor: `${a.color}40`, backgroundColor: `${a.color}12` }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: a.color }} />
                      {a.type_name}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      {formatLeaveDurationCompact(a.total_days, a.day_type)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {pendingApprovals.length > 4 && (
            <div className="px-6 py-3 border-t border-slate-50 bg-slate-50/50">
              <button className="text-xs text-slate-400 hover:text-primary transition-colors" onClick={() => setSection("approvals")}>
                +{pendingApprovals.length - 4} more pending…
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Quick links ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "All Requests",   desc: "View and search leave requests",     icon: <ClipboardList className="h-5 w-5" />, section: "requests" as Section },
          { label: "Leave Balances", desc: "Adjust and manage leave balances",   icon: <Users          className="h-5 w-5" />, section: "balances" as Section },
          ...(isHR ? [{ label: "Leave Settings", desc: "Policies, leave types and rules", icon: <Shield className="h-5 w-5" />, section: null as null }] : []),
        ].map(link => (
          <button
            key={link.label}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left hover:shadow-md hover:border-primary/20 transition-all duration-200 group"
            onClick={() => link.section ? setSection(link.section) : setLocation("/settings/leave")}
          >
            <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-primary/10 group-hover:text-primary transition-colors mb-3">
              {link.icon}
            </div>
            <p className="text-sm font-semibold text-slate-800">{link.label}</p>
            <p className="text-xs text-slate-400 mt-0.5">{link.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );

  const selectedApproval = useMemo(
    () => pendingApprovals.find(a => a.id === selectedApprovalId) ?? null,
    [pendingApprovals, selectedApprovalId],
  );

  // ── section: approvals ──
  const approvalsSection = (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Approvals</h2>
          <p className="text-sm text-slate-400 mt-0.5">Click a request to review and take action.</p>
        </div>
        {pendingApprovals.length > 0 && (
          <span className="inline-flex items-center justify-center h-7 px-3 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
            {pendingApprovals.length} pending
          </span>
        )}
      </div>

      {pendingApprovals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-20 text-center">
          <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-7 w-7 text-emerald-500" />
          </div>
          <p className="text-base font-semibold text-slate-700">You're all caught up</p>
          <p className="text-sm text-slate-400 mt-1">No pending approvals right now.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Column header */}
          <div className="bg-slate-50/90 border-b border-slate-100 px-5 py-3 hidden sm:grid items-center gap-4"
            style={{ gridTemplateColumns: "minmax(160px,1.4fr) minmax(100px,0.8fr) minmax(160px,1.2fr) 90px 20px" }}>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Dates</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Step</span>
            <span />
          </div>

          <div className="divide-y divide-slate-50">
            {pendingApprovals.map(a => {
              const isSameDay = a.start_date === a.end_date;
              const stepLabel = a.approver_role === "manager" ? "Manager" : a.approver_role === "second_manager" ? "Skip-level" : "HR";
              return (
                <div
                  key={a.id}
                  className="px-4 sm:px-5 py-3.5 grid grid-cols-1 sm:grid-cols-[minmax(160px,1.4fr)_minmax(100px,0.8fr)_minmax(160px,1.2fr)_90px_20px] items-center gap-3 sm:gap-4 hover:bg-slate-50/60 transition-colors duration-150 cursor-pointer group"
                  onClick={() => setSelectedApprovalId(a.id)}
                >
                  {/* Employee */}
                  <div className="flex items-center gap-3 min-w-0">
                    <EmployeeAvatar
                      employeeId={a.employee_id}
                      avatarFromList={a.avatar}
                      fallbackInitials={employeeInitials(a.first_name, a.last_name)}
                      className="h-8 w-8 rounded-lg shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{a.first_name} {a.last_name}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {a.department}{a.department && a.emp_code ? " · " : ""}{a.emp_code ? `#${a.emp_code}` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Leave type */}
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border w-fit"
                    style={{ color: a.color, borderColor: `${a.color}40`, backgroundColor: `${a.color}12` }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: a.color }} />
                    {a.type_name}
                  </span>

                  {/* Dates + duration */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-slate-700">
                      {isSameDay
                        ? formatLeaveDisplayDate(a.start_date, leaveTz, leaveDf)
                        : `${formatLeaveDisplayDate(a.start_date, leaveTz, leaveDf)} – ${formatLeaveDisplayDate(a.end_date, leaveTz, leaveDf)}`}
                    </span>
                    <span className="text-[11px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {formatLeaveDurationCompact(a.total_days, a.day_type)}
                    </span>
                  </div>

                  {/* Step badge */}
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 w-fit">
                    {stepLabel} · {a.step_order}{a.total_steps && a.total_steps > 1 ? `/${a.total_steps}` : ""}
                  </span>

                  {/* Arrow */}
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors hidden sm:block" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  // ── requests: derived ──
  const requestTypeOptions = useMemo(() => {
    const seen = new Map<string, { name: string; color: string }>();
    for (const r of requestRows) {
      if (!seen.has(r.leave_type_id)) seen.set(r.leave_type_id, { name: r.type_name, color: r.color });
    }
    return Array.from(seen.entries()).map(([id, v]) => ({ id, ...v }));
  }, [requestRows]);

  const visibleRequestRows = useMemo(() => {
    if (requestsTypeFilter === "all") return requestRows;
    return requestRows.filter(r => r.leave_type_id === requestsTypeFilter);
  }, [requestRows, requestsTypeFilter]);

  const requestsSummary = useMemo(() => {
    const pending   = requestRows.filter(r => r.status === "pending").length;
    const approved  = requestRows.filter(r => r.status === "approved").length;
    const rejected  = requestRows.filter(r => r.status === "rejected").length;
    return { pending, approved, rejected };
  }, [requestRows]);

  const reqStatusStyle: Record<string, { bg: string; text: string; dot: string; border: string }> = {
    pending:   { bg: "bg-amber-50",   text: "text-amber-700",  dot: "bg-amber-400",   border: "border-amber-100" },
    approved:  { bg: "bg-emerald-50", text: "text-emerald-700",dot: "bg-emerald-500", border: "border-emerald-100" },
    rejected:  { bg: "bg-red-50",     text: "text-red-700",    dot: "bg-red-500",     border: "border-red-100" },
    cancelled: { bg: "bg-slate-100",  text: "text-slate-500",  dot: "bg-slate-400",   border: "border-slate-200" },
  };

  // ── section: requests ──
  const requestsSection = (
    <div className="space-y-5">

      {/* ── Summary strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total (this page)", value: requestsTotal,              icon: <ClipboardList className="h-5 w-5" />, color: "text-blue-600",   bg: "bg-blue-50",   trend: `Page ${requestsPage} of ${requestsTotalPages}` },
          { label: "Pending",           value: requestsSummary.pending,    icon: <CheckCircle   className="h-5 w-5" />, color: "text-amber-600",  bg: "bg-amber-50",  trend: "Awaiting decision" },
          { label: "Approved",          value: requestsSummary.approved,   icon: <CheckCircle   className="h-5 w-5" />, color: "text-emerald-600",bg: "bg-emerald-50",trend: "On this page" },
          { label: "Rejected",          value: requestsSummary.rejected,   icon: <Ban           className="h-5 w-5" />, color: "text-red-600",    bg: "bg-red-50",    trend: "On this page" },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow duration-200">
            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center mb-3", card.bg, card.color)}>
              {card.icon}
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{card.value}</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5">{card.label}</p>
            <p className="text-xs text-slate-400 mt-1">{card.trend}</p>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, type, department..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setRequestsPage(1); }}
              className="w-full h-9 pl-9 pr-3 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setRequestsPage(1); }}
            className="h-9 pl-3 pr-8 text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {requestTypeOptions.length > 1 && (
            <select
              value={requestsTypeFilter}
              onChange={e => setRequestsTypeFilter(e.target.value)}
              className="h-9 pl-3 pr-8 text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="all">All types</option>
              {requestTypeOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {isHR && (
            <div className="ml-auto">
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-xl gap-2 border-slate-200"
                onClick={() => { setApplyOnBehalfSelectedId(null); setApplyOnBehalfSelectOpen(true); }}
              >
                <Plus className="h-4 w-4" /> Apply on behalf
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Request list ── */}
      {visibleRequestRows.length === 0 && requestsTotal === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 text-center">
          <ClipboardList className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-base font-medium text-slate-700">No requests found</p>
          <p className="text-sm text-slate-400 mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Column header */}
            <div
              className="bg-slate-50/90 border-b border-slate-100 px-6 py-3 hidden sm:grid items-center gap-4"
              style={{ gridTemplateColumns: "minmax(180px,1.5fr) minmax(100px,0.8fr) minmax(180px,1.2fr) 100px 52px" }}
            >
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</span>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</span>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Dates</span>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</span>
              <span />
            </div>

            <div className="divide-y divide-slate-50">
              {visibleRequestRows.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-slate-400">No requests on this page. Try a different filter or page.</p>
                </div>
              ) : visibleRequestRows.map(r => {
                const s = reqStatusStyle[r.status] ?? reqStatusStyle.cancelled;
                const isSameDay = r.start_date === r.end_date;

                return (
                  <div
                    key={r.id}
                    className="px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-[minmax(180px,1.5fr)_minmax(100px,0.8fr)_minmax(180px,1.2fr)_100px_52px] items-center gap-3 sm:gap-4 hover:bg-slate-50/60 transition-colors duration-150 cursor-pointer group"
                    onClick={() => setSelectedRequestId(r.id)}
                  >
                    {/* Employee */}
                    <div className="flex items-center gap-3 min-w-0">
                      <EmployeeAvatar
                        employeeId={r.employee_id}
                        avatarFromList={r.avatar}
                        fallbackInitials={employeeInitials(r.first_name, r.last_name)}
                        className="h-9 w-9 rounded-xl shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{r.first_name} {r.last_name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {r.emp_code && <span className="font-mono">#{r.emp_code}</span>}
                          {r.emp_code && r.department && " · "}
                          {r.department}
                        </p>
                      </div>
                    </div>

                    {/* Leave type */}
                    <div>
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border"
                        style={{ color: r.color, borderColor: `${r.color}40`, backgroundColor: `${r.color}12` }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                        {r.type_name}
                      </span>
                    </div>

                    {/* Dates + duration */}
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-700 font-medium">
                          {isSameDay
                            ? formatLeaveDisplayDate(r.start_date, leaveTz, leaveDf)
                            : `${formatLeaveDisplayDate(r.start_date, leaveTz, leaveDf)} – ${formatLeaveDisplayDate(r.end_date, leaveTz, leaveDf)}`}
                        </p>
                        <p className="text-xs text-slate-400">Applied {fmtAppliedAt(r.applied_at, r, leaveTz, leaveDf)}</p>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 shrink-0">
                        {formatLeaveDurationSummary(r.total_days, r.day_type)}
                      </span>
                    </div>

                    {/* Status pill */}
                    <div className="flex sm:justify-start">
                      <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border capitalize", s.bg, s.text, s.border)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", s.dot)} />
                        {r.status}
                      </span>
                    </div>

                    {/* Arrow hint */}
                    <div className="hidden sm:flex justify-end">
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pagination */}
          {requestsTotal > 0 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-slate-400 tabular-nums">
                {requestsTotal > requestsLimit
                  ? `${(requestsPage - 1) * requestsLimit + 1}–${Math.min(requestsPage * requestsLimit, requestsTotal)} of ${requestsTotal} requests`
                  : `${requestsTotal} request${requestsTotal !== 1 ? "s" : ""}`}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={requestsPage <= 1}
                  onClick={() => setRequestsPage(p => Math.max(1, p - 1))}
                  className="h-8 w-8 rounded-xl flex items-center justify-center border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-slate-500 tabular-nums px-2">
                  {requestsPage} / {requestsTotalPages}
                </span>
                <button
                  disabled={requestsPage >= requestsTotalPages}
                  onClick={() => setRequestsPage(p => p + 1)}
                  className="h-8 w-8 rounded-xl flex items-center justify-center border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── balances: derived metrics ──
  const balanceSummary = useMemo(() => {
    const employees = allBalancesByEmployee;
    const total = employees.length;
    let totalELAvailable = 0;
    let lowBalance = 0;
    let compOffBanked = 0;
    for (const emp of employees) {
      const el = elTypeId ? emp.byType[elTypeId] : null;
      const elBal = el ? parseFloat(String(el.balance ?? 0)) : 0;
      totalELAvailable += elBal;
      if (el && elBal < 3) lowBalance++;
      for (const ct of compensationTypes) {
        const cb = emp.byType[(ct as any).id];
        if (cb) compOffBanked += parseFloat(String(cb.balance ?? 0));
      }
    }
    return { total, totalELAvailable: Math.floor(totalELAvailable * 2) / 2, lowBalance, compOffBanked: Math.floor(compOffBanked * 2) / 2 };
  }, [allBalancesByEmployee, elTypeId, compensationTypes]);

  const empHealthStatus = (emp: { byType: Record<string, LeaveBalance> }): "healthy" | "low" | "critical" | "uninitialized" => {
    const el = elTypeId ? emp.byType[elTypeId] : null;
    if (!el) return "uninitialized";
    const bal = parseFloat(String(el.balance ?? 0));
    if (bal <= 0) return "critical";
    if (bal < 3) return "low";
    return "healthy";
  };

  const filteredBalanceEmployees = useMemo(() => {
    const q = balanceSearch.trim().toLowerCase();
    return allBalancesByEmployee.filter(emp => {
      if (q && !`${emp.first_name} ${emp.last_name} ${emp.emp_code} ${emp.department}`.toLowerCase().includes(q)) return false;
      if (balanceDeptFilter !== "all" && emp.department !== balanceDeptFilter) return false;
      if (balanceStatusFilter !== "all") {
        const s = empHealthStatus(emp);
        if (s !== balanceStatusFilter) return false;
      }
      return true;
    });
  }, [allBalancesByEmployee, balanceSearch, balanceDeptFilter, balanceStatusFilter, elTypeId]);

  const uniqueDepts = useMemo(() =>
    [...new Set(allBalancesByEmployee.map(e => e.department).filter(Boolean))].sort(),
    [allBalancesByEmployee],
  );

  const selectedBalanceEmployee = useMemo(
    () => allBalancesByEmployee.find(e => e.employee_id === selectedBalanceEmployeeId) ?? null,
    [allBalancesByEmployee, selectedBalanceEmployeeId],
  );

  // ── section: balances ──
  const balancesSection = (
    <div className="space-y-5">
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          { label: "Total Employees",  value: balanceSummary.total,                          icon: <Users className="h-5 w-5" />,         color: "text-blue-600",   bg: "bg-blue-50",   trend: "Active in policy" },
          { label: "EL Available (days)", value: balanceSummary.totalELAvailable.toFixed(1), icon: <Calendar className="h-5 w-5" />,      color: "text-emerald-600",bg: "bg-emerald-50",trend: "Across all employees" },
          { label: "Low Balance",      value: balanceSummary.lowBalance,                     icon: <AlertTriangle className="h-5 w-5" />, color: "text-amber-600",  bg: "bg-amber-50",  trend: "< 3 days EL remaining" },
          { label: "Comp Off Banked",  value: balanceSummary.compOffBanked,                  icon: <Gift className="h-5 w-5" />,          color: "text-purple-600", bg: "bg-purple-50", trend: "Days awaiting use" },
        ] as const).map(card => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow duration-200">
            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center mb-3", card.bg, card.color)}>
              {card.icon}
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{card.value}</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5">{card.label}</p>
            <p className="text-xs text-slate-400 mt-1">{card.trend}</p>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search employee..."
              value={balanceSearch}
              onChange={e => setBalanceSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
          <select
            value={balanceDeptFilter}
            onChange={e => setBalanceDeptFilter(e.target.value)}
            className="h-9 pl-3 pr-8 text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="all">All Departments</option>
            {uniqueDepts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            value={balanceStatusFilter}
            onChange={e => setBalanceStatusFilter(e.target.value)}
            className="h-9 pl-3 pr-8 text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="all">All Statuses</option>
            <option value="healthy">Healthy</option>
            <option value="low">Low Balance</option>
            <option value="critical">Critical</option>
            <option value="uninitialized">Not set up</option>
          </select>
          <div className="ml-auto flex items-center gap-2">
            {compensationTypes.length > 0 && (
              <Button
                size="sm"
                className="h-9 rounded-xl bg-amber-500 hover:bg-amber-600 text-white gap-2 shadow-sm"
                onClick={() => {
                  setGrantCompOffForm({ employeeId: "", leaveTypeId: (compensationTypes[0] as any).id ?? "", days: "1", dateWorked: new Date().toISOString().slice(0, 10), reason: "" });
                  setGrantCompOffOpen(true);
                }}
              >
                <Gift className="h-4 w-4" /> Grant Comp Off
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Employee list ── */}
      {leaveTypesList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 text-center">
          <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-base font-medium text-slate-700">No leave types configured</p>
          <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">Open <strong>Leave settings</strong> to add leave types.</p>
        </div>
      ) : filteredBalanceEmployees.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 text-center">
          <Search className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-base font-medium text-slate-700">No employees match</p>
          <p className="text-sm text-slate-400 mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Sticky column header */}
          <div
            className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur-sm border-b border-slate-100 px-5 py-2.5 hidden sm:grid items-center gap-4"
            style={{ gridTemplateColumns: "minmax(160px,1.2fr) minmax(240px,2fr) 96px 20px" }}
          >
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Leave Balances</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</span>
            <span />
          </div>

          <div className="divide-y divide-slate-50">
            {filteredBalanceEmployees.map(emp => {
              const elBalance = elTypeId ? emp.byType[elTypeId] : null;
              const elType = elTypeId ? leaveTypesList.find((lt: any) => lt.id === elTypeId) : null;
              const elBal = parseFloat(String(elBalance?.balance ?? 0));
              const elUsed = parseFloat(String(elBalance?.used ?? 0));
              const elMax = Number(elType?.max_balance) || 0;
              const elPct = elMax > 0 ? Math.min(100, (elBal / elMax) * 100) : 0;
              const status = empHealthStatus(emp);
              const secondaryTypes = leaveTypesList.filter((lt: any) => lt.id !== elTypeId);

              return (
                <div
                  key={emp.employee_id}
                  className="px-4 sm:px-5 py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(160px,1.2fr)_minmax(240px,2fr)_96px_20px] items-center gap-3 sm:gap-4 hover:bg-slate-50/60 transition-colors duration-150 cursor-pointer group"
                  onClick={() => setSelectedBalanceEmployeeId(emp.employee_id)}
                >
                  {/* Employee */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <EmployeeAvatar
                      employeeId={emp.employee_id}
                      fallbackInitials={employeeInitials(emp.first_name, emp.last_name)}
                      className="h-8 w-8 rounded-lg shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {emp.emp_code && <span className="font-mono">#{emp.emp_code}</span>}
                        {emp.emp_code && emp.department && " · "}
                        {emp.department}
                      </p>
                    </div>
                  </div>

                  {/* Primary EL + secondary chips */}
                  <div className="min-w-0 space-y-1">
                    {elBalance ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-600 truncate">
                            {elBalance.type_name || "Earned Leave"}
                          </span>
                          <span className="text-xs tabular-nums text-slate-600 font-semibold shrink-0">
                            {formatBalanceDays(elBal)}{" "}
                            <span className="text-slate-400 font-normal">/ {formatBalanceDays(elUsed)} used</span>
                          </span>
                        </div>
                        {elMax > 0 && (
                          <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                elPct > 50 ? "bg-emerald-400" : elPct > 20 ? "bg-amber-400" : "bg-red-400",
                              )}
                              style={{ width: `${elPct}%` }}
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">Earned leave not set up</span>
                    )}
                    {secondaryTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {secondaryTypes.map((lt: any) => {
                          const b = emp.byType[lt.id];
                          const isComp = isCompensationLeaveType(lt);
                          if (!b && !isComp) return null;
                          const bal = parseFloat(String(b?.balance ?? 0));
                          const label = leaveTypeShortLabel(lt.name);
                          if (b?.paid === false) {
                            return (
                              <span key={lt.id} className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-500">
                                {label} ∞
                              </span>
                            );
                          }
                          if (isComp) {
                            return (
                              <span
                                key={lt.id}
                                className={cn(
                                  "inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium",
                                  bal > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500",
                                )}
                              >
                                {label} {formatBalanceDays(bal)}
                              </span>
                            );
                          }
                          return (
                            <span key={lt.id} className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600">
                              {label} {formatBalanceDays(bal)}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Status pill */}
                  <div>
                    {{
                      healthy:       <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Healthy</span>,
                      low:           <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Low</span>,
                      critical:      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 border border-red-100"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Critical</span>,
                      uninitialized: <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Not set up</span>,
                    }[status]}
                  </div>

                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors hidden sm:block justify-self-end" />
                </div>
              );
            })}
          </div>

          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-400">{filteredBalanceEmployees.length} of {allBalancesByEmployee.length} employees</p>
          </div>
        </div>
      )}

      {/* ──  Unused warning ── */}
      {compensationTypes.length === 0 && leaveTypesList.some((lt: any) => /compensation|comp[\s-]?off/i.test(String(lt.name ?? ""))) && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          A leave type looks like comp off by name but the flag is off. Edit it in Leave settings → enable <strong>Compensation leave (comp off)</strong>.
        </p>
      )}
    </div>
  );

  // ── section: freshteam ──
  const freshteamSection = (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">FreshTeam Sync</h2>
        <p className="text-sm text-muted-foreground">
          Import and sync leave data from FreshTeam. Requires FRESHTEAM_DOMAIN and FRESHTEAM_API_KEY to be configured.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="h-4 w-4" /> Migrate Leave Requests
            </CardTitle>
            <CardDescription>
              Pull all time-offs from FreshTeam and create/update leave requests for existing employees matched by work email.
              Leave types are matched by name (Earned, LWOP, Bereavement, etc.).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              disabled={migrateFromFreshTeamMutation.isPending}
              onClick={() => {
                if (window.confirm("Pull all time-offs from FreshTeam and create/update leave requests for existing employees? Continue?")) {
                  migrateFromFreshTeamMutation.mutate();
                }
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              {migrateFromFreshTeamMutation.isPending ? "Migrating…" : "Migrate from FreshTeam"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="h-4 w-4" /> Sync Leave Balances
            </CardTitle>
            <CardDescription>
              Sync leave balances from FreshTeam for existing employees. Balance and used days will be set from FreshTeam's
              leave_credits and leaves_availed per leave type.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              disabled={syncBalancesFromFreshTeamMutation.isPending}
              onClick={() => {
                if (window.confirm("Sync leave balances from FreshTeam for existing employees? Continue?")) {
                  syncBalancesFromFreshTeamMutation.mutate();
                }
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              {syncBalancesFromFreshTeamMutation.isPending ? "Syncing…" : "Sync Balances from FreshTeam"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const sectionContent: Record<Section, React.ReactNode> = {
    "overview":    overviewSection,
    "approvals":   approvalsSection,
    "requests":    requestsSection,
    "balances":    balancesSection,
    "freshteam":   freshteamSection,
  };

  return (
    <Layout>
      <div className="flex h-full min-h-[calc(100vh-80px)] gap-0">
        {/* ── Left Sidebar ── */}
        <aside className="w-56 shrink-0 border-r bg-muted/30 flex flex-col">
          <div className="p-4 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Leave Admin</p>
            <Button
              variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs px-0 text-muted-foreground hover:text-foreground"
              onClick={() => setLocation("/leave/employee")}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Employee View
            </Button>
            {isHR && (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2 text-xs h-8"
                onClick={() => setLocation("/settings/leave")}
              >
                Leave settings
              </Button>
            )}
          </div>

          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
            {visibleNav.map(item => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left",
                  section === item.id
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-2.5">
                  {item.icon}
                  {item.label}
                </span>
                {item.badge && item.badge > 0 && (
                  <Badge
                    variant="destructive"
                    className="h-5 min-w-[20px] text-[10px] px-1.5"
                  >
                    {item.badge}
                  </Badge>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-auto p-6">
          {sectionContent[section]}
        </main>
      </div>

      {/* Balance adjust / add dialog */}
      <Dialog open={balanceDialog.open} onOpenChange={open => !open && setBalanceDialog({ open: false, mode: "set" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {balanceDialog.mode === "set"
                ? `Set balance (${balanceDialog.balance?.type_name ?? "Leave"})`
                : `Add days (${balanceDialog.balance?.type_name ?? "Leave"})`}
            </DialogTitle>
            <DialogDescription>
              {balanceDialog.mode === "set"
                ? `Set the new total ${balanceDialog.balance?.type_name ?? "leave"} balance. Provide a reason for audit.`
                : `Add days to ${balanceDialog.balance?.type_name ?? "leave"} (e.g. worked on a holiday). Provide a reason for audit.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{balanceDialog.mode === "set" ? "New balance (days)" : "Days to add"}</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={balanceForm.value}
                onChange={e => setBalanceForm(f => ({ ...f, value: e.target.value }))}
                placeholder="0.5 or 1, 1.5, 2..."
                className="mt-1"
              />
            </div>
            <div>
              <Label>Reason</Label>
              <Input
                value={balanceForm.reason}
                onChange={e => setBalanceForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Worked on public holiday — 26 May 2026"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceDialog({ open: false, mode: "set" })}>Cancel</Button>
            {balanceDialog.mode === "set" && balanceDialog.balance && balanceDialog.balance.id && (
              <Button
                disabled={adjustBalanceMutation.isPending}
                onClick={() => {
                  const n = roundToHalfDay(parseFloat(balanceForm.value));
                  if (!Number.isNaN(n) && n >= 0 && balanceForm.reason.trim()) {
                    adjustBalanceMutation.mutate({ balanceId: balanceDialog.balance!.id!, newBalance: n, reason: balanceForm.reason.trim() });
                  } else {
                    toast.error("Enter valid balance (0.5 or whole days) and reason.");
                  }
                }}
              >
                Save
              </Button>
            )}
            {balanceDialog.mode === "add" && balanceDialog.balance && balanceEmployeeId && (
              <Button
                disabled={addBalanceMutation.isPending}
                onClick={() => {
                  const n = roundToHalfDay(parseFloat(balanceForm.value));
                  if (!Number.isNaN(n) && n > 0 && balanceForm.reason.trim()) {
                    addBalanceMutation.mutate({ employeeId: balanceEmployeeId, leaveTypeId: balanceDialog.balance!.leave_type_id, daysToAdd: n, reason: balanceForm.reason.trim() });
                  } else {
                    toast.error("Enter days to add (0.5 or whole days) and reason.");
                  }
                }}
              >
                Add
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Approval detail modal ── */}
      <Dialog open={!!selectedApprovalId} onOpenChange={open => !open && setSelectedApprovalId(null)}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          {selectedApproval && (() => {
            const a = selectedApproval;
            const isSameDay = a.start_date === a.end_date;
            const stepLabel = a.approver_role === "manager" ? "Manager" : a.approver_role === "second_manager" ? "Skip-level" : "HR";
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-base font-bold text-slate-900">Review Leave Request</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 pt-1">
                  {/* Employee */}
                  <div className="flex items-center gap-3">
                    <EmployeeAvatar
                      employeeId={a.employee_id}
                      avatarFromList={a.avatar}
                      fallbackInitials={employeeInitials(a.first_name, a.last_name)}
                      className="h-11 w-11 rounded-xl shrink-0"
                    />
                    <div>
                      <p className="font-semibold text-slate-900">{a.first_name} {a.last_name}</p>
                      <p className="text-xs text-slate-400">
                        {a.department}{a.department && a.emp_code ? " · " : ""}{a.emp_code ? `#${a.emp_code}` : ""}
                      </p>
                    </div>
                    <div className="ml-auto">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                        {stepLabel} · Step {a.step_order}{a.total_steps && a.total_steps > 1 ? ` of ${a.total_steps}` : ""}
                      </span>
                    </div>
                  </div>

                  {/* Leave details */}
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border"
                        style={{ color: a.color, borderColor: `${a.color}40`, backgroundColor: `${a.color}12` }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: a.color }} />
                        {a.type_name}
                      </span>
                      {a.paid === false && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">Unpaid</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">
                        {isSameDay
                          ? formatLeaveDisplayDate(a.start_date, leaveTz, leaveDf)
                          : `${formatLeaveDisplayDate(a.start_date, leaveTz, leaveDf)} – ${formatLeaveDisplayDate(a.end_date, leaveTz, leaveDf)}`}
                      </p>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white border border-slate-200 text-slate-600">
                        {formatLeaveDurationSummary(a.total_days, a.day_type)}
                      </span>
                    </div>
                    {a.reason && (
                      <p className="text-sm text-slate-500 italic border-t border-slate-100 pt-2.5">
                        "{a.reason}"
                      </p>
                    )}
                    {a.applied_at && (
                      <p className="text-xs text-slate-500 border-t border-slate-100 pt-2.5">
                        <span className="font-medium text-slate-600">Submitted:</span>{" "}
                        {fmtAppliedAt(a.applied_at, a, leaveTz, leaveDf)}
                      </p>
                    )}
                  </div>

                  {/* Workflow hints */}
                  <div className="space-y-2">
                    {isHrLevel && (a.approver_role === "manager" || a.approver_role === "second_manager") && (
                      <div className="flex items-start gap-2 text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-0.5 shrink-0" />
                        <span>
                          <strong>{a.approver_role === "second_manager" ? "Skip-level manager has not approved yet." : "Line manager has not approved yet."}</strong> Stays pending until the manager acts, or use HR override below.
                        </span>
                      </div>
                    )}
                    {isHrLevel && (a.approver_role === "hr" || a.approver_role === "admin") && a.has_prior_pending && (
                      <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-0.5 shrink-0" />
                        <span><strong>Prior step still pending.</strong> Enable HR override to skip and approve now.</span>
                      </div>
                    )}
                    {isHrLevel && (a.approver_role === "hr" || a.approver_role === "admin") && !a.has_prior_pending && (a.step_order ?? 1) > 1 && (
                      <div className="flex items-start gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-0.5 shrink-0" />
                        <span><strong>All prior steps done.</strong> Waiting on HR only.</span>
                      </div>
                    )}
                    {isHrLevel && (a.approver_role === "hr" || a.approver_role === "admin") && !a.has_prior_pending && (a.step_order ?? 1) <= 1 && (
                      <div className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-0.5 shrink-0" />
                        <span><strong>HR approval step.</strong> No earlier step is blocking this request.</span>
                      </div>
                    )}
                    {!isHrLevel && a.has_prior_pending && (
                      <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-0.5 shrink-0" />
                        <span>An earlier approval step is still pending. Approve only after it is done.</span>
                      </div>
                    )}
                  </div>

                  {/* HR override */}
                  {isHR && (a.approver_id !== employeeId || !!a.has_prior_pending) && (
                    <label className="inline-flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={approvalOnBehalf[a.id] === true}
                        onChange={e => setApprovalOnBehalf(prev => ({ ...prev, [a.id]: e.target.checked }))}
                      />
                      HR override{" "}
                      <span className="text-slate-400">
                        {a.approver_id !== employeeId ? "(acting for assigned approver)" : "(skip earlier pending step)"}
                      </span>
                    </label>
                  )}

                  {/* Remarks */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">Remarks (optional)</Label>
                    <Input
                      className="h-9 text-sm rounded-xl border-slate-200 bg-slate-50 focus:bg-white"
                      placeholder="Add a note for the employee…"
                      value={approvalRemarks[a.id] || ""}
                      onChange={e => setApprovalRemarks(prev => ({ ...prev, [a.id]: e.target.value }))}
                    />
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setSelectedApprovalId(null)}
                  >
                    Close
                  </Button>
                  <Button
                    className="rounded-xl bg-red-500 hover:bg-red-600 text-white gap-1.5 font-semibold"
                    disabled={approveMutation.isPending}
                    onClick={() => {
                      approveMutation.mutate({
                        approvalId: a.id, action: "reject",
                        remarks: approvalRemarks[a.id],
                        hrOverride: isHR && (a.approver_id !== employeeId || approvalOnBehalf[a.id] === true) ? true : undefined,
                      });
                      setSelectedApprovalId(null);
                    }}
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                  <Button
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 gap-1.5 font-semibold"
                    disabled={approveMutation.isPending}
                    onClick={() => {
                      approveMutation.mutate({
                        approvalId: a.id, action: "approve",
                        remarks: approvalRemarks[a.id],
                        hrOverride: isHR && approvalOnBehalf[a.id] === true ? true : undefined,
                      });
                      setSelectedApprovalId(null);
                    }}
                  >
                    <CheckCircle className="h-4 w-4" /> Approve
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Balance detail modal ── */}
      <Dialog open={!!selectedBalanceEmployeeId} onOpenChange={open => !open && setSelectedBalanceEmployeeId(null)}>
        <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
          {selectedBalanceEmployee && (() => {
            const emp = selectedBalanceEmployee;
            const hasMissingType = leaveTypesList.some((lt: any) => !emp.byType[lt.id]);
            const elBalance = elTypeId ? emp.byType[elTypeId] : null;
            const status = empHealthStatus(emp);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-base font-bold text-slate-900">Leave Balances</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 pt-1">
                  {/* Employee header */}
                  <div className="flex items-center gap-3">
                    <EmployeeAvatar
                      employeeId={emp.employee_id}
                      fallbackInitials={employeeInitials(emp.first_name, emp.last_name)}
                      className="h-11 w-11 rounded-xl shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900">{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs text-slate-400">
                        {emp.emp_code && <span className="font-mono">#{emp.emp_code}</span>}
                        {emp.emp_code && emp.department && " · "}
                        {emp.department}
                      </p>
                    </div>
                    {{
                      healthy:       <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Healthy</span>,
                      low:           <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Low</span>,
                      critical:      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 border border-red-100 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Critical</span>,
                      uninitialized: <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Not set up</span>,
                    }[status]}
                  </div>

                  {/* All leave types — full detail */}
                  <div className="rounded-xl border border-slate-100 divide-y divide-slate-50">
                    {leaveTypesList.map((lt: any) => {
                      const b = emp.byType[lt.id];
                      const isComp = isCompensationLeaveType(lt);
                      const bal = parseFloat(String(b?.balance ?? 0));
                      const used = parseFloat(String(b?.used ?? 0));
                      const max = Number(lt.max_balance) || 0;
                      const pct = max > 0 ? Math.min(100, (bal / max) * 100) : 0;
                      if (!b && !isComp) return null;

                      return (
                        <div key={lt.id} className="px-4 py-3 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isComp ? "#fbbf24" : (lt.color ?? "#94a3b8") }} />
                              <span className="text-sm font-medium text-slate-700 truncate">{lt.name}</span>
                            </div>
                            {b?.paid === false ? (
                              <span className="text-xs text-slate-400 italic shrink-0">∞ Unlimited</span>
                            ) : isComp ? (
                              <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0",
                                bal > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500",
                              )}>
                                {formatBalanceDays(bal)} available{used > 0 ? ` · ${formatBalanceDays(used)} used` : ""}
                              </span>
                            ) : (
                              <span className="text-xs tabular-nums text-slate-600 font-semibold shrink-0">
                                {formatBalanceDays(bal)}{" "}
                                <span className="text-slate-400 font-normal">/ {formatBalanceDays(used)} used</span>
                              </span>
                            )}
                          </div>
                          {!isComp && b?.paid !== false && max > 0 && (
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-500",
                                  pct > 50 ? "bg-emerald-400" : pct > 20 ? "bg-amber-400" : "bg-red-400",
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl gap-1.5"
                    onClick={() => {
                      setBalanceEmployeeId(emp.employee_id);
                      initializeBalancesMutation.mutate(emp.employee_id);
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {hasMissingType ? "Initialize Leave" : "Re-init Leave"}
                  </Button>
                  <div className="flex flex-wrap gap-2 justify-end">
                    {elBalance && isEarnedLeaveType({ type_name: elBalance.type_name, is_compensation_leave: elBalance.is_compensation_leave }) && elBalance.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl gap-1.5"
                        onClick={() => {
                          openBalanceDialog(emp.employee_id, { id: elTypeId!, name: elBalance.type_name, is_compensation_leave: false }, elBalance, "set");
                          setSelectedBalanceEmployeeId(null);
                        }}
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust EL
                      </Button>
                    )}
                    {compensationTypes.length > 0 && (
                      <Button
                        size="sm"
                        className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white gap-1.5"
                        onClick={() => {
                          setGrantCompOffForm({
                            employeeId: emp.employee_id,
                            leaveTypeId: (compensationTypes[0] as any).id ?? "",
                            days: "1",
                            dateWorked: new Date().toISOString().slice(0, 10),
                            reason: "",
                          });
                          setGrantCompOffOpen(true);
                          setSelectedBalanceEmployeeId(null);
                        }}
                      >
                        <Gift className="h-3.5 w-3.5" /> Grant Comp Off
                      </Button>
                    )}
                  </div>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Grant Comp Off modal ── */}
      <Dialog open={grantCompOffOpen} onOpenChange={setGrantCompOffOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-amber-500" /> Grant Comp Off
            </DialogTitle>
            <DialogDescription>
              Credit compensation leave days to an employee for working on a holiday or off day.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <select
                value={grantCompOffForm.employeeId}
                onChange={e => setGrantCompOffForm(f => ({ ...f, employeeId: e.target.value }))}
                className="w-full h-9 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select employee…</option>
                {allBalancesByEmployee.map(emp => (
                  <option key={emp.employee_id} value={emp.employee_id}>
                    {emp.first_name} {emp.last_name}{emp.department ? ` — ${emp.department}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {compensationTypes.length > 1 && (
              <div className="space-y-1.5">
                <Label>Comp Off Leave Type</Label>
                <select
                  value={grantCompOffForm.leaveTypeId}
                  onChange={e => setGrantCompOffForm(f => ({ ...f, leaveTypeId: e.target.value }))}
                  className="w-full h-9 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {compensationTypes.map((ct: any) => (
                    <option key={ct.id} value={ct.id}>{ct.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date Worked</Label>
                <Input
                  type="date"
                  value={grantCompOffForm.dateWorked}
                  onChange={e => setGrantCompOffForm(f => ({ ...f, dateWorked: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Days to Grant</Label>
                <Input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={grantCompOffForm.days}
                  onChange={e => setGrantCompOffForm(f => ({ ...f, days: e.target.value }))}
                  placeholder="1"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea
                value={grantCompOffForm.reason}
                onChange={e => setGrantCompOffForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Worked on Eid holiday — 12 Apr 2025"
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantCompOffOpen(false)}>Cancel</Button>
            <Button
              disabled={grantCompOffPending}
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={async () => {
                const { employeeId, leaveTypeId, days, reason } = grantCompOffForm;
                const daysNum = roundToHalfDay(parseFloat(days));
                if (!employeeId) { toast.error("Select an employee"); return; }
                if (!leaveTypeId) { toast.error("Select a leave type"); return; }
                if (!daysNum || daysNum <= 0) { toast.error("Enter days to grant (0.5 or whole days)"); return; }
                if (!reason.trim()) { toast.error("Enter a reason"); return; }
                setGrantCompOffPending(true);
                try {
                  await apiRequest("POST", "/api/leave/balances/add", {
                    employeeId,
                    leaveTypeId,
                    daysToAdd: daysNum,
                    reason: reason.trim(),
                    dateWorked: grantCompOffForm.dateWorked || undefined,
                  });
                  toast.success(`${daysNum} comp off day${daysNum !== 1 ? "s" : ""} granted`);
                  invalidateLeaveAndNotifications(qc);
                  setGrantCompOffOpen(false);
                } catch (err: any) {
                  toast.error(err?.message || "Failed to grant comp off");
                } finally {
                  setGrantCompOffPending(false);
                }
              }}
            >
              {grantCompOffPending ? "Granting…" : "Grant Days"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Time Off Request detail (from All Requests / Team Requests table) */}
      <Dialog open={!!selectedRequestId} onOpenChange={(open) => !open && setSelectedRequestId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="flex flex-row items-center justify-between gap-2">
            <DialogTitle>Time Off Request</DialogTitle>
            {requestDetail && (
              <Badge className={cn("text-xs border shrink-0", statusStyle[requestDetail.status] || "")}>
                {requestDetail.status}
              </Badge>
            )}
          </DialogHeader>
          {requestDetail && (
            <div className="space-y-4">
              {requestDetail.first_name != null && (
                <p className="text-sm font-medium">
                  {requestDetail.first_name} {requestDetail.last_name}
                  {requestDetail.department && <span className="text-muted-foreground font-normal"> — {requestDetail.department}</span>}
                </p>
              )}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-2xl font-semibold text-muted-foreground">{formatLeaveDurationSummary(requestDetail.total_days, requestDetail.day_type)}</span>
                  <span className="text-sm">
                    {formatLeaveDisplayDate(requestDetail.start_date, leaveTz, leaveDf)}
                    {requestDetail.start_date !== requestDetail.end_date ? ` – ${formatLeaveDisplayDate(requestDetail.end_date, leaveTz, leaveDf)}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: requestDetail.color }} />
                  <span className="text-sm font-medium">{requestDetail.type_name}</span>
                  <span className="text-xs text-muted-foreground">{formatLeaveDayTypeLabel(requestDetail.day_type)}</span>
                </div>
                {requestDetail.reason && (
                  <div className="pt-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Comments</p>
                    <p className="text-sm mt-0.5">{requestDetail.reason}</p>
                  </div>
                )}
              </div>
              <div className="text-sm space-y-1.5 text-muted-foreground">
                <p>Applied on {fmtAppliedAt(requestDetail.applied_at, requestDetail, leaveTz, leaveDf)}</p>
                {requestDetail.status === "approved" && requestDetail.decided_at && (
                  <p>
                    {requestDetail.decided_by === "auto"
                      ? `Approved (auto) on ${fmtDateTime(requestDetail.decided_at, leaveTz, leaveDf)}`
                      : `Approved by ${[requestDetail.decided_by_first_name, requestDetail.decided_by_last_name].filter(Boolean).join(" ") || "-"} on ${fmtDateTime(requestDetail.decided_at, leaveTz, leaveDf)}`}
                  </p>
                )}
                {requestDetail.status === "rejected" && requestDetail.decided_at && (
                  <p>
                    Rejected by {[requestDetail.decided_by_first_name, requestDetail.decided_by_last_name].filter(Boolean).join(" ") || "-"} on {fmtDateTime(requestDetail.decided_at, leaveTz, leaveDf)}
                    {requestDetail.rejection_reason && ` — ${requestDetail.rejection_reason}`}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  disabled={deleteRequestMutation.isPending}
                  onClick={() => {
                    if (window.confirm("Permanently delete this leave request? This cannot be undone.")) {
                      deleteRequestMutation.mutate(requestDetail.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleteRequestMutation.isPending ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Apply on behalf: select employee then open apply dialog */}
      <Dialog open={applyOnBehalfSelectOpen} onOpenChange={(open) => !open && setApplyOnBehalfSelectOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply leave on behalf</DialogTitle>
            <DialogDescription>
              Select an employee who forgot to apply. You will submit a leave request for them (e.g. for days already taken).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Employee</Label>
            <Select value={applyOnBehalfSelectedId ?? ""} onValueChange={(v) => setApplyOnBehalfSelectedId(v || null)}>
              <SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger>
              <SelectContent>
                {(employeesList as Array<{ id: string; first_name?: string; last_name?: string; department?: string }>).map((emp: any) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                      {emp.department ? ` — ${emp.department}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOnBehalfSelectOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (applyOnBehalfSelectedId) {
                  setApplyOnBehalfEmployeeId(applyOnBehalfSelectedId);
                  setApplyOnBehalfSelectOpen(false);
                } else {
                  toast.error("Select an employee");
                }
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {applyOnBehalfEmployeeId && (
        <ApplyLeaveDialog
          open={!!applyOnBehalfEmployeeId}
          onClose={() => setApplyOnBehalfEmployeeId(null)}
          employeeId={applyOnBehalfEmployeeId}
          submitForEmployeeId={applyOnBehalfEmployeeId}
        />
      )}
    </Layout>
  );
}

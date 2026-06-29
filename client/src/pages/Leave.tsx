import Layout from "@/components/layout/Layout";
import { ApplyLeaveDialog } from "@/components/ApplyLeaveDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { EmployeeAvatar, employeeInitials } from "@/components/EmployeeAvatar";
import { apiRequest } from "@/lib/queryClient";
import { invalidateLeaveAndNotifications } from "@/lib/leaveQueryInvalidation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar, CheckCircle, ChevronLeft, ChevronRight,
  Clock, LayoutDashboard, List, Plus, Settings, Trash2, Users,
  CalendarDays, TrendingUp, Sparkles, XCircle, AlertCircle,
  ArrowRight, Ban,
} from "lucide-react";
import { useMemo, useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { formatAppliedAtForEmployee, formatDateTimeWithTimezone, formatLeaveDisplayDate } from "@/lib/dateUtils";
import { formatLeaveDurationSummary } from "@shared/leaveDayType";

// ───────────────────────── types ─────────────────────────
interface LeaveBalance {
  id: string; employee_id: string; leave_type_id: string;
  balance: string; used: string; type_name: string; paid: boolean;
  max_balance: number; color: string; accrual_type: string; policy_name: string;
}
interface MyRequest {
  id: string; leave_type_id: string; start_date: string; end_date: string;
  day_type: string; total_days: string; reason: string | null; status: string;
  applied_at: string; decided_at: string | null; rejection_reason: string | null;
  type_name: string; color: string; paid: boolean;
}
interface CalendarEvent {
  id: string; employee_id: string; start_date: string; end_date: string;
  day_type: string; total_days: string; status: string; type_name: string;
  color: string; first_name: string; last_name: string; department: string;
  avatar: string | null;
}
interface Stats {
  pendingRequests: number; onLeaveToday: number;
  approvedThisMonth: number; activePolicies: number;
}

// ───────────────────────── helpers ───────────────────────
const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  pending:   { label: "Pending",   className: "bg-amber-50 text-amber-700 border-amber-200",   icon: <Clock className="h-3 w-3" /> },
  approved:  { label: "Approved",  className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle className="h-3 w-3" /> },
  rejected:  { label: "Rejected",  className: "bg-red-50 text-red-700 border-red-200",         icon: <XCircle className="h-3 w-3" /> },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-500 border-slate-200",  icon: <Ban className="h-3 w-3" /> },
};

function fmtDate(d: string | null, tz?: string | null, df?: string | null) {
  if (!d) return "—";
  return formatLeaveDisplayDate(d + (d.includes("T") ? "" : "T00:00:00"), tz ?? null, df ?? null);
}
function fmtDateTime(iso: string | null | undefined, tz?: string | null, df?: string | null) {
  if (!iso) return "—";
  return formatDateTimeWithTimezone(iso, tz ?? null, df ?? null);
}
function displayBalance(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n * 2) / 2;
}
function formatBalanceDisplay(n: number): string {
  const x = displayBalance(n);
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}
function getInitials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

type Section = "overview" | "my-requests" | "calendar";

// ───────────────────────── main page ─────────────────────
export default function Leave() {
  const [, setLocation] = useLocation();
  const leaveSearch = useSearch();
  const [section, setSection] = useState<Section>("overview");
  const [applyOpen, setApplyOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const leaveDeepLinkApplied = useRef<string | null>(null);
  const qc = useQueryClient();

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
  const isAdminUser = role === "hr" || role === "admin" || role === "manager" || roles.includes("hr") || roles.includes("admin") || roles.includes("manager");
  const firstName: string = me?.firstName || me?.first_name || "";
  const lastName: string = me?.lastName || me?.last_name || "";

  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/leave/stats"],
    queryFn: async () => (await apiRequest("GET", "/api/leave/stats")).json(),
  });

  const { data: myBalances = [] } = useQuery<LeaveBalance[]>({
    queryKey: ["/api/leave/balances", employeeId],
    queryFn: async () => (await apiRequest("GET", `/api/leave/balances/${employeeId}`)).json(),
    enabled: !!employeeId,
  });

  const { data: myRequests = [] } = useQuery<MyRequest[]>({
    queryKey: ["/api/leave/my-requests"],
    queryFn: async () => (await apiRequest("GET", "/api/leave/my-requests")).json(),
    enabled: !!employeeId,
  });

  // Deep link from email: /leave/employee?requestId=<id>
  useEffect(() => {
    const qs = new URLSearchParams(leaveSearch || "");
    const rid = qs.get("requestId")?.trim();
    if (!rid) { leaveDeepLinkApplied.current = null; return; }
    if (leaveDeepLinkApplied.current === leaveSearch) return;
    leaveDeepLinkApplied.current = leaveSearch;
    setSection("my-requests");
    setSelectedRequestId(rid);
  }, [leaveSearch]);

  useEffect(() => {
    const rid = new URLSearchParams(leaveSearch || "").get("requestId")?.trim();
    if (!rid || selectedRequestId !== rid) return;
    const t = window.setTimeout(() => {
      document.getElementById(`leave-req-${rid}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [leaveSearch, selectedRequestId, myRequests]);

  const { data: requestDetail } = useQuery<{
    id: string; status: string; type_name: string; color: string; start_date: string; end_date: string; day_type: string; total_days: string; reason: string | null; applied_at: string; decided_at: string | null; decided_by: string | null; decided_by_first_name?: string | null; decided_by_last_name?: string | null; rejection_reason: string | null;
  }>({
    queryKey: ["/api/leave/request", selectedRequestId],
    queryFn: async () => (await apiRequest("GET", `/api/leave/request/${selectedRequestId}`)).json(),
    enabled: !!selectedRequestId && !!employeeId,
  });

  const calendarFrom = useMemo(() => {
    const y = calendarMonth.getFullYear(), m = calendarMonth.getMonth();
    return `${y}-${String(m + 1).padStart(2, "0")}-01`;
  }, [calendarMonth]);
  const calendarTo = useMemo(() => {
    const d = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    return d.toISOString().split("T")[0];
  }, [calendarMonth]);

  const { data: calendarEvents = [] } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/leave/calendar", calendarFrom, calendarTo],
    queryFn: async () => (await apiRequest("GET", `/api/leave/calendar?from=${calendarFrom}&to=${calendarTo}`)).json(),
    enabled: section === "calendar",
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/leave/request/${id}/cancel`); },
    onSuccess: (_data, id) => {
      toast.success("Request cancelled");
      invalidateLeaveAndNotifications(qc);
      if (selectedRequestId === id) setSelectedRequestId(null);
    },
    onError: (err: unknown) => toast.error((err as Error)?.message || "Failed to cancel"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/leave/request/${id}`); },
    onSuccess: () => {
      toast.success("Request deleted");
      setSelectedRequestId(null);
      invalidateLeaveAndNotifications(qc);
    },
    onError: (err: unknown) => toast.error((err as Error)?.message || "Failed to delete"),
  });

  const filteredRequests = useMemo(() =>
    myRequests.filter(r => statusFilter === "all" || r.status === statusFilter),
    [myRequests, statusFilter],
  );

  const pendingCount = myRequests.filter(r => r.status === "pending").length;

  // ── nav items ──
  const navItems: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: "overview",    label: "Overview",    icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: "my-requests", label: "My Requests", icon: <List className="h-4 w-4" /> },
    { id: "calendar",    label: "Team Calendar", icon: <Calendar className="h-4 w-4" /> },
  ];

  // ── section: overview ──
  const overviewSection = (
    <div className="space-y-8">
      {/* Hero greeting */}
      <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white" />
          <div className="absolute right-12 top-16 h-20 w-20 rounded-full bg-white" />
        </div>
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {employeeId && (
              <EmployeeAvatar
                employeeId={employeeId}
                avatarFromList={me?.avatar ?? null}
                fallbackInitials={employeeInitials(firstName, lastName)}
                className="h-14 w-14 rounded-2xl border-2 border-white/40 shrink-0 shadow-md"
                fallbackClassName="text-base bg-white/20 text-white"
              />
            )}
            <div className="min-w-0">
              <h2 className="text-2xl font-bold">
                {firstName ? `Hi ${firstName} 👋` : "Your Leave"}
              </h2>
              <p className="text-primary-foreground/75 text-sm mt-1">
                Track your time off, apply for leave, and check your balances.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="bg-white text-primary hover:bg-white/90 font-semibold gap-2 shadow"
            onClick={() => setApplyOpen(true)}
          >
            <Plus className="h-4 w-4" /> Apply Leave
          </Button>
        </div>

        {/* Inline stat pills */}
        <div className="relative mt-5 flex flex-wrap gap-3">
          {[
            { label: "Pending",            value: stats?.pendingRequests ?? 0,   accent: "bg-white/20" },
            { label: "Approved this month", value: stats?.approvedThisMonth ?? 0, accent: "bg-white/20" },
            { label: "On leave today",      value: stats?.onLeaveToday ?? 0,      accent: "bg-white/20" },
          ].map(s => (
            <div key={s.label} className={cn("flex items-center gap-2 rounded-full px-4 py-1.5 text-sm", s.accent)}>
              <span className="font-bold text-base">{s.value}</span>
              <span className="text-primary-foreground/80">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Balance cards */}
      {myBalances.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">Your Balances</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myBalances.map(b => {
              const isUnpaid = b.paid === false;
              const bal = displayBalance(parseFloat(b.balance ?? "0"));
              const used = displayBalance(parseFloat(b.used ?? "0"));
              const max = b.max_balance ?? 0;
              const pct = !isUnpaid && max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
              const remaining = max > 0 ? max - used : null;

              return (
                <Card key={b.id} className="group relative overflow-hidden border-0 shadow-sm ring-1 ring-border/60 hover:shadow-md transition-shadow">
                  {/* Top color accent bar */}
                  <div className="h-1.5 w-full" style={{ backgroundColor: b.color }} />
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="font-semibold text-sm">{b.type_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{b.policy_name}</p>
                      </div>
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: b.color }}
                      >
                        {b.type_name.charAt(0)}
                      </div>
                    </div>

                    {isUnpaid ? (
                      <div>
                        <p className="text-3xl font-bold text-muted-foreground">∞</p>
                        <p className="text-xs text-muted-foreground mt-1">Unpaid (LWOP) — no balance limit</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-end gap-2 mb-3">
                          <p className="text-3xl font-bold tracking-tight">{formatBalanceDisplay(bal)}</p>
                          {max > 0 && (
                            <p className="text-sm text-muted-foreground mb-1">/ {max} days</p>
                          )}
                        </div>

                        {max > 0 && (
                          <>
                            {/* Progress bar */}
                            <div className="h-2 w-full rounded-full bg-muted overflow-hidden mb-2">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, backgroundColor: b.color }}
                              />
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Used: {formatBalanceDisplay(used)}</span>
                              {remaining !== null && <span>Left: {formatBalanceDisplay(displayBalance(remaining))}</span>}
                            </div>
                          </>
                        )}
                        {max === 0 && (
                          <p className="text-xs text-muted-foreground">Used: {formatBalanceDisplay(used)}</p>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent requests */}
      {myRequests.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Recent Requests</h3>
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => setSection("my-requests")}>
              View all <ArrowRight className="h-3 w-3" />
            </Button>
          </div>

          <div className="space-y-2">
            {myRequests.slice(0, 5).map(r => {
              const sc = STATUS_CONFIG[r.status] || STATUS_CONFIG.cancelled;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setSelectedRequestId(r.id); setSection("my-requests"); }}
                  className="w-full text-left rounded-xl border bg-card hover:bg-muted/40 transition-colors p-4 flex items-center gap-4"
                >
                  {/* Color dot */}
                  <div
                    className="h-10 w-10 rounded-xl shrink-0 flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: r.color }}
                  >
                    {r.type_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{r.type_name}</span>
                      <Badge className={cn("text-[10px] border gap-1 py-0.5", sc.className)}>
                        {sc.icon}{sc.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatLeaveDisplayDate(r.start_date, leaveTz, leaveDf)}
                      {r.start_date !== r.end_date ? ` – ${formatLeaveDisplayDate(r.end_date, leaveTz, leaveDf)}` : ""}
                      {" · "}
                      <strong>{formatLeaveDurationSummary(r.total_days, r.day_type)}</strong>
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {myRequests.length === 0 && myBalances.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center text-muted-foreground">
          <CalendarDays className="h-12 w-12 mb-3 opacity-30" />
          <p className="font-semibold text-foreground">No leave data yet</p>
          <p className="text-sm mt-1">Apply for leave to get started.</p>
          <Button size="sm" className="mt-4 gap-2" onClick={() => setApplyOpen(true)}>
            <Plus className="h-4 w-4" /> Apply Leave
          </Button>
        </div>
      )}
    </div>
  );

  // ── section: my requests ──
  const myRequestsSection = (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">My Requests</h2>
          <p className="text-sm text-muted-foreground mt-0.5">All your leave requests and their status.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-2" onClick={() => setApplyOpen(true)}>
            <Plus className="h-4 w-4" /> Apply
          </Button>
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-muted-foreground">
          <Calendar className="h-12 w-12 mb-3 opacity-30" />
          <p className="font-semibold text-foreground">No requests found</p>
          <p className="text-sm mt-1">
            {statusFilter === "all" ? "Apply for leave to get started." : `No ${statusFilter} requests.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRequests.map(r => {
            const sc = STATUS_CONFIG[r.status] || STATUS_CONFIG.cancelled;
            const isSelected = selectedRequestId === r.id;
            return (
              <button
                key={r.id}
                id={`leave-req-${r.id}`}
                type="button"
                onClick={() => setSelectedRequestId(isSelected ? null : r.id)}
                className={cn(
                  "w-full text-left rounded-xl border transition-all p-4 flex items-center gap-4",
                  isSelected
                    ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                    : "bg-card hover:bg-muted/40",
                )}
              >
                {/* Type icon */}
                <div
                  className="h-11 w-11 rounded-xl shrink-0 flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: r.color }}
                >
                  {r.type_name.charAt(0)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{r.type_name}</span>
                    <Badge className={cn("text-[10px] border gap-1 py-0.5 shrink-0", sc.className)}>
                      {sc.icon}{sc.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatLeaveDisplayDate(r.start_date, leaveTz, leaveDf)}
                    {r.start_date !== r.end_date ? ` – ${formatLeaveDisplayDate(r.end_date, leaveTz, leaveDf)}` : ""}
                    {" · "}
                    <strong>{formatLeaveDurationSummary(r.total_days, r.day_type)}</strong>
                  </p>
                  {r.status === "rejected" && r.rejection_reason && (
                    <p className="text-xs text-red-600 mt-1 truncate max-w-sm">
                      Reason: {r.rejection_reason}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {r.status === "pending" && (
                    <button
                      type="button"
                      className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                      onClick={(e) => { e.stopPropagation(); cancelMutation.mutate(r.id); }}
                      disabled={cancelMutation.isPending}
                    >
                      Cancel
                    </button>
                  )}
                  <p className="text-[11px] text-muted-foreground hidden sm:block">{formatAppliedAtForEmployee(r.applied_at, null, null, leaveTz, leaveDf)}</p>
                  <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", isSelected && "rotate-90")} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── section: calendar ──
  const calendarSection = (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Team Calendar</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Approved leave for the whole team.</p>
      </div>

      {/* Balance pills */}
      {myBalances.some(b => b.paid) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Your balances:</span>
          {myBalances.filter(b => b.paid).map(b => (
            <span
              key={b.id}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border"
              style={{ borderColor: `${b.color}40`, backgroundColor: `${b.color}10`, color: b.color }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: b.color }} />
              {b.type_name}
              <strong className="text-foreground">{formatBalanceDisplay(displayBalance(parseFloat(b.balance ?? "0")))}</strong>
            </span>
          ))}
        </div>
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline" size="icon" className="h-9 w-9 rounded-xl"
          onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <p className="font-bold text-base">{calendarMonth.toLocaleString("default", { month: "long" })}</p>
          <p className="text-xs text-muted-foreground">{calendarMonth.getFullYear()}</p>
        </div>
        <Button
          variant="outline" size="icon" className="h-9 w-9 rounded-xl"
          onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Calendar grid */}
      <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-border/60">
        <CardContent className="p-0">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => (
              <div key={day} className="p-2.5 text-center text-xs font-semibold text-muted-foreground bg-muted/40">
                {day}
              </div>
            ))}
          </div>
          {/* Days */}
          <div className="grid grid-cols-7">
            {(() => {
              const y = calendarMonth.getFullYear(), m = calendarMonth.getMonth();
              const first = new Date(y, m, 1);
              const last = new Date(y, m + 1, 0);
              const startPad = (first.getDay() + 6) % 7;
              const daysInMonth = last.getDate();
              const todayStr = new Date().toISOString().split("T")[0];
              const cells: React.ReactNode[] = [];

              for (let i = 0; i < 42; i++) {
                if (i < startPad || i >= startPad + daysInMonth) {
                  cells.push(
                    <div key={`e-${i}`} className="min-h-[80px] bg-muted/20 border-b border-r border-border/30 p-1.5" />
                  );
                } else {
                  const d = i - startPad + 1;
                  const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const evs = calendarEvents.filter(ev => ev.start_date <= dateStr && ev.end_date >= dateStr);
                  const isToday = dateStr === todayStr;
                  cells.push(
                    <div key={`d-${i}`} className="min-h-[80px] bg-background border-b border-r border-border/30 p-1.5">
                      <div className="flex justify-end mb-1">
                        <span className={cn(
                          "text-xs font-semibold h-6 w-6 flex items-center justify-center rounded-full",
                          isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                        )}>
                          {d}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {evs.slice(0, 2).map(ev => (
                          <button
                            type="button"
                            key={`${dateStr}-${ev.id}`}
                            className="w-full text-left text-[10px] truncate rounded-md px-1.5 py-0.5 font-medium transition-opacity hover:opacity-80 flex items-center gap-1"
                            style={{ backgroundColor: `${ev.color}20`, color: ev.color, borderLeft: `2px solid ${ev.color}` }}
                            title={`${ev.first_name} ${ev.last_name} — ${ev.type_name}`}
                            onClick={() => ev.id && setSelectedRequestId(ev.id)}
                          >
                            <EmployeeAvatar
                              employeeId={ev.employee_id}
                              avatarFromList={ev.avatar}
                              fallbackInitials={employeeInitials(ev.first_name, ev.last_name)}
                              className="h-4 w-4 rounded-sm shrink-0"
                              fallbackClassName="text-[8px]"
                            />
                            <span className="truncate">{ev.first_name} {ev.last_name?.charAt(0)}.</span>
                          </button>
                        ))}
                        {evs.length > 2 && (
                          <p className="text-[10px] text-muted-foreground pl-1">+{evs.length - 2} more</p>
                        )}
                      </div>
                    </div>
                  );
                }
              }
              return cells;
            })()}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const sectionContent: Record<Section, React.ReactNode> = {
    "overview":    overviewSection,
    "my-requests": myRequestsSection,
    "calendar":    calendarSection,
  };

  return (
    <Layout>
      <div className="flex h-full min-h-[calc(100vh-80px)] gap-0">
        {/* ── Left Sidebar ── */}
        <aside className="w-60 shrink-0 border-r bg-muted/20 flex flex-col">
          <div className="p-4 border-b space-y-3">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Time Off</p>
            <Button className="w-full gap-2 rounded-xl" size="sm" onClick={() => setApplyOpen(true)}>
              <Plus className="h-4 w-4" /> Apply Leave
            </Button>
          </div>

          <nav className="flex-1 p-3 space-y-0.5">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all text-left relative",
                  section === item.id
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.icon}
                {item.label}
                {item.id === "my-requests" && pendingCount > 0 && (
                  <span className={cn(
                    "ml-auto text-[10px] font-bold rounded-full h-4.5 min-w-[18px] px-1 flex items-center justify-center",
                    section === item.id ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700",
                  )}>
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Balance summary in sidebar */}
          {myBalances.filter(b => b.paid).length > 0 && (
            <div className="p-3 border-t space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Balances</p>
              {myBalances.filter(b => b.paid).map(b => {
                const bal = displayBalance(parseFloat(b.balance ?? "0"));
                return (
                  <div key={b.id} className="flex items-center gap-2 px-1 py-0.5">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                    <span className="text-xs text-muted-foreground truncate flex-1">{b.type_name}</span>
                    <span className="text-xs font-bold">{formatBalanceDisplay(bal)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {isAdminUser && (
            <div className="p-3 border-t">
              <Button
                variant="outline" size="sm" className="w-full gap-2 text-xs rounded-xl"
                onClick={() => setLocation("/leave/admin")}
              >
                <Settings className="h-3.5 w-3.5" /> Admin View
              </Button>
            </div>
          )}
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-auto p-6 max-w-4xl">
          {sectionContent[section]}
        </main>
      </div>

      <ApplyLeaveDialog open={applyOpen} onClose={() => setApplyOpen(false)} employeeId={employeeId} />

      {/* ── Request detail dialog ── */}
      <Dialog
        open={!!selectedRequestId}
        onOpenChange={(open) => {
          if (open) return;
          setSelectedRequestId(null);
          const qs = new URLSearchParams(leaveSearch || "");
          if (qs.has("requestId")) {
            qs.delete("requestId");
            const next = qs.toString();
            setLocation(next ? `/leave/employee?${next}` : "/leave/employee");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Time Off Request</DialogTitle>
          </DialogHeader>

          {requestDetail ? (
            <div className="space-y-5">
              {/* Status + type hero */}
              <div
                className="rounded-2xl p-5 flex items-center gap-4"
                style={{ backgroundColor: `${requestDetail.color}12` }}
              >
                <div
                  className="h-14 w-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold shrink-0"
                  style={{ backgroundColor: requestDetail.color }}
                >
                  {requestDetail.type_name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold">{requestDetail.type_name}</span>
                    {(() => {
                      const sc = STATUS_CONFIG[requestDetail.status] || STATUS_CONFIG.cancelled;
                      return (
                        <Badge className={cn("text-[10px] border gap-1 py-0.5", sc.className)}>
                          {sc.icon}{sc.label}
                        </Badge>
                      );
                    })()}
                  </div>
                  <p className="text-2xl font-bold">
                    {formatLeaveDurationSummary(requestDetail.total_days, requestDetail.day_type)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {formatLeaveDisplayDate(requestDetail.start_date, leaveTz, leaveDf)}
                    {requestDetail.start_date !== requestDetail.end_date
                      ? ` – ${formatLeaveDisplayDate(requestDetail.end_date, leaveTz, leaveDf)}`
                      : ""}
                  </p>
                </div>
              </div>

              {/* Reason */}
              {requestDetail.reason && (
                <div className="rounded-xl border bg-muted/30 px-4 py-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Note / Reason</p>
                  <p className="text-sm">{requestDetail.reason}</p>
                </div>
              )}

              {/* Timeline */}
              <div className="space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Timeline</p>

                {/* Applied */}
                <div className="flex gap-3 items-start">
                  <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <CalendarDays className="h-3.5 w-3.5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Applied</p>
                    <p className="text-xs text-muted-foreground">{formatAppliedAtForEmployee(requestDetail.applied_at, null, null, leaveTz, leaveDf)}</p>
                  </div>
                </div>

                {/* Decision */}
                {requestDetail.status === "approved" && requestDetail.decided_at && (
                  <div className="flex gap-3 items-start">
                    <div className="h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Approved</p>
                      <p className="text-xs text-muted-foreground">
                        {requestDetail.decided_by === "auto"
                          ? `Auto-approved on ${fmtDateTime(requestDetail.decided_at, leaveTz, leaveDf)}`
                          : `By ${[requestDetail.decided_by_first_name, requestDetail.decided_by_last_name].filter(Boolean).join(" ") || "—"} · ${fmtDateTime(requestDetail.decided_at, leaveTz, leaveDf)}`}
                      </p>
                    </div>
                  </div>
                )}

                {requestDetail.status === "rejected" && requestDetail.decided_at && (
                  <div className="flex gap-3 items-start">
                    <div className="h-7 w-7 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                      <XCircle className="h-3.5 w-3.5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Rejected</p>
                      <p className="text-xs text-muted-foreground">
                        By {[requestDetail.decided_by_first_name, requestDetail.decided_by_last_name].filter(Boolean).join(" ") || "—"} · {fmtDateTime(requestDetail.decided_at, leaveTz, leaveDf)}
                      </p>
                      {requestDetail.rejection_reason && (
                        <p className="text-xs text-red-600 mt-1 bg-red-50 rounded-lg px-3 py-1.5">{requestDetail.rejection_reason}</p>
                      )}
                    </div>
                  </div>
                )}

                {requestDetail.status === "pending" && (
                  <div className="flex gap-3 items-start">
                    <div className="h-7 w-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Clock className="h-3.5 w-3.5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Awaiting decision</p>
                      <p className="text-xs text-muted-foreground">Your manager will review this request.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              {(requestDetail.status === "pending" || isAdminUser) && (
                <div className="flex justify-end gap-2 pt-2 border-t">
                  {requestDetail.status === "pending" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                      disabled={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate(requestDetail.id)}
                    >
                      <Ban className="h-3.5 w-3.5" />
                      {cancelMutation.isPending ? "Cancelling…" : "Cancel Request"}
                    </Button>
                  )}
                  {isAdminUser && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1.5"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm("Permanently delete this leave request? This cannot be undone.")) {
                          deleteMutation.mutate(requestDetail.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deleteMutation.isPending ? "Deleting…" : "Delete"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

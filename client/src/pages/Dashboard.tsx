import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Users, Clock, CheckCircle, XCircle, AlertTriangle, Laptop,
  ArrowRight, UserPlus, LogOut, Play, Square, Calendar,
  TrendingUp, TrendingDown, Briefcase, UserCheck, FileText,
  Activity, Bell, Info, AlertCircle, ChevronRight, RefreshCw,
  ClipboardList, Eye, Gift, PartyPopper, CalendarDays, ExternalLink,
  Timer, Zap, DollarSign, Banknote,
} from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { invalidateLeaveAndNotifications } from "@/lib/leaveQueryInvalidation";
import { formatDateOnly, formatDateTimeDisplay, formatLeaveDisplayDate, formatTimeOnlyDisplay } from "@/lib/dateUtils";
import {
  QUERY_KEY_ATTENDANCE_TODAY,
  unwrapAttendanceResponse,
  postCheckInAndPrimeCache,
  postCheckOutAndPrimeCache,
} from "@/lib/attendanceClock";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { sortLeaveBalancesByDisplayOrder } from "@/lib/leaveBalanceOrder";
import { formatEmployeeDisplayName } from "@shared/employeeDisplayName";
import { formatLeaveDurationSummary } from "@shared/leaveDayType";
import {
  formatLoanAmount,
  formatAmountsByCurrency,
  sumAmountsByCurrency,
} from "@shared/loanCurrency";

/** Leave balance on cards: only .5 or whole days (same as Leave / profile). */
function displayLeaveBalanceDays(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n * 2) / 2;
}
function formatLeaveBalanceDays(n: number): string {
  const x = displayLeaveBalanceDays(n);
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

function dashEmpName(e: { first_name: string; last_name: string; nickname?: string | null }) {
  return formatEmployeeDisplayName(e.first_name, e.last_name, e.nickname);
}

// ==================== TYPES ====================

interface DashboardData {
  role: string;
  error?: string;
  employee?: { id: string; first_name: string; last_name: string; nickname?: string | null; employment_status: string; employee_id: string; job_title: string; department: string; avatar: string | null; join_date: string };
  attendance?: { checkedIn: boolean; checkedOut: boolean; status: string | null; checkInTime: string | null; checkOutTime: string | null };
  leaveBalances?: { balance: string; used: string; type_name: string; max_balance: number; color: string }[];
  pendingLeaveRequests?: { id: string; start_date: string; end_date: string; total_days: string; status: string; type_name: string; color: string }[];
  assets?: { id: string; system_type: string; system_name: string; serial_number: string; status: string }[];
  onboarding?: { id: string; taskCount: number; completedCount: number } | null;
  teamSize?: number;
  teamOnLeave?: { id: string; first_name: string; last_name: string; nickname?: string | null; avatar: string | null; type_name: string; color: string }[];
  pendingApprovals?: any[];
  absentToday?: { id: string; first_name: string; last_name: string; nickname?: string | null; avatar: string | null; department: string }[];
  inNotice?: { id: string; first_name: string; last_name: string; nickname?: string | null; avatar: string | null; offboarding_type: string; last_working_date: string }[];
  headcount?: number;
  joinersToday?: number;
  leaversToday?: number;
  pendingOnboarding?: any[];
  tentativePending?: any[];
  offboardingPending?: any[];
  interviewStage?: any[];
  risks?: { noManager: number; noLeavePolicy: number; stuckTentative: number; offboardingNoAssetReturn: number };
  myData?: DashboardData | null;
  attritionThisMonth?: number;
  joinersThisMonth?: number;
  leaversThisMonth?: number;
  departmentBreakdown?: { department: string; count: number }[];
  attendanceToday?: { present: number; total: number; percentage: number };
  hr?: Partial<DashboardData>;
  activityFeed?: { type: string; message: string; timestamp: string; severity: string; color?: string; link?: string }[];
  upcomingTimeOff?: { id: string; start_date: string; end_date: string; total_days: string; type_name: string; color: string }[];
  birthdaysNext7?: { id: string; first_name: string; last_name: string; nickname?: string | null; job_title: string; department: string; avatar: string | null; dob: string }[];
  anniversariesNext7?: { id: string; first_name: string; last_name: string; nickname?: string | null; job_title: string; department: string; avatar: string | null; join_date: string }[];
  newHires?: { id: string; first_name: string; last_name: string; nickname?: string | null; job_title: string; department: string; avatar: string | null; join_date: string }[];
}

export interface ProbationAlert {
  id: string;
  name: string;
  probation_end_date: string | null;
  days_left: number;
}

function mapTodayRowToAttendance(row: Record<string, unknown> | null): NonNullable<DashboardData["attendance"]> {
  if (!row) return { checkedIn: false, checkedOut: false, status: null, checkInTime: null, checkOutTime: null };
  return {
    checkedIn: !!row.check_in_time,
    checkedOut: !!row.check_out_time,
    status: (row.status as string) ?? null,
    checkInTime: (row.check_in_time as string) ?? null,
    checkOutTime: (row.check_out_time as string) ?? null,
  };
}

// ==================== STATIC DATA ====================
// (UPCOMING_HOLIDAYS removed — now fetched live from /api/leave/holidays)

// ==================== SHARED UTILS ====================

function formatDate(d: string | null, tz?: string | null, df?: string | null): string {
  if (!d) return "-";
  return formatLeaveDisplayDate(d, tz ?? null, df ?? null);
}

function formatTime(d: string | null, tz?: string | null): string {
  return formatTimeOnlyDisplay(d, tz);
}

function formatProbationDate(dateStr: string | null, tz?: string | null, df?: string | null): string {
  if (!dateStr) return "";
  return formatLeaveDisplayDate(dateStr, tz ?? null, df ?? null);
}

// ==================== SHARED COMPONENTS ====================

function StatCard({ title, value, icon: Icon, color, subtext, link }: {
  title: string; value: string | number; icon: any; color: string; subtext?: string; link?: string;
}) {
  const card = (
    <Card
      className={cn(
        "h-full min-h-[100px] w-full min-w-0 hover:shadow-md transition-shadow",
        link && "cursor-pointer"
      )}
    >
      <CardContent className="p-4 flex h-full min-h-[inherit] items-stretch gap-3">
        <div className={`h-10 w-10 rounded-lg flex shrink-0 items-center justify-center self-start ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <p className="text-xl font-bold leading-none tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{title}</p>
          {subtext ? <p className="text-[10px] text-muted-foreground mt-0.5">{subtext}</p> : null}
        </div>
        {/* Fixed slot so linked vs non-linked cards stay same width */}
        <div className="flex h-4 w-4 shrink-0 items-center justify-center self-center text-muted-foreground">
          {link ? <ChevronRight className="h-4 w-4" /> : null}
        </div>
      </CardContent>
    </Card>
  );
  if (link) {
    return (
      <Link href={link} className="block h-full min-h-0 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl">
        {card}
      </Link>
    );
  }
  return <div className="h-full min-h-0 min-w-0">{card}</div>;
}

function PersonChip({ name, subtitle, avatar, link, employeeId }: { name: string; subtitle?: string; avatar?: string | null; link?: string; employeeId?: string }) {
  const avatarSrc = employeeId ? `/api/employees/${employeeId}/avatar` : (avatar || null);
  const content = (
    <div className="flex items-center gap-2.5 py-1.5 rounded-lg hover:bg-muted/50 px-1 transition-colors">
      <Avatar className="h-8 w-8 shrink-0">
        {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
        <AvatarFallback className="text-[10px] font-medium">{name.split(" ").map(n => n[0]).join("")}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate leading-snug">{name}</p>
        {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
      </div>
    </div>
  );
  return link ? <Link href={link}>{content}</Link> : content;
}

function ProbationAlertsCard({ alerts }: { alerts: ProbationAlert[] }) {
  const { user } = useAuth();
  if (alerts.length === 0) return null;
  const severityStyle = (daysLeft: number) => {
    if (daysLeft <= 1) return "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200";
    if (daysLeft <= 3) return "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-950/40 dark:border-orange-800 dark:text-orange-200";
    return "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200";
  };
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> Probation Ending Soon
          <Badge variant="outline" className="ml-auto border-amber-300 text-amber-700">{alerts.length}</Badge>
        </CardTitle>
        <CardDescription className="text-xs">Probation ends in the next 7 days</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <ScrollArea className="max-h-[200px]">
          <div className="space-y-1.5">
            {alerts.map((a) => (
              <Link key={a.id} href={`/employees/${a.id}`}>
                <div className={`flex items-center justify-between p-2.5 rounded-lg border ${severityStyle(a.days_left)} hover:opacity-90 transition-opacity`}>
                  <div>
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-xs opacity-90">Ends {formatProbationDate(a.probation_end_date, user?.timeZone ?? null, user?.dateFormat ?? null)} · {a.days_left}d left</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
                </div>
              </Link>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

/** Leave approval queue with Approve / Reject (same API as Leave → Approvals). Shown for reporting managers and HR/admin. */
function PendingLeaveApprovalsCard({ data }: { data: DashboardData }) {
  const approvals = data.pendingApprovals ?? [];
  const { user } = useAuth();
  const qc = useQueryClient();
  const employeeId = user?.employeeId ?? null;
  const roleLower = (user?.effectiveRole ?? user?.role ?? "employee").toString().toLowerCase();
  const rolesArr = (user?.roles ?? []).map((r) => String(r).toLowerCase());
  const canHrOverride =
    roleLower === "hr" ||
    roleLower === "admin" ||
    rolesArr.includes("hr") ||
    rolesArr.includes("admin");
  const [hrOverridePick, setHrOverridePick] = useState<Record<string, boolean>>({});

  const mutation = useMutation({
    mutationFn: async (payload: {
      approvalId: string;
      action: "approve" | "reject";
      remarks?: string;
      hrOverride?: boolean;
    }) => {
      await apiRequest("POST", `/api/leave/${payload.action}/${payload.approvalId}`, {
        remarks: payload.remarks,
        hrOverride: payload.hrOverride === true ? true : undefined,
      });
    },
    onSuccess: () => {
      toast.success("Updated");
      invalidateLeaveAndNotifications(qc);
    },
    onError: (err: Error & { message?: string }) => toast.error(err?.message || "Action failed"),
  });

  if (approvals.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-orange-500" /> Pending leave approvals
          <Badge variant="outline" className="ml-auto border-orange-200 text-orange-600">{approvals.length}</Badge>
        </CardTitle>
        <CardDescription className="text-xs">Approve or reject without leaving the dashboard. Same queue as Leave → Approvals.</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-2">
        <ScrollArea className="max-h-[340px] pr-3">
          <div className="space-y-2">
            {approvals.map((a: Record<string, unknown>) => {
              const id = String(a.id ?? "");
              const stepLabel =
                a.approver_role === "manager"
                  ? "Manager"
                  : a.approver_role === "hr" || a.approver_role === "admin"
                    ? "HR"
                    : "Approval";
              const needsPriorHrOverride =
                !!canHrOverride &&
                !!a.has_prior_pending &&
                (a.approver_role === "hr" || a.approver_role === "admin");
              const approveDisabled =
                mutation.isPending || (needsPriorHrOverride && hrOverridePick[id] !== true);
              const buildHrOverride = (): boolean | undefined => {
                if (!canHrOverride || !(a.approver_role === "hr" || a.approver_role === "admin")) return undefined;
                if (a.has_prior_pending) return hrOverridePick[id] === true ? true : undefined;
                if (String(a.approver_id ?? "") !== String(employeeId ?? "")) return true;
                return undefined;
              };
              return (
                <div
                  key={id}
                  className="flex flex-col gap-2 p-2.5 rounded-lg border bg-muted/20 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-[10px]">
                        {String(a.first_name ?? "").charAt(0)}
                        {String(a.last_name ?? "").charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {dashEmpName({ first_name: String(a.first_name ?? ""), last_name: String(a.last_name ?? ""), nickname: (a as { nickname?: string | null }).nickname })}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                        <Badge variant="outline" className="text-[10px]" style={{ borderColor: String(a.color ?? ""), color: String(a.color ?? "") }}>
                          {String(a.type_name ?? "Leave")}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDate(String(a.start_date ?? ""), user?.timeZone ?? null, user?.dateFormat ?? null)} –{" "}
                          {formatDate(String(a.end_date ?? ""), user?.timeZone ?? null, user?.dateFormat ?? null)}
                          {" · "}
                          {formatLeaveDurationSummary(a.total_days, a.day_type)}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {stepLabel} step
                        {a.has_prior_pending ? " · earlier step(s) still open" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0 sm:items-end">
                    {needsPriorHrOverride && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`hr-ov-${id}`}
                          checked={hrOverridePick[id] === true}
                          onCheckedChange={(v) =>
                            setHrOverridePick((p) => ({ ...p, [id]: v === true }))
                          }
                        />
                        <Label htmlFor={`hr-ov-${id}`} className="text-xs font-normal cursor-pointer leading-tight">
                          HR override (advance past pending manager step)
                        </Label>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      <Button
                        size="sm"
                        className="h-8"
                        disabled={approveDisabled}
                        onClick={() =>
                          mutation.mutate({
                            approvalId: id,
                            action: "approve",
                            hrOverride: buildHrOverride(),
                          })
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={mutation.isPending}
                        onClick={() => {
                          const remarks = window.prompt("Optional rejection note:") ?? "";
                          mutation.mutate({
                            approvalId: id,
                            action: "reject",
                            remarks: remarks.trim() || undefined,
                            hrOverride: buildHrOverride(),
                          });
                        }}
                      >
                        Reject
                      </Button>
                      <Link href={`/leave/admin?requestId=${encodeURIComponent(String(a.leave_request_id ?? ""))}`}>
                        <Button size="sm" variant="ghost" className="h-8 gap-1">
                          <Eye className="h-3 w-3" /> Details
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        <Link href="/leave" className="text-xs text-primary hover:underline inline-flex items-center gap-1 pt-1">
          Open full leave queue <ArrowRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

function ActivityFeed({ events }: { events: DashboardData["activityFeed"] }) {
  const { user } = useAuth();
  const severityIcon: Record<string, any> = { info: Info, warning: AlertTriangle, critical: AlertCircle };
  const severityColor: Record<string, string> = { info: "text-blue-500", warning: "text-yellow-600", critical: "text-red-600" };
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {(!events || events.length === 0) ? (
          <p className="text-sm text-muted-foreground text-center py-4">No recent activity.</p>
        ) : (
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-0">
              {events.map((ev, i) => {
                const SevIcon = severityIcon[ev.severity] || Info;
                return (
                  <div key={i}>
                    {i > 0 && <Separator className="my-1" />}
                    <div className="flex items-start gap-2.5 py-1.5">
                      <SevIcon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${severityColor[ev.severity] || "text-muted-foreground"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-snug">{ev.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDateTimeDisplay(ev.timestamp, user?.timeZone ?? null, user?.dateFormat ?? null)}
                        </p>
                      </div>
                      {ev.link && <Link href={ev.link}><ChevronRight className="h-3 w-3 text-muted-foreground mt-1 shrink-0" /></Link>}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// ==================== ATTENDANCE TABLE (HR/Admin) ====================

interface DailyAttendanceRecord {
  employee_id: string; first_name: string; last_name: string; nickname?: string | null;
  department: string | null; emp_code: string | null;
  status: string; check_in_time: string | null; check_out_time: string | null; remarks: string | null;
}

function compareDailyAttendanceByDepartment(
  a: DailyAttendanceRecord,
  b: DailyAttendanceRecord,
): number {
  const dept = (r: DailyAttendanceRecord) => (r.department ?? "").trim().toLowerCase() || "\uffff";
  const cmpDept = dept(a).localeCompare(dept(b));
  if (cmpDept !== 0) return cmpDept;
  const hasIn = (r: DailyAttendanceRecord) => (r.check_in_time ? 1 : 0);
  if (hasIn(b) !== hasIn(a)) return hasIn(b) - hasIn(a);
  const name = (r: DailyAttendanceRecord) => `${r.last_name ?? ""} ${r.first_name ?? ""}`.trim().toLowerCase();
  return name(a).localeCompare(name(b));
}

function attendanceStatusBadge(status: string, remarks: string | null) {
  const isOnLeave = remarks?.toLowerCase().includes("on leave");
  const cfg: Record<string, { label: string; className: string }> = {
    present: { label: "Present", className: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:border-green-800 dark:text-green-200" },
    late: { label: "Late", className: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200" },
    half_day: { label: "Half Day", className: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:border-orange-800 dark:text-orange-200" },
    absent: { label: isOnLeave ? "On Leave" : "Absent", className: isOnLeave ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-200" : "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200" },
  };
  const c = cfg[status] || { label: status, className: "" };
  return <Badge variant="outline" className={`text-xs ${c.className}`}>{c.label}</Badge>;
}

function AttendanceRecordWidget() {
  const { user } = useAuth();
  const { data: timesheetPolicy } = useQuery({
    queryKey: ["/api/attendance/timesheet-policy"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/attendance/timesheet-policy");
      return r.json();
    },
    staleTime: 60_000,
  });
  const attendanceDisplayTz =
    ((timesheetPolicy?.policyTimezone ?? "").trim() || user?.timeZone) ?? null;
  const todayInTz = useMemo(() => {
    const now = new Date();
    const tz = user?.timeZone;
    if (!tz) return now.toISOString().split("T")[0];
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const y = p.find((x) => x.type === "year")?.value;
    const m = p.find((x) => x.type === "month")?.value;
    const d = p.find((x) => x.type === "day")?.value;
    return `${y}-${m}-${d}`;
  }, [user?.timeZone]);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const tzFilledRef = useRef(false);
  useEffect(() => {
    if (user?.timeZone && !tzFilledRef.current) { tzFilledRef.current = true; setSelectedDate(todayInTz); }
  }, [user?.timeZone, todayInTz]);

  const { data, isLoading } = useQuery<{ date: string; records: DailyAttendanceRecord[] }>({
    queryKey: ["/api/attendance/daily-summary", selectedDate],
    queryFn: async () => {
      const res = await fetch(`/api/attendance/daily-summary?date=${selectedDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 30_000,
  });

  const records = data?.records ?? [];
  const sortedRecords = useMemo(
    () => [...records].sort(compareDailyAttendanceByDepartment),
    [records],
  );
  const presentCount = records.filter((r) => r.status === "present").length;
  const lateCount = records.filter((r) => r.status === "late").length;
  const absentCount = records.filter((r) => r.status === "absent" && !r.remarks?.toLowerCase().includes("on leave")).length;
  const onLeaveCount = records.filter((r) => r.remarks?.toLowerCase().includes("on leave")).length;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2"><Timer className="h-4 w-4" /> Attendance Today</CardTitle>
          <div className="flex items-center gap-2">
            <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-[140px] h-8 text-xs" />
            <Link href="/timesheets?tab=report"><Button variant="outline" size="sm" className="h-8 text-xs gap-1">View All <ChevronRight className="h-3 w-3" /></Button></Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 pt-1 text-xs">
          <span className="text-green-600 dark:text-green-400 font-medium">{presentCount} Present</span>
          <span className="text-amber-600 dark:text-amber-400 font-medium">{lateCount} Late</span>
          <span className="text-blue-600 dark:text-blue-400 font-medium">{onLeaveCount} On Leave</span>
          <span className="text-red-600 dark:text-red-400 font-medium">{absentCount} Absent</span>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
        ) : records.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No active employees.</p>
        ) : (
          <div className="max-h-[min(75vh,40rem)] overflow-x-auto overflow-y-auto rounded-md border overscroll-contain">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                <tr className="border-b">
                  <th className="text-left p-2 font-medium text-xs">Emp ID</th>
                  <th className="text-left p-2 font-medium text-xs">Name</th>
                  <th className="text-left p-2 font-medium text-xs">Date</th>
                  <th className="text-left p-2 font-medium text-xs">In</th>
                  <th className="text-left p-2 font-medium text-xs">Out</th>
                  <th className="text-left p-2 font-medium text-xs">Dept.</th>
                  <th className="text-left p-2 font-medium text-xs">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedRecords.map((r) => (
                  <tr key={r.employee_id} className="border-b hover:bg-muted/30">
                    <td className="p-2 font-mono text-muted-foreground text-xs">{r.emp_code || "—"}</td>
                    <td className="p-2">
                      <Link href={`/employees/${r.employee_id}`} className="font-medium hover:underline text-xs">
                        {dashEmpName(r)}
                      </Link>
                    </td>
                    <td className="p-2 text-muted-foreground text-xs">
                      {formatLeaveDisplayDate(selectedDate, user?.timeZone ?? null, user?.dateFormat ?? null)}
                    </td>
                    <td className="p-2 font-mono text-xs">{formatTime(r.check_in_time, attendanceDisplayTz)}</td>
                    <td className="p-2 font-mono text-xs">{formatTime(r.check_out_time, attendanceDisplayTz)}</td>
                    <td className="p-2 text-muted-foreground text-xs">{r.department || "—"}</td>
                    <td className="p-2">{attendanceStatusBadge(r.status, r.remarks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ==================== PEOPLE SIDEBAR (shared across roles) ====================

function PeopleSidebar({ data }: { data: DashboardData }) {
  const { user } = useAuth();
  const birthdays = data.birthdaysNext7 || [];
  const anniversaries = data.anniversariesNext7 || [];
  const newHires = data.newHires || [];

  // Live holidays from Leave Settings — replaces the old hardcoded array
  const { data: allHolidays = [] } = useQuery<{ id: string; date: string; name: string }[]>({
    queryKey: ["/api/leave/holidays"],
  });
  const todayYmd = new Date().toISOString().slice(0, 10);
  const upcomingHolidays = allHolidays
    .filter((h) => h.date >= todayYmd)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Upcoming Holidays */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-amber-500" /> Upcoming Holidays
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 space-y-1.5">
          {upcomingHolidays.length === 0 ? (
            <p className="text-xs text-muted-foreground">No upcoming holidays.</p>
          ) : (
            upcomingHolidays.map((h) => (
              <div key={h.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate">{h.name}</span>
                <span className="font-medium shrink-0 ml-2">{formatLeaveDisplayDate(h.date, user?.timeZone ?? null, user?.dateFormat ?? null)}</span>
              </div>
            ))
          )}
          <Link href="/leave" className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
            View Calendar <ExternalLink className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>

      {/* Birthday Buddies */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <PartyPopper className="h-4 w-4 text-pink-500" /> Birthdays
            {birthdays.length > 0 && <Badge variant="outline" className="ml-auto border-pink-200 text-pink-600">{birthdays.length} this week</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {birthdays.length === 0 ? (
            <p className="text-xs text-muted-foreground">No birthdays in the next 7 days.</p>
          ) : (
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-0.5">
                {birthdays.map((e) => {
                  const dobIso = e.dob ? (typeof e.dob === "string" ? e.dob : (e.dob as any).toISOString?.()).slice(0, 10) : null;
                  const [, dobM, dobD] = dobIso ? dobIso.split("-").map(Number) : [0, 0, 0];
                  const thisYearBday = dobIso ? new Date(new Date().getFullYear(), dobM - 1, dobD) : null;
                  const bdayYmd = dobIso ? `${new Date().getFullYear()}-${String(dobM).padStart(2, "0")}-${String(dobD).padStart(2, "0")}` : null;
                  const bdayStr = bdayYmd ? formatLeaveDisplayDate(bdayYmd, user?.timeZone ?? null, user?.dateFormat ?? null) : "";
                  return (
                    <Link key={e.id} href={`/employees/${e.id}`}>
                      <div className="flex items-center gap-2.5 py-1.5 rounded-lg hover:bg-muted/50 px-1 transition-colors">
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage src={`/api/employees/${e.id}/avatar`} alt="" />
                          <AvatarFallback className="text-[10px] font-medium">{e.first_name[0]}{e.last_name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{dashEmpName(e)}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{e.job_title}</p>
                        </div>
                        {bdayStr && <span className="text-[10px] text-pink-600 dark:text-pink-400 font-medium shrink-0">{bdayStr}</span>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Work Anniversaries */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gift className="h-4 w-4 text-purple-500" /> Anniversaries
            {anniversaries.length > 0 && <Badge variant="outline" className="ml-auto border-purple-200 text-purple-600">{anniversaries.length} this week</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {anniversaries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No anniversaries in the next 7 days.</p>
          ) : (
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-0.5">
                {anniversaries.map((e) => (
                  <PersonChip key={e.id} employeeId={e.id} name={dashEmpName(e)} subtitle={`${e.job_title} · ${formatDateOnly(e.join_date, user?.dateFormat ?? null) ?? "-"}`} avatar={e.avatar} link={`/employees/${e.id}`} />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* New Hires */}
      {newHires.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-green-500" /> New Hires
              <Badge variant="outline" className="ml-auto border-green-200 text-green-600">{newHires.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-0.5">
                {newHires.map((e) => (
                  <PersonChip key={e.id} employeeId={e.id} name={dashEmpName(e)} subtitle={`${e.job_title} · Joined ${formatDateOnly(e.join_date, user?.dateFormat ?? null) ?? "-"}`} avatar={e.avatar} link={`/employees/${e.id}`} />
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== DASHBOARD HEADER ====================

function DashboardHeader({ data, role, onCheckIn, onCheckOut, checkingIn, probationAlerts }: {
  data: DashboardData; role: string; onCheckIn?: () => void; onCheckOut?: () => void; checkingIn?: boolean; probationAlerts?: ProbationAlert[];
}) {
  const { user } = useAuth();
  const { data: timesheetPolicy } = useQuery({
    queryKey: ["/api/attendance/timesheet-policy"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/attendance/timesheet-policy");
      return r.json();
    },
    staleTime: 60_000,
  });
  /** Same as Timesheets: org policy TZ for attendance wall times, then branch. */
  const attendanceDisplayTz =
    ((timesheetPolicy?.policyTimezone ?? "").trim() || user?.timeZone) ?? null;
  const tz = attendanceDisplayTz ?? undefined;
  const [clockNow, setClockNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClockNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const now = clockNow;
  const opts = tz ? { timeZone: tz } : {};
  const hour = tz
    ? Number(new Intl.DateTimeFormat("en-GB", { ...opts, hour: "numeric", hour12: false }).format(now))
    : now.getHours();
  const period = hour < 5 ? "Night" : hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : hour < 21 ? "Evening" : "Night";
  const rawFirst = data.employee?.first_name || "there";
  const firstName = rawFirst ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase() : "there";
  const dayName = new Intl.DateTimeFormat("en-GB", { ...opts, weekday: "long" }).format(now);
  const dateStr = new Intl.DateTimeFormat("en-GB", { ...opts, day: "numeric", month: "short" }).format(now);

  const { data: todayJson } = useQuery({
    queryKey: QUERY_KEY_ATTENDANCE_TODAY,
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/attendance/today");
      return r.json();
    },
    enabled: !!user?.employeeId,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const att = useMemo(() => {
    if (!user?.employeeId) return null;
    if (todayJson !== undefined) {
      const row =
        todayJson == null
          ? null
          : unwrapAttendanceResponse(todayJson) ?? (todayJson as Record<string, unknown>);
      return mapTodayRowToAttendance(row);
    }
    return data.attendance ?? mapTodayRowToAttendance(null);
  }, [user?.employeeId, todayJson, data.attendance]);

  const isClockedIn = !!att?.checkInTime && !att?.checkOutTime;
  const isClockedOut = !!att?.checkOutTime;
  const [elapsedTime, setElapsedTime] = useState("00:00:00");
  useEffect(() => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const compute = () => {
      if (!att?.checkInTime) return "00:00:00";
      const start = new Date(att.checkInTime).getTime();
      const end = att.checkOutTime ? new Date(att.checkOutTime).getTime() : Date.now();
      const diff = Math.max(0, end - start);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    };
    setElapsedTime(compute());
    const timer = setInterval(() => setElapsedTime(compute()), 1000);
    return () => clearInterval(timer);
  }, [att?.checkInTime, att?.checkOutTime]);
  const shiftStartLabel = att?.checkInTime ? formatTime(att.checkInTime, tz ?? null) : "--:-- --";
  const durationLabel = `${elapsedTime.slice(0, 2)}h ${elapsedTime.slice(3, 5)}m`;

  // Alert banner: highest-priority actionable item
  const pendingApprovals = data.pendingApprovals?.length ?? 0;
  const alertBanner =
    pendingApprovals > 0
      ? { msg: `${pendingApprovals} leave approval${pendingApprovals > 1 ? "s" : ""} waiting for your action`, href: "/leave", urgent: false }
      : (probationAlerts?.length ?? 0) > 0
        ? { msg: `${probationAlerts!.length} employee probation${probationAlerts!.length > 1 ? "s" : ""} ending within 7 days`, href: undefined, urgent: false }
        : null;

  return (
    <div className="space-y-3">
      {/* Greeting row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Good {period}, {firstName}.</h1>
          <p className="text-sm text-muted-foreground mt-0.5">It&apos;s {dayName}, {dateStr}.</p>
        </div>
        {/* Quick actions strip */}
        <div className="flex flex-wrap items-center gap-2">
          {(role === "employee" || role === "it") && (
            <>
              <Link href="/leave"><Button size="sm" variant="outline" className="gap-2 h-8"><Calendar className="h-3.5 w-3.5" /> Apply Leave</Button></Link>
              {data.employee?.id && <Link href={`/employees/${data.employee.id}`}><Button size="sm" variant="ghost" className="gap-2 h-8"><Eye className="h-3.5 w-3.5" /> My Profile</Button></Link>}
            </>
          )}
          {role === "manager" && (
            <>
              <Link href="/leave"><Button size="sm" variant="outline" className="gap-2 h-8"><CheckCircle className="h-3.5 w-3.5" /> Approvals {pendingApprovals > 0 && <Badge className="ml-1 h-4 px-1 text-[10px]">{pendingApprovals}</Badge>}</Button></Link>
              <Link href="/timesheets"><Button size="sm" variant="ghost" className="gap-2 h-8"><Clock className="h-3.5 w-3.5" /> Attendance</Button></Link>
            </>
          )}
          {(role === "hr") && (
            <>
              {(data.pendingApprovals?.length ?? 0) > 0 && (
                <Link href="/leave">
                  <Button size="sm" variant="default" className="gap-2 h-8">
                    <CheckCircle className="h-3.5 w-3.5" /> Approvals
                    <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">{data.pendingApprovals!.length}</Badge>
                  </Button>
                </Link>
              )}
              <Link href="/timesheets"><Button size="sm" variant="outline" className="gap-2 h-8"><Clock className="h-3.5 w-3.5" /> Timesheets</Button></Link>
              <Link href="/recruitment"><Button size="sm" variant="outline" className="gap-2 h-8"><UserPlus className="h-3.5 w-3.5" /> Recruitment</Button></Link>
              <Link href="/onboarding"><Button size="sm" variant="ghost" className="gap-2 h-8"><ClipboardList className="h-3.5 w-3.5" /> Onboarding</Button></Link>
            </>
          )}
          {role === "admin" && (
            <>
              {(data.pendingApprovals?.length ?? 0) > 0 && (
                <Link href="/leave">
                  <Button size="sm" variant="default" className="gap-2 h-8">
                    <CheckCircle className="h-3.5 w-3.5" /> Approvals
                    <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">{data.pendingApprovals!.length}</Badge>
                  </Button>
                </Link>
              )}
              <Link href="/timesheets"><Button size="sm" variant="outline" className="gap-2 h-8"><Clock className="h-3.5 w-3.5" /> Timesheets</Button></Link>
              <Link href="/employees"><Button size="sm" variant="outline" className="gap-2 h-8"><Users className="h-3.5 w-3.5" /> Employees</Button></Link>
              <Link href="/recruitment"><Button size="sm" variant="ghost" className="gap-2 h-8"><UserPlus className="h-3.5 w-3.5" /> Recruitment</Button></Link>
            </>
          )}
        </div>
      </div>

      {/* Alert banner */}
      {alertBanner && (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm ${alertBanner.urgent ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300" : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"}`}>
          <Zap className={`h-4 w-4 shrink-0 ${alertBanner.urgent ? "text-red-600" : "text-amber-600"}`} />
          <span className="flex-1">{alertBanner.msg}</span>
          {alertBanner.href && (
            <Link href={alertBanner.href}>
              <Button size="sm" variant={alertBanner.urgent ? "destructive" : "outline"} className="h-7 text-xs gap-1">Take Action <ArrowRight className="h-3 w-3" /></Button>
            </Link>
          )}
        </div>
      )}

      {/* Attendance status chip for employee */}
      {att && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {att.checkedIn ? (
            <span>Checked in at <strong>{formatTime(att.checkInTime, tz ?? null)}</strong>{att.checkedOut ? ` · Checked out at ${formatTime(att.checkOutTime, tz ?? null)}` : " · still active"}</span>
          ) : (
            <span>Not checked in yet today</span>
          )}
        </div>
      )}

      {/* Modern clock in / clock out card */}
      {att && (
        <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br from-[#0f111a] via-[#121728] to-[#0d111d] p-6 text-white shadow-[0_20px_45px_-15px_rgba(2,6,23,0.75)]">
          <div className="pointer-events-none absolute -left-24 -top-20 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -right-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_45%)]" />

          <div className="relative z-10 flex flex-col gap-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Today's Status</p>
                <div className="mt-2 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold">
                  <span className={`relative h-2 w-2 rounded-full ${isClockedIn ? "bg-emerald-400" : "bg-rose-400"}`}>
                    <span className={`absolute inset-0 rounded-full ${isClockedIn ? "animate-ping bg-emerald-400/60" : "animate-ping bg-rose-400/60"}`} />
                  </span>
                  {isClockedIn ? "Clocked In" : isClockedOut ? "Clocked Out" : "Clocked Out"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 text-right">
                <p className="text-sm font-medium uppercase tracking-wide text-slate-400">{dayName}, {dateStr}</p>
                <div className="space-y-0.5 text-xs">
                  <p>
                    <span className="text-slate-500">Shift start </span>
                    <span className="font-mono font-semibold text-white">{shiftStartLabel}</span>
                  </p>
                  {att.checkOutTime && (
                    <p>
                      <span className="text-slate-500">Shift end </span>
                      <span className="font-mono font-semibold text-white">{formatTime(att.checkOutTime, tz ?? null)}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="text-center">
              <p className="font-mono text-5xl font-bold leading-none tracking-tight text-white sm:text-6xl">{elapsedTime}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Duration</p>
            </div>

            {!isClockedOut && (
              <button
                type="button"
                onClick={isClockedIn ? onCheckOut : onCheckIn}
                disabled={checkingIn}
                className={`group relative mt-1 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl border px-5 py-4 text-lg font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                  isClockedIn
                    ? "border-rose-400/35 bg-rose-400/10 text-rose-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(244,63,94,0.28)]"
                    : "border-emerald-400/35 bg-emerald-400/10 text-emerald-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(16,185,129,0.28)]"
                }`}
              >
                <span className={`absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${
                  isClockedIn
                    ? "bg-gradient-to-r from-rose-500/80 to-orange-500/80"
                    : "bg-gradient-to-r from-emerald-500/80 to-lime-500/80"
                }`} />
                <span className="relative flex items-center gap-2.5 text-current group-hover:text-white">
                  {isClockedIn ? <Square className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  {isClockedIn ? "Clock Out" : "Clock In"}
                </span>
              </button>
            )}

            <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
              <div className="rounded-xl bg-white/[0.02] px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500">Shift Start</p>
                <p className="mt-0.5 font-mono text-base font-semibold text-white">{shiftStartLabel}</p>
              </div>
              <div className="rounded-xl bg-white/[0.02] px-3 py-2.5 text-right">
                <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500">Duration</p>
                <p className="mt-0.5 font-mono text-base font-semibold text-white">{durationLabel}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== MY ASSIGNED TASKS (dashboard widget) ====================

interface DashboardTaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  progress?: number;
  dueDate?: string | null;
  due_date?: string | null;
  assigneeId?: string | null;
  assignee_id?: string | null;
  assigneeName?: string | null;
  assignee_name?: string | null;
  assigneeFirstName?: string | null;
  assignee_first_name?: string | null;
  assigneeLastName?: string | null;
  assignee_last_name?: string | null;
}

function taskAssigneeId(t: DashboardTaskRow): string | null {
  return t.assigneeId ?? t.assignee_id ?? null;
}

function taskAssigneeLabel(t: DashboardTaskRow): string {
  const name = t.assigneeName ?? t.assignee_name;
  if (name?.trim()) return name.trim();
  const first = t.assigneeFirstName ?? t.assignee_first_name ?? "";
  const last = t.assigneeLastName ?? t.assignee_last_name ?? "";
  const legal = [first, last].filter(Boolean).join(" ").trim();
  return legal || "Assignee";
}

function taskProgressPercent(t: DashboardTaskRow): number {
  if (t.status === "done") return 100;
  if (t.status === "cancelled") return 0;
  const p = typeof t.progress === "number" ? t.progress : 0;
  return Math.min(100, Math.max(0, p));
}

const TASK_STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
  cancelled: "Cancelled",
};

function MyAssignedTasksCard({ employeeId }: { employeeId?: string | null }) {
  const { user } = useAuth();
  const tz = user?.timeZone ?? null;
  const df = user?.dateFormat ?? null;

  const { data: tasks = [], isLoading } = useQuery<DashboardTaskRow[]>({
    queryKey: ["/api/tasks", "dashboard-assigned", employeeId],
    queryFn: async () => {
      const params = new URLSearchParams({ assigneeId: employeeId!, limit: "20" });
      const res = await fetch(`/api/tasks?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json?.data) ? json.data : [];
    },
    enabled: !!employeeId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-orange-500" /> My Tasks
          </span>
          {openTasks.length > 0 && (
            <Badge variant="secondary" className="text-[10px] font-normal">
              {openTasks.length} open
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {!employeeId ? (
          <p className="text-xs text-muted-foreground">Link an employee profile to see assigned tasks.</p>
        ) : isLoading ? (
          <p className="text-xs text-muted-foreground">Loading tasks…</p>
        ) : openTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">No open tasks assigned to you.</p>
        ) : (
          <ul className="space-y-2 mb-2">
            {openTasks.slice(0, 5).map((t) => {
              const due = t.dueDate ?? t.due_date ?? null;
              return (
                <li key={t.id}>
                  <Link
                    href={`/tasks?task=${t.id}`}
                    className="block rounded-md border border-border/60 px-2.5 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <p className="text-xs font-medium leading-snug line-clamp-2">{t.title}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                      <span>{TASK_STATUS_LABEL[t.status] ?? t.status}</span>
                      {t.priority === "urgent" || t.priority === "high" ? (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] border-orange-200 text-orange-700">
                          {t.priority}
                        </Badge>
                      ) : null}
                      {due ? (
                        <span className="ml-auto">Due {formatDate(due, tz, df)}</span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/tasks">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 w-full sm:w-auto">
            {openTasks.length > 5 ? "View all tasks" : "Open Tasks"} <ChevronRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function TasksAssignedByMeCard() {
  const { user } = useAuth();
  const tz = user?.timeZone ?? null;
  const df = user?.dateFormat ?? null;

  const { data: tasks = [], isLoading } = useQuery<DashboardTaskRow[]>({
    queryKey: ["/api/tasks", "dashboard-delegated", user?.id],
    queryFn: async () => {
      const params = new URLSearchParams({ createdByMe: "true", limit: "30" });
      const res = await fetch(`/api/tasks?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json?.data) ? json.data : [];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const tracked = tasks.filter((t) => t.status !== "cancelled");
  const completed = tracked.filter((t) => t.status === "done").length;
  const open = tracked.filter((t) => t.status !== "done");
  const overallProgress =
    tracked.length > 0 ? Math.round(tracked.reduce((sum, t) => sum + taskProgressPercent(t), 0) / tracked.length) : 0;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" /> Tasks I Assigned
          </span>
          {tracked.length > 0 && (
            <Badge variant="secondary" className="text-[10px] font-normal">
              {completed}/{tracked.length} done
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {!user?.id ? null : isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : tracked.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tasks assigned to others yet.</p>
        ) : (
          <>
            <div className="mb-3 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Overall progress</span>
                <span className="font-medium text-foreground">{overallProgress}%</span>
              </div>
              <Progress value={overallProgress} className="h-1.5" />
            </div>
            <ul className="space-y-2 mb-2">
              {open.slice(0, 5).map((t) => {
                const assigneeId = taskAssigneeId(t);
                const due = t.dueDate ?? t.due_date ?? null;
                const pct = taskProgressPercent(t);
                return (
                  <li key={t.id}>
                    <Link
                      href={`/tasks?task=${t.id}`}
                      className="block rounded-md border border-border/60 px-2.5 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <p className="text-xs font-medium leading-snug line-clamp-2">{t.title}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Avatar className="h-5 w-5 shrink-0">
                          {assigneeId ? (
                            <AvatarImage src={`/api/employees/${assigneeId}/avatar`} alt="" />
                          ) : null}
                          <AvatarFallback className="text-[8px]">
                            {taskAssigneeLabel(t).split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-[10px] text-muted-foreground truncate flex-1">
                          {taskAssigneeLabel(t)}
                        </span>
                        <span className="text-[10px] font-medium text-foreground shrink-0">{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1 mt-1.5" />
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                        <span>{TASK_STATUS_LABEL[t.status] ?? t.status}</span>
                        {due ? <span className="ml-auto">Due {formatDate(due, tz, df)}</span> : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {completed > 0 && open.length === 0 && (
              <p className="text-xs text-muted-foreground mb-2">All assigned tasks are complete.</p>
            )}
          </>
        )}
        <Link href="/tasks">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 w-full sm:w-auto">
            Manage tasks <ChevronRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

// ==================== EMPLOYEE DASHBOARD ====================

function EmployeeDashboard({ data }: { data: DashboardData }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [checkingIn, setCheckingIn] = useState(false);

  const handleCheckIn = async () => {
    setCheckingIn(true);
    try {
      await postCheckInAndPrimeCache(queryClient);
      toast.success("Checked in!");
    } catch (err: any) { toast.error(err?.message || "Check-in failed"); }
    finally { setCheckingIn(false); }
  };

  const handleCheckOut = async () => {
    setCheckingIn(true);
    try {
      await postCheckOutAndPrimeCache(queryClient);
      toast.success("Checked out!");
    } catch (err: any) { toast.error(err?.message || "Check-out failed"); }
    finally { setCheckingIn(false); }
  };

  const emp = data.employee;
  const upcoming = data.upcomingTimeOff || [];

  return (
    <div className="space-y-6">
      <DashboardHeader data={data} role="employee" onCheckIn={handleCheckIn} onCheckOut={handleCheckOut} checkingIn={checkingIn} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Employee quick info */}
          {emp && (
            <div className="flex items-center gap-3 px-1">
              <Avatar className="h-10 w-10">
                <AvatarImage src={`/api/employees/${emp.id}/avatar`} />
                <AvatarFallback>{emp.first_name[0]}{emp.last_name[0]}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{dashEmpName(emp)}</p>
                <p className="text-xs text-muted-foreground">{emp.job_title} · {emp.department}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Badge variant="outline" className={{active:"bg-green-50 text-green-700 border-green-200",onboarding:"bg-blue-50 text-blue-700 border-blue-200",on_leave:"bg-yellow-50 text-yellow-700 border-yellow-200"}[emp.employment_status] ?? ""}>
                  {{active:"Active",onboarding:"Onboarding",on_leave:"On Leave"}[emp.employment_status] ?? emp.employment_status}
                </Badge>
              </div>
            </div>
          )}

          {/* Leave balances */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Leave Balances</p>
            {(data.leaveBalances || []).length === 0 ? (
              <Card><CardContent className="p-4 text-sm text-muted-foreground text-center">No leave balances. Contact HR to initialize.</CardContent></Card>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {sortLeaveBalancesByDisplayOrder(data.leaveBalances!).map((b, i) => {
                  const raw = parseFloat(b.balance);
                  const bal = displayLeaveBalanceDays(raw);
                  const max = b.max_balance || 1;
                  return (
                    <Card key={i} className="overflow-hidden">
                      <div className="h-1" style={{ backgroundColor: b.color }} />
                      <CardContent className="p-3">
                        <p className="text-[11px] font-medium truncate">{b.type_name}</p>
                        <p className="text-xl font-bold mt-0.5">{formatLeaveBalanceDays(raw)}</p>
                        <p className="text-[10px] text-muted-foreground">of {max} days</p>
                        <Progress value={Math.min(100, max > 0 ? Math.round((bal / max) * 100) : 0)} className="h-1 mt-1.5" />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming time off + pending requests */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4 text-emerald-500" /> Upcoming Time Off</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                {upcoming.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No upcoming time off.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {upcoming.slice(0, 3).map((l) => (
                      <li key={l.id} className="flex items-center gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                        <span>{l.type_name}</span>
                        <span className="text-muted-foreground ml-auto">{formatDate(l.start_date, user?.timeZone ?? null, user?.dateFormat ?? null)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/leave" className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
                  View all <ExternalLink className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>

            <MyAssignedTasksCard employeeId={emp?.id ?? user?.employeeId} />
            <TasksAssignedByMeCard />
          </div>

          {/* Pending leave requests */}
          {(data.pendingLeaveRequests || []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pending Requests</p>
              <div className="space-y-1.5">
                {data.pendingLeaveRequests!.map(r => (
                  <Card key={r.id}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                        <span className="text-sm font-medium">{r.type_name}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(r.start_date, user?.timeZone ?? null, user?.dateFormat ?? null)} – {formatDate(r.end_date, user?.timeZone ?? null, user?.dateFormat ?? null)}</span>
                      </div>
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs">Pending</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Onboarding progress */}
          {data.onboarding && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Onboarding in progress</p>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{data.onboarding.completedCount}/{data.onboarding.taskCount} tasks</Badge>
                </div>
                <Progress value={data.onboarding.taskCount > 0 ? Math.round((data.onboarding.completedCount / data.onboarding.taskCount) * 100) : 0} className="h-2" />
                <Link href="/onboarding"><Button variant="outline" size="sm" className="mt-3 gap-2 text-xs"><ArrowRight className="h-3 w-3" /> Continue Onboarding</Button></Link>
              </CardContent>
            </Card>
          )}

          {/* Assigned assets */}
          {(data.assets || []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">My Assets</p>
              <div className="space-y-1.5">
                {data.assets!.map(a => (
                  <Card key={a.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <Laptop className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.system_name || a.system_type}</p>
                        <p className="text-[10px] text-muted-foreground">{a.serial_number}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <ActivityFeed events={data.activityFeed} />
          <PeopleSidebar data={data} />
        </div>
      </div>
    </div>
  );
}

// ==================== MANAGER DASHBOARD ====================

function ManagerDashboard({ data }: { data: DashboardData }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [checkingIn, setCheckingIn] = useState(false);
  const handleCheckIn = async () => { setCheckingIn(true); try { await postCheckInAndPrimeCache(queryClient); toast.success("Checked in!"); } catch (e: any) { toast.error(e?.message || "Failed"); } finally { setCheckingIn(false); } };
  const handleCheckOut = async () => { setCheckingIn(true); try { await postCheckOutAndPrimeCache(queryClient); toast.success("Checked out!"); } catch (e: any) { toast.error(e?.message || "Failed"); } finally { setCheckingIn(false); } };

  return (
    <div className="space-y-6">
      <DashboardHeader data={data} role="manager" onCheckIn={handleCheckIn} onCheckOut={handleCheckOut} checkingIn={checkingIn} />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-stretch [&>*]:min-w-0">
        <StatCard title="Team Size" value={data.teamSize || 0} icon={Users} color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" />
        <StatCard title="On Leave Today" value={data.teamOnLeave?.length || 0} icon={Calendar} color="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" />
        <StatCard title="Pending Approvals" value={data.pendingApprovals?.length || 0} icon={ClipboardList} color="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" link="/leave" />
        <StatCard title="Absent Today" value={data.absentToday?.length || 0} icon={AlertTriangle} color="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <PendingLeaveApprovalsCard data={data} />

          {/* Team on leave */}
          {(data.teamOnLeave || []).length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4 text-yellow-500" /> On Leave Today</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-0.5">
                    {data.teamOnLeave!.map(m => (
                      <PersonChip key={m.id} employeeId={m.id} name={dashEmpName(m)} subtitle={m.type_name} link={`/employees/${m.id}`} />
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Absent */}
          {(data.absentToday || []).length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> Absent / No Check-in</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-0.5">
                    {data.absentToday!.map(m => (
                      <PersonChip key={m.id} employeeId={m.id} name={dashEmpName(m)} subtitle={m.department} link={`/employees/${m.id}`} />
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* In notice */}
          {(data.inNotice || []).length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> In Notice Period</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-0.5">
                    {data.inNotice!.map(m => (
                      <PersonChip key={m.id} employeeId={m.id} name={dashEmpName(m)} subtitle={`${m.offboarding_type} · LWD: ${formatDate(m.last_working_date, user?.timeZone ?? null, user?.dateFormat ?? null)}`} link={`/employees/${m.id}`} />
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* My status */}
          {data.attendance && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">My Status</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4 pt-0 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Attendance</span>
                  <Badge variant="outline" className={data.attendance.checkedIn ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}>
                    {data.attendance.checkedIn ? (data.attendance.checkedOut ? "Complete" : "Checked In") : "Not In"}
                  </Badge>
                </div>
                {sortLeaveBalancesByDisplayOrder(data.leaveBalances || []).slice(0, 2).map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{b.type_name}</span>
                    <span className="font-medium">{formatLeaveBalanceDays(parseFloat(b.balance))}d</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <TasksAssignedByMeCard />
          <MyAssignedTasksCard employeeId={data.employee?.id ?? user?.employeeId} />
          <ActivityFeed events={data.activityFeed} />
          <PeopleSidebar data={data} />
        </div>
      </div>
    </div>
  );
}

// ==================== HR DASHBOARD ====================

// ==================== LOAN DASHBOARD WIDGET ====================

function unwrapApiData<T>(json: unknown): T {
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

function LoanDashboardWidget() {
  const { data: stats } = useQuery<any>({
    queryKey: ["/api/loans/stats"],
    queryFn: async () => {
      const j = await (await apiRequest("GET", "/api/loans/stats")).json();
      return unwrapApiData(j);
    },
    staleTime: 60_000,
  });

  const { data: activeLoansRaw } = useQuery<any[]>({
    queryKey: ["/api/loans/records", "active"],
    queryFn: async () => {
      const j = await (await apiRequest("GET", "/api/loans/records?status=active")).json();
      const rows = unwrapApiData<unknown>(j);
      return Array.isArray(rows) ? rows : [];
    },
    staleTime: 60_000,
  });

  const activeLoans = Array.isArray(activeLoansRaw) ? activeLoansRaw : [];

  const outstandingSummary = formatAmountsByCurrency(
    sumAmountsByCurrency(activeLoans, (loan) => loan.outstanding_balance),
  );
  const monthlyDeductionSummary = formatAmountsByCurrency(
    sumAmountsByCurrency(activeLoans, (loan) => loan.monthly_deduction),
  );

  const displayLoans = activeLoans.slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-start justify-between gap-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Banknote className="h-4 w-4 text-blue-500" /> Loans & Advances
        </CardTitle>
        <Link href="/loans">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary -mr-1">
            Manage <ChevronRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-3">
        {/* Mini stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2 text-center">
            <p className="text-[10px] text-muted-foreground">Active</p>
            <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{stats?.activeCount ?? "—"}</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 text-center">
            <p className="text-[10px] text-muted-foreground">Pending</p>
            <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{stats?.pendingApplications ?? "—"}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/30 rounded-lg p-2 text-center">
            <p className="text-[10px] text-muted-foreground">Monthly</p>
            <p className="text-xs font-bold text-foreground leading-tight mt-0.5">{monthlyDeductionSummary}</p>
          </div>
        </div>

        {/* Employee list */}
        {displayLoans.length > 0 ? (
          <div className="space-y-1.5">
            {displayLoans.map((loan: any) => {
              const total   = parseFloat(loan.total_amount ?? 0);
              const paid    = total - parseFloat(loan.outstanding_balance ?? 0);
              const pct     = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
              return (
                <div key={loan.id} className="flex items-center gap-2.5 p-2 rounded-lg border bg-muted/20">
                  <div className="bg-blue-100 dark:bg-blue-900/30 p-1.5 rounded">
                    <DollarSign className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate text-foreground">
                      {loan.first_name} {loan.last_name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Progress value={pct} className="h-1 flex-1" />
                      <span className="text-[10px] text-muted-foreground shrink-0">{pct}%</span>
                    </div>
                  </div>
                  <p className="text-[11px] font-semibold text-foreground shrink-0">
                    {formatLoanAmount(loan.outstanding_balance, loan.currency)}
                  </p>
                </div>
              );
            })}
            {activeLoans.length > 5 && (
              <Link href="/loans">
                <p className="text-xs text-primary text-center pt-1 hover:underline cursor-pointer">
                  +{activeLoans.length - 5} more employees with active loans
                </p>
              </Link>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">No active loans</p>
        )}

        {/* Total outstanding */}
        {activeLoans.length > 0 && (
          <div className="flex justify-between items-center pt-1 border-t border-border text-xs">
            <span className="text-muted-foreground">Total outstanding</span>
            <span className="font-bold text-foreground text-right">{outstandingSummary}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HRDashboard({ data, probationAlerts = [] }: { data: DashboardData; probationAlerts?: ProbationAlert[] }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [checkingIn, setCheckingIn] = useState(false);
  const handleCheckIn = async () => { setCheckingIn(true); try { await postCheckInAndPrimeCache(queryClient); toast.success("Checked in!"); } catch (e: any) { toast.error(e?.message || "Failed"); } finally { setCheckingIn(false); } };
  const handleCheckOut = async () => { setCheckingIn(true); try { await postCheckOutAndPrimeCache(queryClient); toast.success("Checked out!"); } catch (e: any) { toast.error(e?.message || "Failed"); } finally { setCheckingIn(false); } };

  return (
    <div className="space-y-6">
      <DashboardHeader data={data} role="hr" probationAlerts={probationAlerts} onCheckIn={handleCheckIn} onCheckOut={handleCheckOut} checkingIn={checkingIn} />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-stretch [&>*]:min-w-0">
        <StatCard title="Total Employees" value={data.headcount || 0} icon={Users} color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" subtext={`+${data.joinersToday || 0} today`} link="/employees" />
        <StatCard title="In Interviews" value={data.interviewStage?.length || 0} icon={Briefcase} color="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" link="/recruitment" />
        <StatCard title="Onboarding" value={data.pendingOnboarding?.length || 0} icon={UserCheck} color="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" link="/onboarding" />
        <StatCard title="Offboarding" value={data.offboardingPending?.length || 0} icon={LogOut} color="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" link="/offboarding" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <PendingLeaveApprovalsCard data={data} />
          <AttendanceRecordWidget />
          <ProbationAlertsCard alerts={probationAlerts} />

          {/* Onboarding */}
          {(data.pendingOnboarding || []).length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2"><UserCheck className="h-4 w-4 text-green-500" /> Onboarding In Progress</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <ScrollArea className="max-h-[260px]">
                  <div className="space-y-1.5">
                    {data.pendingOnboarding!.map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                        <div>
                          <p className="text-sm font-medium">{dashEmpName({ first_name: String(o.first_name ?? ""), last_name: String(o.last_name ?? ""), nickname: o.nickname })}</p>
                          <p className="text-xs text-muted-foreground">{o.department} · {o.completed_count}/{o.task_count} tasks</p>
                        </div>
                        <Progress value={o.task_count > 0 ? Math.round((o.completed_count / o.task_count) * 100) : 0} className="w-16 h-1.5" />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Offboarding */}
          {(data.offboardingPending || []).length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2"><LogOut className="h-4 w-4 text-red-500" /> Offboarding Pending</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <ScrollArea className="max-h-[260px]">
                  <div className="space-y-1.5">
                    {data.offboardingPending!.map((o: any) => (
                      <div key={o.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                        <div>
                          <p className="text-sm font-medium">{dashEmpName({ first_name: String(o.first_name ?? ""), last_name: String(o.last_name ?? ""), nickname: o.nickname })}</p>
                          <p className="text-xs text-muted-foreground">{o.offboarding_type} · LWD: {formatDate(o.last_working_date, user?.timeZone ?? null, user?.dateFormat ?? null)}</p>
                        </div>
                        <Link href="/offboarding"><Button size="sm" variant="outline" className="h-7 text-xs">View</Button></Link>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <TasksAssignedByMeCard />
          <MyAssignedTasksCard employeeId={data.employee?.id ?? user?.employeeId} />
          <ActivityFeed events={data.activityFeed} />
          <LoanDashboardWidget />
          <PeopleSidebar data={data} />
        </div>
      </div>
    </div>
  );
}

// ==================== ADMIN / EXECUTIVE DASHBOARD ====================

function AdminDashboard({ data, probationAlerts = [] }: { data: DashboardData; probationAlerts?: ProbationAlert[] }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [checkingIn, setCheckingIn] = useState(false);
  const handleCheckIn = async () => { setCheckingIn(true); try { await postCheckInAndPrimeCache(queryClient); toast.success("Checked in!"); } catch (e: any) { toast.error(e?.message || "Failed"); } finally { setCheckingIn(false); } };
  const handleCheckOut = async () => { setCheckingIn(true); try { await postCheckOutAndPrimeCache(queryClient); toast.success("Checked out!"); } catch (e: any) { toast.error(e?.message || "Failed"); } finally { setCheckingIn(false); } };

  return (
    <div className="space-y-6">
      <DashboardHeader data={data} role="admin" probationAlerts={probationAlerts} onCheckIn={handleCheckIn} onCheckOut={handleCheckOut} checkingIn={checkingIn} />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-stretch [&>*]:min-w-0">
        <StatCard title="Headcount" value={data.headcount || 0} icon={Users} color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" link="/employees" />
        <StatCard title="Joiners (month)" value={data.joinersThisMonth || 0} icon={TrendingUp} color="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" />
        <StatCard title="Leavers (month)" value={data.leaversThisMonth || 0} icon={TrendingDown} color="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" />
        <StatCard title="Attrition (month)" value={data.attritionThisMonth || 0} icon={LogOut} color="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" />
        <StatCard title="Attendance Today" value={`${data.attendanceToday?.percentage || 0}%`} icon={Clock} color="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" subtext={`${data.attendanceToday?.present || 0} / ${data.attendanceToday?.total || 0}`} link="/timesheets" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <PendingLeaveApprovalsCard data={data} />
          <AttendanceRecordWidget />
          <ProbationAlertsCard alerts={probationAlerts} />
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <TasksAssignedByMeCard />
          <MyAssignedTasksCard employeeId={data.employee?.id ?? user?.employeeId} />
          <ActivityFeed events={data.activityFeed} />
          <LoanDashboardWidget />
          <PeopleSidebar data={data} />
        </div>
      </div>
    </div>
  );
}

// ==================== MAIN ====================

export default function Dashboard() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    queryFn: async () => { const res = await apiRequest("GET", "/api/dashboard"); return res.json(); },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const role = (data?.role ?? "employee").toString().toLowerCase();
  const { data: probationAlerts = [] } = useQuery<ProbationAlert[]>({
    queryKey: ["/api/dashboard/probation-alerts"],
    enabled: (role === "hr" || role === "admin") && !!data && !data.error,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32">
          <div className="text-center space-y-3">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (isError || !data) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32">
          <div className="text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
            <p className="text-sm text-muted-foreground">Failed to load dashboard.</p>
            <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] })}>Retry</Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (data.error) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32">
          <div className="text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto" />
            <p className="text-sm text-muted-foreground">{data.error}</p>
          </div>
        </div>
      </Layout>
    );
  }

  const portalData: DashboardData = (role === "hr" || role === "admin") && data.myData
    ? {
        ...data,
        upcomingTimeOff: data.upcomingTimeOff ?? data.myData.upcomingTimeOff,
        employee: data.employee ?? data.myData.employee,
        attendance: data.attendance ?? data.myData.attendance,
      }
    : data;

  return (
    <Layout>
      <div className="p-4 md:p-6">
        {(role === "employee" || role === "it") && <EmployeeDashboard data={portalData} />}
        {role === "manager" && <ManagerDashboard data={portalData} />}
        {role === "hr" && <HRDashboard data={portalData} probationAlerts={probationAlerts} />}
        {role === "admin" && <AdminDashboard data={portalData} probationAlerts={probationAlerts} />}
        {!["employee", "it", "manager", "hr", "admin"].includes(role) && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <AlertTriangle className="h-8 w-8 text-yellow-500 mb-3" />
            <p className="text-sm text-muted-foreground">Unknown role: {data.role}</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

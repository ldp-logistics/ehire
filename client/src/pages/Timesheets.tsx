import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmployeeSelect } from "@/components/EmployeeSelect";
import {
  Calendar, Download, Play, Square, AlertCircle, Users,
  CheckCircle, XCircle, BarChart3, Search, FileText, Plus, Timer, Pencil, Trash2, ChevronDown,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { QUERY_KEY_ATTENDANCE_TODAY, postCheckInAndPrimeCache, postCheckOutAndPrimeCache } from "@/lib/attendanceClock";
import { useAuth } from "@/hooks/useAuth";
import { Link, useSearch } from "wouter";
import { formatLeaveDisplayDate } from "@/lib/dateUtils";
import { formatEmployeeDisplayName } from "@shared/employeeDisplayName";

// ==================== TYPES ====================

interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  source: string;
  status: string;
  remarks: string | null;
  shift_name?: string | null;
  shift_start?: string | null;
  shift_end?: string | null;
  grace_minutes?: number;
  /** True when shift columns were filled from Settings → Timesheet policy (no shift assignment). */
  using_org_timesheet_policy?: boolean;
  first_name?: string;
  last_name?: string;
  nickname?: string | null;
  emp_code?: string;
  department?: string;
  hours_worked?: number;
  overtime?: number;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function attendanceRecordName(r: {
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
}): string {
  return formatEmployeeDisplayName(r.first_name, r.last_name, r.nickname);
}

interface TimesheetPolicySummary {
  policyTimezone?: string | null;
  workDayStart: string;
  workDayEnd: string;
  graceMinutes: number;
  halfDayThresholdPercent: number;
  workingDays?: number[];
}

interface AttendanceStats {
  today: string;
  present: number;
  late: number;
  absent: number;
  totalEmployees: number;
}

// ==================== HELPERS ====================

function formatTime(ts: string | null, tz?: string | null): string {
  if (!ts) return "—";
  const d = new Date(String(ts).trim());
  if (Number.isNaN(d.getTime())) return "—";
  const tzOpt = tz?.trim() || undefined;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...(tzOpt ? { timeZone: tzOpt } : {}),
  });
}

function formatDate(d: string | null | undefined, tz?: string | null, df?: string | null): string {
  if (d == null || d === "") return "—";
  return formatLeaveDisplayDate(d, tz ?? null, df ?? null);
}

function formatHours(h: number | undefined): string {
  if (!h || h === 0) return "—";
  return `${h.toFixed(1)}h`;
}

/** DB/JSON often sends `date` as full ISO (`…T00:00:00.000Z`). Only `YYYY-MM-DD` may appear in `YYYY-MM-DDTHH:mm` for `Date` parsing. */
function workDateYmdOnly(workDate: string | null | undefined): string {
  if (workDate == null || workDate === "") return "";
  return String(workDate).slice(0, 10);
}

/**
 * Interpret `timeHm` as local wall clock on `workDate` (calendar day only) and return UTC ISO, or null if empty/invalid.
 */
function workDateAndLocalTimeToUtcIso(workDate: string, timeHm: string): string | null {
  const ymd = workDateYmdOnly(workDate);
  const t = timeHm.trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const parts = t.split(":");
  const withSeconds =
    parts.length === 2
      ? `${parts[0]!.padStart(2, "0")}:${parts[1]!.padStart(2, "0")}:00`
      : t;
  const d = new Date(`${ymd}T${withSeconds}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Work dates must follow org policy TZ (same as server attendance), not UTC vs local mix. */
function defaultAttendanceReportRange(timezone: string, daysBack: number): { from: string; to: string } {
  const zone = timezone?.trim() || "UTC";
  const end = DateTime.now().setZone(zone);
  const start = end.minus({ days: daysBack });
  return { from: start.toFormat("yyyy-MM-dd"), to: end.toFormat("yyyy-MM-dd") };
}

/** Single calendar day in policy TZ (HR report default: show “today” immediately after refresh). */
function policyTodayRange(timezone: string): { from: string; to: string } {
  const zone = timezone?.trim() || "UTC";
  const day = DateTime.now().setZone(zone).toFormat("yyyy-MM-dd");
  return { from: day, to: day };
}

// ==================== DATE PRESETS ====================

type DatePreset = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "custom";

const DATE_PRESET_ORDER: DatePreset[] = ["today", "yesterday", "this_week", "last_week", "this_month"];

const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This Week",
  last_week: "Last Week",
  this_month: "This Month",
  custom: "Custom",
};

function resolveDatePreset(preset: DatePreset, timezone: string): { from: string; to: string } {
  const zone = timezone?.trim() || "UTC";
  const now = DateTime.now().setZone(zone);
  switch (preset) {
    case "today":
      return { from: now.toFormat("yyyy-MM-dd"), to: now.toFormat("yyyy-MM-dd") };
    case "yesterday": {
      const y = now.minus({ days: 1 });
      return { from: y.toFormat("yyyy-MM-dd"), to: y.toFormat("yyyy-MM-dd") };
    }
    case "this_week": {
      const start = now.startOf("week");
      return { from: start.toFormat("yyyy-MM-dd"), to: now.toFormat("yyyy-MM-dd") };
    }
    case "last_week": {
      const start = now.minus({ weeks: 1 }).startOf("week");
      const end = start.endOf("week");
      return { from: start.toFormat("yyyy-MM-dd"), to: end.toFormat("yyyy-MM-dd") };
    }
    case "this_month": {
      const start = now.startOf("month");
      return { from: start.toFormat("yyyy-MM-dd"), to: now.toFormat("yyyy-MM-dd") };
    }
    default:
      return { from: now.toFormat("yyyy-MM-dd"), to: now.toFormat("yyyy-MM-dd") };
  }
}

// ==================== STATUS / SOURCE BADGES ====================

function statusBadge(status: string) {
  const cfg: Record<string, { label: string; className: string }> = {
    present: { label: "Present", className: "bg-green-100 text-green-700 border-green-200" },
    late: { label: "Late", className: "bg-amber-100 text-amber-700 border-amber-200" },
    half_day: { label: "Half Day", className: "bg-orange-100 text-orange-700 border-orange-200" },
    absent: { label: "Absent", className: "bg-red-100 text-red-700 border-red-200" },
    holiday: { label: "Holiday", className: "bg-purple-100 text-purple-700 border-purple-200" },
  };
  const c = cfg[status] || { label: status, className: "" };
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
}

function sourceBadge(source: string) {
  const cfg: Record<string, string> = { web: "Web", manual: "Manual", mobile: "Mobile", biometric: "Biometric" };
  return <Badge variant="secondary" className="text-xs">{cfg[source] || source}</Badge>;
}

type ReportSortMode = "department_first" | "date_first";

function compareAttendanceReportRows(a: AttendanceRecord, b: AttendanceRecord, mode: ReportSortMode): number {
  const deptKey = (r: AttendanceRecord) => (r.department ?? "").trim().toLowerCase() || "\uffff";
  const dateKey = (r: AttendanceRecord) => workDateYmdOnly(r.date);
  const nameKey = (r: AttendanceRecord) => `${r.last_name ?? ""} ${r.first_name ?? ""}`.toLowerCase();
  const hasIn = (r: AttendanceRecord) => (r.check_in_time ? 1 : 0);
  const inTime = (r: AttendanceRecord) => (r.check_in_time ? new Date(r.check_in_time).getTime() : 0);

  const cmpDept = deptKey(a).localeCompare(deptKey(b));
  const cmpDate = dateKey(a).localeCompare(dateKey(b));
  const cmpHasIn = hasIn(b) - hasIn(a);
  const cmpName = nameKey(a).localeCompare(nameKey(b));
  const cmpInTime = inTime(a) - inTime(b);

  if (mode === "department_first") {
    if (cmpDept !== 0) return cmpDept;
    if (cmpDate !== 0) return cmpDate;
    if (cmpHasIn !== 0) return cmpHasIn;
    if (cmpName !== 0) return cmpName;
    return cmpInTime;
  }
  if (cmpDate !== 0) return cmpDate;
  if (cmpDept !== 0) return cmpDept;
  if (cmpHasIn !== 0) return cmpHasIn;
  if (cmpName !== 0) return cmpName;
  return cmpInTime;
}

// ==================== MAIN COMPONENT ====================

type TimesheetTab = "my-attendance" | "report";

function tabFromSearch(search: string, canManage: boolean): TimesheetTab {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const tab = new URLSearchParams(q).get("tab");
  if (tab === "report" && canManage) return "report";
  return "my-attendance";
}

export default function Timesheets() {
  const queryClient = useQueryClient();
  const { user, isAdmin, isHR } = useAuth();
  const canManage = isAdmin || isHR;
  const search = useSearch();
  const [activeTab, setActiveTab] = useState<TimesheetTab>(() => tabFromSearch(search, canManage));

  const browserTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const initialMyLog = defaultAttendanceReportRange(browserTz, 30);
  const initialReport = policyTodayRange(browserTz);

  // Employee clock state
  const [elapsedTime, setElapsedTime] = useState("00:00:00");
  const [manualDialog, setManualDialog] = useState(false);
  /** My Attendance log: last 30 days in policy TZ (no date pickers on that tab). */
  const [myLogFrom, setMyLogFrom] = useState(() => initialMyLog.from);
  const [myLogTo, setMyLogTo] = useState(() => initialMyLog.to);
  /** Attendance Report tab: default to current policy day so refresh shows today’s rows. */
  const [reportFrom, setReportFrom] = useState(() => initialReport.from);
  const [reportTo, setReportTo] = useState(() => initialReport.to);
  const [reportDept, setReportDept] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [reportSortMode, setReportSortMode] = useState<ReportSortMode>("department_first");
  const [activePreset, setActivePreset] = useState<DatePreset>("today");
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    setActiveTab(tabFromSearch(search, canManage));
  }, [search, canManage]);

  /** Once org timesheet policy loads, align date windows to policy TZ (matches `attendance_records.date`). */
  const appliedPolicyTzForDates = useRef<string | null>(null);

  // Manual entry form
  const [manualForm, setManualForm] = useState({
    employeeId: "", date: new Date().toISOString().split("T")[0],
    checkInTime: "", checkOutTime: "", remarks: "",
  });

  // Edit record (report): record being edited, or null
  const [editRecord, setEditRecord] = useState<AttendanceRecord | null>(null);
  const [editForm, setEditForm] = useState({ checkInTime: "", checkOutTime: "", remarks: "" });
  const [deleteRecord, setDeleteRecord] = useState<AttendanceRecord | null>(null);

  // ==================== QUERIES ====================

  const { data: todayRecord, isLoading: todayLoading } = useQuery({
    queryKey: QUERY_KEY_ATTENDANCE_TODAY,
    queryFn: async () => { const r = await apiRequest("GET", "/api/attendance/today"); return r.json(); },
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery<AttendanceStats>({
    queryKey: ["/api/attendance/stats"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/attendance/stats"); return r.json(); },
    refetchInterval: 60000,
  });

  const { data: timesheetPolicy } = useQuery<TimesheetPolicySummary>({
    queryKey: ["/api/attendance/timesheet-policy"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/attendance/timesheet-policy");
      return r.json();
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (timesheetPolicy == null) return;
    const tz = (timesheetPolicy.policyTimezone ?? "").trim() || "UTC";
    if (appliedPolicyTzForDates.current === tz) return;
    appliedPolicyTzForDates.current = tz;
    const my = defaultAttendanceReportRange(tz, 30);
    const rep = resolveDatePreset("today", tz);
    setMyLogFrom(my.from);
    setMyLogTo(my.to);
    setReportFrom(rep.from);
    setReportTo(rep.to);
    setActivePreset("today");
  }, [timesheetPolicy]);

  /** Punch wall times: org policy TZ (matches server work-day), not employee branch TZ. */
  const attendanceDisplayTz =
    ((timesheetPolicy?.policyTimezone ?? "").trim() || user?.timeZone) ?? null;

  const { data: myRecords = [] } = useQuery<AttendanceRecord[]>({
    queryKey: ["/api/attendance/employee", user?.employeeId, myLogFrom, myLogTo],
    queryFn: async () => {
      if (!user?.employeeId) return [];
      const r = await apiRequest("GET", `/api/attendance/employee/${user.employeeId}?from=${myLogFrom}&to=${myLogTo}`);
      return r.json();
    },
    enabled: !!user?.employeeId,
  });

  const { data: reportData = [], isLoading: reportLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ["/api/attendance/report", reportFrom, reportTo, reportDept],
    queryFn: async () => {
      let url = `/api/attendance/report?from=${reportFrom}&to=${reportTo}`;
      if (reportDept) url += `&department=${encodeURIComponent(reportDept)}`;
      const r = await apiRequest("GET", url);
      return r.json();
    },
    enabled: canManage,
  });

  // ==================== MUTATIONS ====================

  const checkInMutation = useMutation({
    mutationFn: () => postCheckInAndPrimeCache(queryClient),
    onSuccess: () => {
      toast.success("Checked in successfully");
      void queryClient.invalidateQueries({ queryKey: ["/api/attendance/employee"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to check in"),
  });

  const checkOutMutation = useMutation({
    mutationFn: () => postCheckOutAndPrimeCache(queryClient),
    onSuccess: () => {
      toast.success("Checked out successfully");
      void queryClient.invalidateQueries({ queryKey: ["/api/attendance/employee"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to check out"),
  });

  const manualMutation = useMutation({
    mutationFn: async (data: typeof manualForm) => {
      const day = workDateYmdOnly(data.date);
      const checkInIso = data.checkInTime ? workDateAndLocalTimeToUtcIso(day, data.checkInTime) : null;
      const checkOutIso = data.checkOutTime ? workDateAndLocalTimeToUtcIso(day, data.checkOutTime) : null;
      if (data.checkInTime && checkInIso == null) throw new Error("Invalid check-in time");
      if (data.checkOutTime && checkOutIso == null) throw new Error("Invalid check-out time");
      const r = await apiRequest("POST", "/api/attendance/manual", {
        employeeId: data.employeeId,
        date: day,
        checkInTime: checkInIso,
        checkOutTime: checkOutIso,
        remarks: data.remarks || null,
        source: "manual",
      });
      return r.json();
    },
    onSuccess: () => {
      toast.success("Manual record saved");
      setManualDialog(false);
      setManualForm({ employeeId: "", date: new Date().toISOString().split("T")[0], checkInTime: "", checkOutTime: "", remarks: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/report"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/employee"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to save"),
  });

  const updateRecordMutation = useMutation({
    mutationFn: async ({ id, date, checkInTime, checkOutTime, remarks }: { id: string; date: string; checkInTime: string; checkOutTime: string; remarks: string }) => {
      const body: { checkInTime?: string | null; checkOutTime?: string | null; remarks?: string | null } = { remarks: remarks || null };
      const day = workDateYmdOnly(date);
      body.checkInTime = checkInTime ? workDateAndLocalTimeToUtcIso(day, checkInTime) : null;
      body.checkOutTime = checkOutTime ? workDateAndLocalTimeToUtcIso(day, checkOutTime) : null;
      if (checkInTime && body.checkInTime == null) throw new Error("Invalid check-in time");
      if (checkOutTime && body.checkOutTime == null) throw new Error("Invalid check-out time");
      const r = await apiRequest("PATCH", `/api/attendance/record/${id}`, body);
      return r.json();
    },
    onSuccess: () => {
      toast.success("Record updated");
      setEditRecord(null);
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/report"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/employee"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to update"),
  });

  const deleteRecordMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/attendance/record/${id}`);
      return r.json();
    },
    onSuccess: () => {
      toast.success("Record deleted");
      setDeleteRecord(null);
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/report"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/employee"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to delete"),
  });

  function openEditDialog(r: AttendanceRecord) {
    const toTimeInput = (ts: string | null) => {
      if (!ts) return "";
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return "";
      const h = d.getHours();
      const m = d.getMinutes();
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    };
    setEditRecord(r);
    setEditForm({
      checkInTime: toTimeInput(r.check_in_time),
      checkOutTime: toTimeInput(r.check_out_time),
      remarks: r.remarks || "",
    });
  }

  // ==================== ELAPSED TIME TIMER ====================

  const isClockedIn = !!todayRecord?.check_in_time && !todayRecord?.check_out_time;
  const isClockedOut = !!todayRecord?.check_out_time;

  useEffect(() => {
    if (!isClockedIn || !todayRecord?.check_in_time) {
      if (isClockedOut && todayRecord?.check_in_time && todayRecord?.check_out_time) {
        const diff = new Date(todayRecord.check_out_time).getTime() - new Date(todayRecord.check_in_time).getTime();
        const h = Math.floor(diff / 3600000).toString().padStart(2, "0");
        const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, "0");
        const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
        setElapsedTime(`${h}:${m}:${s}`);
      } else {
        setElapsedTime("00:00:00");
      }
      return;
    }
    const interval = setInterval(() => {
      const diff = Date.now() - new Date(todayRecord.check_in_time!).getTime();
      const h = Math.floor(diff / 3600000).toString().padStart(2, "0");
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, "0");
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
      setElapsedTime(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [isClockedIn, isClockedOut, todayRecord]);

  // ==================== EXPORT ====================

  // ==================== REPORT AGGREGATES ====================

  const reportFromYmd = workDateYmdOnly(reportFrom);
  const reportToYmd = workDateYmdOnly(reportTo);
  const filteredReport = reportData.filter((r) => {
    const d = workDateYmdOnly(r.date);
    if (reportFromYmd && d < reportFromYmd) return false;
    if (reportToYmd && d > reportToYmd) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return attendanceRecordName(r).toLowerCase().includes(term) ||
      `${r.first_name ?? ""} ${r.last_name ?? ""}`.toLowerCase().includes(term) ||
      (r.nickname ?? "").toLowerCase().includes(term) ||
      (r.emp_code || "").toLowerCase().includes(term) ||
      (r.department || "").toLowerCase().includes(term);
  });

  const sortedReport = useMemo(
    () => [...filteredReport].sort((a, b) => compareAttendanceReportRows(a, b, reportSortMode)),
    [filteredReport, reportSortMode]
  );

  const lateCount = filteredReport.filter((r) => r.status === "late").length;
  const totalHours = filteredReport.reduce(
    (sum, r) => sum + (r.status === "holiday" ? 0 : (r.hours_worked ?? 0)),
    0
  );
  const totalOvertime = filteredReport.reduce(
    (sum, r) => sum + (r.status === "holiday" ? 0 : (r.overtime ?? 0)),
    0
  );

  const handleExport = () => {
    // Report: same order as table (search + dept API + sort); My Attendance: raw log order
    const exportData = canManage ? sortedReport : myRecords;
    if (exportData.length === 0) { toast.error("No data to export"); return; }

    const tz = attendanceDisplayTz;

    const escapeCell = (val: string) => {
      // Wrap in quotes if contains comma, quote, or newline
      const s = String(val ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const headers = ["Emp ID", "Employee", "Date", "Check In", "Check Out", "Department"];

    const myNameFallback = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();

    const rows = exportData.map((r) => {
      const dateStr = formatDate(r.date, tz, user?.dateFormat ?? null);
      const checkIn = formatTime(r.check_in_time, tz);
      const checkOut = formatTime(r.check_out_time, tz);
      const empId = r.emp_code ?? "";
      const name = attendanceRecordName(r) !== "—" ? attendanceRecordName(r) : myNameFallback;
      return [empId, name, dateStr, checkIn, checkOut, r.department ?? ""].map(escapeCell);
    });

    const csv = [headers.map(escapeCell).join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); // BOM for Excel
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const from = canManage ? reportFrom : myLogFrom;
    const to = canManage ? reportTo : myLogTo;
    const searchSuffix = canManage && searchTerm ? `_${searchTerm.replace(/\s+/g, "_")}` : "";
    link.download = `attendance_report_${from}_${to}${searchSuffix}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success(`Exported ${exportData.length} record${exportData.length !== 1 ? "s" : ""}`);
  };

  const clockNow = new Date();
  const tzOpts = attendanceDisplayTz ? { timeZone: attendanceDisplayTz } : {};
  const clockDayName = new Intl.DateTimeFormat("en-GB", { weekday: "long", ...tzOpts }).format(clockNow);
  const clockDateStr = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...tzOpts }).format(clockNow);
  const shiftStartLabel = todayRecord?.check_in_time ? formatTime(todayRecord.check_in_time, attendanceDisplayTz) : "--:-- --";
  const shiftEndLabel = todayRecord?.check_out_time ? formatTime(todayRecord.check_out_time, attendanceDisplayTz) : null;
  const durationLabel = `${elapsedTime.slice(0, 2)}h ${elapsedTime.slice(3, 5)}m`;

  // ==================== RENDER ====================

  return (
    <Layout>
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Time & Attendance</h1>
          <p className="text-muted-foreground text-sm">Track attendance, shifts, and generate reports.</p>
          {timesheetPolicy && (
            <p className="text-muted-foreground text-xs mt-2 max-w-2xl">
              <span className="font-medium text-foreground">Company timesheet rules: </span>
              {timesheetPolicy.policyTimezone ? (
                <>policy timezone {timesheetPolicy.policyTimezone}; </>
              ) : null}
              work window {timesheetPolicy.workDayStart}–{timesheetPolicy.workDayEnd} (in that timezone), grace {timesheetPolicy.graceMinutes} min after start;
              half-day if worked &lt; {timesheetPolicy.halfDayThresholdPercent}% of that window
              {Array.isArray(timesheetPolicy.workingDays) && timesheetPolicy.workingDays.length > 0 ? (
                <>
                  ; working days {timesheetPolicy.workingDays
                    .slice()
                    .sort((a, b) => a - b)
                    .map((d) => WEEKDAY_SHORT[d] ?? d)
                    .join(", ")}
                </>
              ) : null}
              .
              {canManage ? (
                <> Change in <Link href="/settings" className="text-primary underline underline-offset-2">Settings → Timesheet policy</Link>.</>
              ) : (
                <> Same rules apply to all employees.</>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          )}
          {canManage && (
            <Button onClick={() => setManualDialog(true)}>
              <Plus className="h-4 w-4 mr-2" /> Manual Entry
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30"><CheckCircle className="h-5 w-5 text-green-600" /></div>
              <div><p className="text-xs text-muted-foreground">Present Today</p><p className="text-2xl font-bold">{stats.present}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30"><AlertCircle className="h-5 w-5 text-amber-600" /></div>
              <div><p className="text-xs text-muted-foreground">Late Today</p><p className="text-2xl font-bold">{stats.late}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30"><XCircle className="h-5 w-5 text-red-600" /></div>
              <div><p className="text-xs text-muted-foreground">Absent Today</p><p className="text-2xl font-bold">{stats.absent}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30"><Users className="h-5 w-5 text-blue-600" /></div>
              <div><p className="text-xs text-muted-foreground">Total Employees</p><p className="text-2xl font-bold">{stats.totalEmployees}</p></div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TimesheetTab)} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="my-attendance">My Attendance</TabsTrigger>
          {canManage && <TabsTrigger value="report">Attendance Report</TabsTrigger>}
        </TabsList>

        {/* ==================== MY ATTENDANCE TAB ==================== */}
        <TabsContent value="my-attendance">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Clock card — matches Dashboard modern clock in/out */}
            <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br from-[#0f111a] via-[#121728] to-[#0d111d] p-6 text-white shadow-[0_20px_45px_-15px_rgba(2,6,23,0.75)] h-min">
              <div className="pointer-events-none absolute -left-24 -top-20 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-28 -right-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_45%)]" />

              <div className="relative z-10 flex flex-col gap-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Today&apos;s Status</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold">
                        <span
                          className={`relative h-2 w-2 rounded-full shrink-0 ${
                            isClockedIn ? "bg-emerald-400" : isClockedOut ? "bg-blue-400" : "bg-slate-500"
                          }`}
                        >
                          {isClockedIn ? (
                            <span className="absolute inset-0 rounded-full animate-ping bg-emerald-400/60" />
                          ) : null}
                        </span>
                        {isClockedIn ? "Clocked In" : isClockedOut ? "Clocked Out" : "Not clocked in"}
                      </div>
                      {todayRecord?.shift_name ? (
                        <Badge variant="outline" className="border-white/20 bg-white/5 text-slate-200 text-[10px]">
                          {todayRecord.shift_name}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <p className="text-sm font-medium uppercase tracking-wide text-slate-400">{clockDayName}, {clockDateStr}</p>
                    <div className="space-y-0.5 text-xs">
                      <p>
                        <span className="text-slate-500">Shift start </span>
                        <span className="font-mono font-semibold text-white">{shiftStartLabel}</span>
                      </p>
                      {shiftEndLabel && (
                        <p>
                          <span className="text-slate-500">Shift end </span>
                          <span className="font-mono font-semibold text-white">{shiftEndLabel}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-center">
                  <p className="font-mono text-5xl font-bold leading-none tracking-tight text-white sm:text-6xl">{elapsedTime}</p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Duration</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {todayRecord?.check_in_time ? `In: ${formatTime(todayRecord.check_in_time, attendanceDisplayTz)}` : "Ready to start"}
                    {todayRecord?.check_out_time ? ` · Out: ${formatTime(todayRecord.check_out_time, attendanceDisplayTz)}` : ""}
                  </p>
                </div>

                {!isClockedOut && (
                  <button
                    type="button"
                    onClick={() => (isClockedIn ? checkOutMutation.mutate() : checkInMutation.mutate())}
                    disabled={isClockedIn ? checkOutMutation.isPending : checkInMutation.isPending}
                    className={`group relative mt-1 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl border px-5 py-4 text-lg font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                      isClockedIn
                        ? "border-rose-400/35 bg-rose-400/10 text-rose-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(244,63,94,0.28)]"
                        : "border-emerald-400/35 bg-emerald-400/10 text-emerald-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(16,185,129,0.28)]"
                    }`}
                  >
                    <span
                      className={`absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${
                        isClockedIn
                          ? "bg-gradient-to-r from-rose-500/80 to-orange-500/80"
                          : "bg-gradient-to-r from-emerald-500/80 to-lime-500/80"
                      }`}
                    />
                    <span className="relative flex items-center gap-2.5 text-current group-hover:text-white">
                      {isClockedIn ? <Square className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                      {isClockedIn ? "Clock Out" : "Clock In"}
                    </span>
                  </button>
                )}

                {isClockedOut && (
                  <p className="text-center text-sm text-slate-400">All done for today</p>
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

            {/* My Records */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4" /> My Attendance Log
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Emp ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Check In</TableHead>
                          <TableHead>Check Out</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Hours</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Shift</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {myRecords.length === 0 ? (
                          <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No attendance records found</TableCell></TableRow>
                        ) : myRecords.map((r) => {
                          const hrs = r.check_in_time && r.check_out_time
                            ? (new Date(r.check_out_time).getTime() - new Date(r.check_in_time).getTime()) / 3600000
                            : 0;
                          const myName =
                            attendanceRecordName(r) !== "—"
                              ? attendanceRecordName(r)
                              : formatEmployeeDisplayName(user?.firstName, user?.lastName, user?.nickname) || "—";
                          return (
                            <TableRow key={r.id}>
                              <TableCell className="font-mono text-sm text-muted-foreground">{r.emp_code || "—"}</TableCell>
                              <TableCell className="font-medium text-sm">{myName}</TableCell>
                              <TableCell className="font-medium">{formatDate(r.date, attendanceDisplayTz, user?.dateFormat ?? null)}</TableCell>
                              <TableCell className="font-mono text-sm">{formatTime(r.check_in_time, attendanceDisplayTz)}</TableCell>
                              <TableCell className="font-mono text-sm">{formatTime(r.check_out_time, attendanceDisplayTz)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{r.department || "—"}</TableCell>
                              <TableCell className="font-mono">{formatHours(hrs)}</TableCell>
                              <TableCell>{statusBadge(r.status)}</TableCell>
                              <TableCell>{sourceBadge(r.source)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{r.shift_name || "—"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ==================== REPORT TAB (HR/Admin) ==================== */}
        {canManage && (
          <TabsContent value="report">
            <Card className="mb-4">
              <CardContent className="p-4 space-y-3">
                {/* Row 1: Date preset pills + Custom toggle */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground mr-1">Date:</span>
                  {DATE_PRESET_ORDER.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        const tz = (timesheetPolicy?.policyTimezone ?? "").trim() || browserTz;
                        const range = resolveDatePreset(preset, tz);
                        setReportFrom(range.from);
                        setReportTo(range.to);
                        setActivePreset(preset);
                        setShowCustom(false);
                      }}
                      className={`rounded-full border px-3.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        activePreset === preset
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      {DATE_PRESET_LABELS[preset]}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustom((v) => !v);
                      setActivePreset("custom");
                    }}
                    className={`flex items-center gap-1 rounded-full border px-3.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      activePreset === "custom"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    {DATE_PRESET_LABELS.custom}
                    <ChevronDown className={`h-3 w-3 transition-transform ${showCustom ? "rotate-180" : ""}`} />
                  </button>

                  {/* Custom date inputs — slide in when expanded */}
                  {showCustom && (
                    <div className="flex items-center gap-2 pl-1">
                      <Input
                        type="date"
                        value={reportFrom}
                        onChange={(e) => {
                          setReportFrom(e.target.value);
                          setActivePreset("custom");
                        }}
                        className="h-8 w-36 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">→</span>
                      <Input
                        type="date"
                        value={reportTo}
                        onChange={(e) => {
                          setReportTo(e.target.value);
                          setActivePreset("custom");
                        }}
                        className="h-8 w-36 text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* Row 2: Department, Search, Sort */}
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Department</Label>
                    <Input placeholder="All departments" value={reportDept} onChange={(e) => setReportDept(e.target.value)} className="w-44 h-8 text-xs" />
                  </div>
                  <div className="space-y-1 flex-1 min-w-[200px]">
                    <Label className="text-xs">Search</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input placeholder="Name, ID, dept..." className="pl-9 h-8 text-xs" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1 min-w-[220px]">
                    <Label className="text-xs">Sort</Label>
                    <Select value={reportSortMode} onValueChange={(v) => setReportSortMode(v as ReportSortMode)}>
                      <SelectTrigger className="w-full h-8 text-xs">
                        <SelectValue placeholder="Sort order" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="department_first">Dept → date → checked-in first</SelectItem>
                        <SelectItem value="date_first">Date → dept → checked-in first</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Report Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Records</p><p className="text-xl font-bold">{filteredReport.length}</p></CardContent></Card>
              <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Late Arrivals</p><p className="text-xl font-bold text-amber-600">{lateCount}</p></CardContent></Card>
              <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Total Hours</p><p className="text-xl font-bold">{totalHours.toFixed(0)}h</p></CardContent></Card>
              <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Overtime</p><p className="text-xl font-bold text-purple-600">{totalOvertime.toFixed(1)}h</p></CardContent></Card>
            </div>

            <Card className="overflow-hidden">
              <div className="max-h-[min(600px,72vh)] overflow-auto overscroll-contain">
                <Table>
                    <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-sm shadow-[0_1px_0_0_hsl(var(--border))]">Emp ID</TableHead>
                      <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-sm shadow-[0_1px_0_0_hsl(var(--border))]">Name</TableHead>
                      <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-sm shadow-[0_1px_0_0_hsl(var(--border))]">Date</TableHead>
                      <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-sm shadow-[0_1px_0_0_hsl(var(--border))]">Check In</TableHead>
                      <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-sm shadow-[0_1px_0_0_hsl(var(--border))]">Check Out</TableHead>
                      <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-sm shadow-[0_1px_0_0_hsl(var(--border))]">Department</TableHead>
                      <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-sm text-right shadow-[0_1px_0_0_hsl(var(--border))]">Hours</TableHead>
                      <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-sm text-right shadow-[0_1px_0_0_hsl(var(--border))]">OT</TableHead>
                      <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-sm shadow-[0_1px_0_0_hsl(var(--border))]">Status</TableHead>
                      <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-sm shadow-[0_1px_0_0_hsl(var(--border))]">Source</TableHead>
                      <TableHead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-sm shadow-[0_1px_0_0_hsl(var(--border))]">Shift</TableHead>
                      <TableHead className="sticky top-0 z-20 w-[100px] bg-muted/95 text-right backdrop-blur-sm shadow-[0_1px_0_0_hsl(var(--border))]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportLoading ? (
                      <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                    ) : sortedReport.length === 0 ? (
                      <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No records found</TableCell></TableRow>
                    ) : sortedReport.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-sm text-muted-foreground">{r.emp_code || "—"}</TableCell>
                        <TableCell className="font-medium text-sm">{attendanceRecordName(r)}</TableCell>
                        <TableCell className="font-medium text-sm">{formatDate(r.date, attendanceDisplayTz, user?.dateFormat ?? null)}</TableCell>
                        <TableCell className="font-mono text-sm">{formatTime(r.check_in_time, attendanceDisplayTz)}</TableCell>
                        <TableCell className="font-mono text-sm">{formatTime(r.check_out_time, attendanceDisplayTz)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.department || "—"}</TableCell>
                        <TableCell className="text-right font-mono">{formatHours(r.hours_worked)}</TableCell>
                        <TableCell className="text-right font-mono text-purple-600">{r.overtime && r.overtime > 0 ? `${r.overtime.toFixed(1)}h` : "—"}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell>{sourceBadge(r.source)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.shift_name || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(r)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteRecord(r)} title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* ==================== EDIT RECORD DIALOG ==================== */}
      <Dialog open={!!editRecord} onOpenChange={(open) => !open && setEditRecord(null)}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Edit Attendance Record</DialogTitle>
            <DialogDescription>Update check-in/out or remarks. Status is recalculated from shift.</DialogDescription>
          </DialogHeader>
          {editRecord && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Employee</Label>
                  <p className="text-sm font-medium">
                    {attendanceRecordName(editRecord)}
                    {editRecord.emp_code && ` · ${editRecord.emp_code}`}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Date</Label>
                  <p className="text-sm font-medium">{formatDate(editRecord.date, attendanceDisplayTz, user?.dateFormat ?? null)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Check In Time</Label>
                  <Input type="time" value={editForm.checkInTime} onChange={(e) => setEditForm({ ...editForm, checkInTime: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Check Out Time</Label>
                  <Input type="time" value={editForm.checkOutTime} onChange={(e) => setEditForm({ ...editForm, checkOutTime: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Remarks</Label>
                <Textarea value={editForm.remarks} onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })} rows={2} placeholder="Optional..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRecord(null)}>Cancel</Button>
            <Button
              onClick={() => editRecord && updateRecordMutation.mutate({
                id: editRecord.id,
                date: editRecord.date,
                checkInTime: editForm.checkInTime,
                checkOutTime: editForm.checkOutTime,
                remarks: editForm.remarks,
              })}
              disabled={updateRecordMutation.isPending}
            >
              {updateRecordMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== DELETE CONFIRMATION ==================== */}
      <AlertDialog open={!!deleteRecord} onOpenChange={(open) => !open && setDeleteRecord(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete attendance record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the record for {deleteRecord ? attendanceRecordName(deleteRecord) : ""} on {deleteRecord ? formatDate(deleteRecord.date, attendanceDisplayTz, user?.dateFormat ?? null) : ""}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteRecord && deleteRecordMutation.mutate(deleteRecord.id)}
            >
              {deleteRecordMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ==================== MANUAL ENTRY DIALOG ==================== */}
      <Dialog open={manualDialog} onOpenChange={setManualDialog}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Manual Attendance Entry</DialogTitle>
            <DialogDescription>Create or override an attendance record. An audit trail will be kept.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee *</Label>
              <EmployeeSelect value={manualForm.employeeId} onChange={(id) => setManualForm({ ...manualForm, employeeId: id })} placeholder="Select employee..." />
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={manualForm.date} onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Check In Time</Label>
                <Input type="time" value={manualForm.checkInTime} onChange={(e) => setManualForm({ ...manualForm, checkInTime: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Check Out Time</Label>
                <Input type="time" value={manualForm.checkOutTime} onChange={(e) => setManualForm({ ...manualForm, checkOutTime: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason / Remarks</Label>
              <Textarea value={manualForm.remarks} onChange={(e) => setManualForm({ ...manualForm, remarks: e.target.value })} rows={2} placeholder="e.g., Forgot to check in, worked from home..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialog(false)}>Cancel</Button>
            <Button onClick={() => manualMutation.mutate(manualForm)} disabled={!manualForm.employeeId || !manualForm.date || manualMutation.isPending}>
              {manualMutation.isPending ? "Saving..." : "Save Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

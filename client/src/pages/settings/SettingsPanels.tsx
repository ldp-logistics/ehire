import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Trash2, FileText, Watch, Shield, Users, Search, Mail, RotateCcw, ChevronDown, Bell, CheckCircle2, XCircle, Image, Palette, Eye, MapPin, X, ChevronsUpDown, Globe } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ONSITE_INTERVIEW_LOCATION_MAX_LENGTH } from "@shared/interviewOnsiteLocation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { cn } from "@/lib/utils";
import { useAuth, REGION_LABELS, type RegionCode } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { appendPlaceholderToEmailHtml, bodyTemplateToEditorHtml } from "@/lib/emailTemplateEditor";
import { SimpleEmailBodyEditor } from "@/components/recruitment/SimpleEmailBodyEditor";
import { toast } from "sonner";
import { formatLeaveAppliedAt } from "@shared/dateTimeFormat";

/** IANA options for org timesheet policy — all attendance rules use this timezone for work date and status. */
const POLICY_TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Server default" },
  { value: "UTC", label: "UTC" },
  { value: "Asia/Dubai", label: "Asia/Dubai" },
  { value: "Asia/Karachi", label: "Asia/Karachi" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "Europe/London", label: "Europe/London" },
];

// Roles that can be explicitly assigned to a user (grants in users.roles JSONB).
// "manager" is intentionally absent — it is derived from org structure (reporting lines).
const ASSIGNABLE_ROLES = [
  "admin", "hr", "limited_hr", "it",
  "recruiter", "hiring_manager", "onboarding_specialist", "limited_recruiter",
  "global_hr", "global_it", "global_recruiter",
  "employee",
] as const;

/** Grants that control regional scope, not job function — excluded from primary role dropdown. */
const SCOPE_GRANTS_UI = new Set(["global_hr", "global_it", "global_recruiter"]);

type UserRow = {
  id: string;
  email: string;
  role: string;
  /** Privilege grants in users.roles JSONB (admin, hr, it). Baseline users.role is usually employee. */
  additionalRoles: string[];
  employeeId: string | null;
  isActive: boolean;
  allowedModules: string[];
  employeeName: string | null;
  jobTitle: string | null;
  department: string | null;
  /** Direct branch on the login (when set, overrides employee branch for region). */
  branchId?: string | null;
  /** Resolved region of this login (via own branch, else employee's branch). null = unassigned. */
  regionCode?: string | null;
  /** Pakistan Super Region admin (regional_super_admin grant). Eligible only for admin-role users. */
  isSuperRegionAdmin?: boolean;
};

type BranchOption = { id: string; name: string; isActive?: boolean; regionCode?: string | null };

/** True when this user row is a Pakistan admin (automatic Super Region — no grant needed). */
function isPkAdminAutoSuper(u: UserRow): boolean {
  return userHasPrivilegeGrant(u, "admin") && u.regionCode === "PK";
}

const PRIV_RANK_UI: Record<string, number> = {
  admin: 10, hr: 8, limited_hr: 7, it: 6,
  recruiter: 5, hiring_manager: 4, onboarding_specialist: 4, limited_recruiter: 3,
  employee: 1,
};

const PRIVILEGE_GRANTS_UI = new Set([
  "admin", "hr", "limited_hr", "it",
  "recruiter", "hiring_manager", "onboarding_specialist", "limited_recruiter",
]);

/** Highest privilege for the primary dropdown; remainder are "additional roles". */
function splitPrimaryForUi(u: UserRow): { primary: string; additional: string[] } {
  const set = new Set<string>();
  if (PRIVILEGE_GRANTS_UI.has(u.role)) set.add(u.role);
  for (const r of u.additionalRoles ?? []) {
    if (PRIVILEGE_GRANTS_UI.has(r)) set.add(r);
  }
  const sorted = Array.from(set).sort((a, b) => (PRIV_RANK_UI[b] ?? 0) - (PRIV_RANK_UI[a] ?? 0));
  if (sorted.length === 0) return { primary: "employee", additional: [] };
  const primary = sorted[0];
  return { primary, additional: sorted.slice(1) };
}

function userHasPrivilegeGrant(u: UserRow, grant: string): boolean {
  if (u.role === grant) return true;
  return (u.additionalRoles ?? []).includes(grant);
}

/** After removing one privilege grant, compute stored `role` + `additionalRoles` (same ranking as splitPrimaryForUi). */
function computeRolesAfterRemovingGrant(u: UserRow, grantToRemove: string): { role: string; additionalRoles: string[] } | null {
  if (!userHasPrivilegeGrant(u, grantToRemove)) return null;
  const { primary, additional } = splitPrimaryForUi(u);
  const grants = new Set<string>([primary, ...additional]);
  grants.delete(grantToRemove);
  const sorted = Array.from(grants).sort((a, b) => (PRIV_RANK_UI[b] ?? 0) - (PRIV_RANK_UI[a] ?? 0));
  if (sorted.length === 0) return { role: "employee", additionalRoles: [] };
  return { role: sorted[0], additionalRoles: sorted.slice(1) };
}

/** When the primary role dropdown changes, keep the old privilege grant as an extra (checkbox list hides the current primary). */
function mergePrimaryChangeIntoAdditional(prevPrimary: string, newPrimary: string, prevAdditional: string[]): string[] {
  const set = new Set<string>(prevAdditional.filter((r) => r !== "employee" && r !== "manager"));
  if (PRIVILEGE_GRANTS_UI.has(prevPrimary) && prevPrimary !== newPrimary) {
    set.add(prevPrimary);
  }
  set.delete(newPrimary);
  return Array.from(set);
}

/** Display label for a role id (e.g. "limited_hr" → "Limited HR"). */
function roleLabel(id: string): string {
  const map: Record<string, string> = {
    admin: "Admin", hr: "HR", limited_hr: "Limited HR", it: "IT",
    recruiter: "Recruiter", hiring_manager: "Hiring Manager",
    onboarding_specialist: "Onboarding Specialist", limited_recruiter: "Limited Recruiter",
    manager: "Manager", employee: "Employee",
    global_hr: "Global HR", global_it: "Global IT", global_recruiter: "Global Recruiter",
  };
  return map[id] ?? id;
}

/**
 * Returns a combined "Function · Scope" label for the region/scope badge.
 * e.g. "HR · India North", "IT · Global", "Recruiter · Pakistan", "Global"
 */
function scopeBadgeLabel(u: UserRow): { label: string; isGlobal: boolean } {
  const allGrants = [u.role, ...(u.additionalRoles ?? [])];

  // Derive the highest-privilege function from the grants (for label prefix)
  const FUNC_RANK: Record<string, number> = {
    admin: 10, hr: 8, limited_hr: 7, it: 6,
    recruiter: 5, hiring_manager: 4, onboarding_specialist: 4, limited_recruiter: 3,
  };
  const FUNC_LABEL: Record<string, string> = {
    admin: "Admin", hr: "HR", limited_hr: "HR", it: "IT",
    recruiter: "Recruiter", hiring_manager: "Recruiter", onboarding_specialist: "HR",
    limited_recruiter: "Recruiter",
  };

  let topFunc = "";
  let topRank = -1;
  for (const g of allGrants) {
    const rank = FUNC_RANK[g] ?? -1;
    if (rank > topRank) { topRank = rank; topFunc = g; }
  }
  const funcLabel = FUNC_LABEL[topFunc] ?? "";

  // Check for narrow global scope grants
  const hasGlobalHr  = allGrants.includes("global_hr");
  const hasGlobalIt  = allGrants.includes("global_it");
  const hasGlobalRec = allGrants.includes("global_recruiter");
  const hasAnyScopeGrant = hasGlobalHr || hasGlobalIt || hasGlobalRec;

  const isGlobal =
    u.isSuperRegionAdmin ||
    isPkAdminAutoSuper(u) ||
    hasAnyScopeGrant;

  if (isGlobal) {
    const scopeLabel = funcLabel ? `${funcLabel} · Global` : "Global";
    return { label: scopeLabel, isGlobal: true };
  }

  if (u.regionCode) {
    const regionName = REGION_LABELS[u.regionCode as RegionCode] ?? u.regionCode;
    const scopeLabel = funcLabel ? `${funcLabel} · ${regionName}` : regionName;
    return { label: scopeLabel, isGlobal: false };
  }

  return { label: "No region", isGlobal: false };
}

/** Module keys and labels for access control. Must match Layout sidebar hrefs (path without leading slash). */
const MODULE_GROUPS: { title: string; modules: { key: string; label: string }[] }[] = [
  { title: "Overview", modules: [{ key: "dashboard", label: "Dashboard" }, { key: "news", label: "Company Feed" }, { key: "tasks", label: "Tasks" }] },
  { title: "People", modules: [{ key: "employees", label: "Employees" }, { key: "my-teams", label: "My teams" }, { key: "change-requests", label: "Change requests" }, { key: "org-chart", label: "Org Chart" }, { key: "recruitment", label: "Recruitment" }, { key: "onboarding", label: "Onboarding" }, { key: "offboarding", label: "Offboarding" }] },
  { title: "Operations", modules: [{ key: "shifts", label: "Shifts" }, { key: "timesheets", label: "Timesheets" }, { key: "leave", label: "Leave Calendar" }, { key: "it-support", label: "IT Support" }, { key: "rooms", label: "Rooms" }, { key: "assets", label: "Asset Management" }, { key: "visitors", label: "Visitors" }, { key: "timezones", label: "Schedule Meeting" }, { key: "emergency", label: "Emergency" }] },
  { title: "Finance & Legal", modules: [{ key: "payroll", label: "Payroll" }, { key: "loans", label: "Loans & Advances" }, { key: "expenses", label: "Expenses" }, { key: "benefits", label: "Benefits" }, { key: "salary", label: "Salary Benchmark" }, { key: "compliance", label: "Compliance" }, { key: "whistleblower", label: "Whistleblower" }, { key: "audit", label: "Audit Logs" }] },
  { title: "Growth & Culture", modules: [{ key: "performance", label: "Performance" }, { key: "goals", label: "Goals & OKRs" }, { key: "surveys", label: "Surveys" }, { key: "kudos", label: "Kudos" }, { key: "training", label: "Training LMS" }, { key: "diversity", label: "Diversity" }, { key: "succession", label: "Succession" }] },
  { title: "System", modules: [{ key: "health", label: "System Health" }, { key: "project-tracking", label: "Project Tracking" }, { key: "settings", label: "Settings" }] },
];

/** Audit Logs module is only assignable / visible to Super Region admins. */
function moduleGroupsForViewer(canAssignAudit: boolean) {
  return MODULE_GROUPS.map((g) => ({
    ...g,
    modules: g.modules.filter((m) => m.key !== "audit" || canAssignAudit),
  }));
}

export function TimezoneSettingsPanel() {
  const { user } = useAuth();

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <p className="text-sm text-muted-foreground max-w-lg">
        Time zone and date format come from your <strong>branch (location)</strong>, not personal preferences.
        HR/Admin updates them under <strong>Org structure → Branches</strong> for each office.
      </p>
      <div className="rounded-lg border bg-muted/30 px-4 py-3 max-w-md space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Effective time zone</span>
          <span className="font-medium text-foreground font-mono text-xs">{user?.timeZone ?? "—"}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Date format</span>
          <span className="font-medium text-foreground">
            {user?.dateFormat && /^mm\//i.test(user.dateFormat) ? "April 04, 2026" : "04 April 2026"}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Admin / HR / Limited HR: company image behind the avatar strip on every employee profile. Uploaded to SharePoint (same as avatars). */
export function EmployeeProfileBannerSection() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { data, isLoading } = useQuery<{ bannerUrl: string | null; updatedAt: string | null }>({
    queryKey: ["/api/settings/employee-profile-banner"],
    queryFn: async () => {
      const r = await fetch("/api/settings/employee-profile-banner", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load banner settings");
      return r.json();
    },
  });

  const bannerPreviewUrl =
    data?.bannerUrl && data?.updatedAt
      ? `${data.bannerUrl}?t=${encodeURIComponent(data.updatedAt)}`
      : data?.bannerUrl ?? null;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      setUploading(true);
      try {
        const res = await fetch("/api/settings/employee-profile-banner", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ image: reader.result as string }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(j.error || "Upload failed");
        await queryClient.invalidateQueries({ queryKey: ["/api/settings/employee-profile-banner"] });
        toast.success("Employee profile banner updated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  const remove = async () => {
    setUploading(true);
    try {
      const res = await fetch("/api/settings/employee-profile-banner", { method: "DELETE", credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Failed to remove");
      await queryClient.invalidateQueries({ queryKey: ["/api/settings/employee-profile-banner"] });
      toast.success("Banner removed. Profiles use the default gradient.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4 max-w-lg">
          <div
            className="h-28 w-full rounded-lg border border-border bg-muted/30 bg-cover bg-center"
            style={bannerPreviewUrl ? { backgroundImage: `url("${bannerPreviewUrl}")` } : undefined}
          />
          {!data?.bannerUrl && (
            <p className="text-xs text-muted-foreground">No custom banner — profiles use the blue–purple gradient.</p>
          )}
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onFile} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? "Working…" : "Upload image"}
            </Button>
            {data?.bannerUrl ? (
              <Button type="button" variant="outline" disabled={uploading} onClick={remove}>
                Remove banner
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];
const WORKING_DAY_OPTIONS: { dow: number; label: string }[] = [
  { dow: 0, label: "Sun" },
  { dow: 1, label: "Mon" },
  { dow: 2, label: "Tue" },
  { dow: 3, label: "Wed" },
  { dow: 4, label: "Thu" },
  { dow: 5, label: "Fri" },
  { dow: 6, label: "Sat" },
];

interface TimesheetPolicyDto {
  policyTimezone: string | null;
  workDayStart: string;
  workDayEnd: string;
  graceMinutes: number;
  halfDayThresholdPercent: number;
  workingDays?: number[];
  checkinWindowStartOffsetMinutes?: number;
  checkinWindowEndOffsetMinutes?: number;
  updatedAt?: string | null;
}

/** Minutes from work-day start to work-day end (same calendar day, or past midnight if end &lt; start). */
function minutesWorkDaySpan(workDayStart: string, workDayEnd: string): number {
  const parse = (t: string) => {
    const [h, m] = t.split(":").map((x) => parseInt(x, 10));
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };
  let a = parse(workDayStart);
  let b = parse(workDayEnd);
  if (b <= a) b += 24 * 60;
  return b - a;
}

function hhmmTo12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr ?? "0", 10);
  const m = parseInt(mStr ?? "0", 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Add minutes to HH:mm (same calendar day wrap at 24h). */
function addMinutesToHHMM(hhmm: string, deltaMin: number): string {
  const [hStr, mStr] = hhmm.split(":");
  let total = (parseInt(hStr ?? "0", 10) || 0) * 60 + (parseInt(mStr ?? "0", 10) || 0) + deltaMin;
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Admin/HR: org-wide work window and rules — single source of truth for timesheets & attendance status. */
export function TimesheetPolicySection() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<TimesheetPolicyDto>({
    queryKey: ["/api/attendance/timesheet-policy"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/attendance/timesheet-policy");
      return r.json();
    },
  });
  const [form, setForm] = useState({
    policyTimezone: "" as string,
    workDayStart: "09:00",
    workDayEnd: "18:00",
    graceMinutes: 15,
    halfDayThresholdPercent: 50,
    workingDays: [...DEFAULT_WORKING_DAYS] as number[],
    checkinWindowStartOffsetMinutes: -120,
    checkinWindowEndOffsetMinutes: 240,
  });
  useEffect(() => {
    if (!data) return;
    const wd = Array.isArray(data.workingDays) && data.workingDays.length > 0 ? [...data.workingDays] : [...DEFAULT_WORKING_DAYS];
    const normTime = (t: string | undefined, fallback: string) =>
      (t ?? fallback).length >= 5 ? (t ?? fallback).slice(0, 5) : fallback;
    setForm({
      policyTimezone: data.policyTimezone ?? "",
      workDayStart: normTime(data.workDayStart, "09:00"),
      workDayEnd: normTime(data.workDayEnd, "18:00"),
      graceMinutes: data.graceMinutes ?? 15,
      halfDayThresholdPercent: data.halfDayThresholdPercent ?? 50,
      workingDays: wd.sort((a, b) => a - b),
      checkinWindowStartOffsetMinutes: data.checkinWindowStartOffsetMinutes ?? -120,
      checkinWindowEndOffsetMinutes: data.checkinWindowEndOffsetMinutes ?? 240,
    });
  }, [data]);
  const [saving, setSaving] = useState(false);

  const policyPreview = useMemo(() => {
    const tz = form.policyTimezone.trim() || "UTC";
    const spanMin = minutesWorkDaySpan(form.workDayStart, form.workDayEnd);
    const spanH = (spanMin / 60).toFixed(1);
    const ciEarliest = addMinutesToHHMM(form.workDayStart, form.checkinWindowStartOffsetMinutes);
    const ciLatest = addMinutesToHHMM(form.workDayStart, form.checkinWindowEndOffsetMinutes);
    const graceEnd = addMinutesToHHMM(form.workDayStart, form.graceMinutes);
    const halfDayH = ((spanMin * form.halfDayThresholdPercent) / 100 / 60).toFixed(1);
    const workingLabels = form.workingDays
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DOW_LABELS[d] ?? String(d))
      .join(", ");
    return { tz, spanH, ciEarliest, ciLatest, graceEnd, halfDayH, workingLabels };
  }, [form]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="grid gap-4 max-w-lg">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-950 space-y-1">
            <p className="font-semibold text-sm">How this policy is applied</p>
            <p><strong>Timezone ({policyPreview.tz}):</strong> work date, late, half-day, check-in window, and reminders.</p>
            <p><strong>Working days:</strong> {policyPreview.workingLabels || "—"}. Other days → weekend status; reminders skip.</p>
            <p><strong>Work day:</strong> {hhmmTo12(form.workDayStart)} – {hhmmTo12(form.workDayEnd)} ({policyPreview.spanH} h expected).</p>
            <p><strong>Late after:</strong> {hhmmTo12(policyPreview.graceEnd)} ({form.graceMinutes} min grace).</p>
            <p><strong>Half day if worked &lt;</strong> {policyPreview.halfDayH} h ({form.halfDayThresholdPercent}% of expected).</p>
            <p><strong>Check-in allowed:</strong> {hhmmTo12(policyPreview.ciEarliest)} – {hhmmTo12(policyPreview.ciLatest)} ({policyPreview.tz}).</p>
          </div>
          <div className="grid gap-2">
            <Label>Policy timezone</Label>
            <p className="text-xs text-slate-500">
              Work dates, late/half-day rules, and org stats use this timezone. Branch timezone is only for how times appear in the UI. Choose a city that matches HQ policy (e.g. America/New_York). Leave as server default only if you intentionally use UTC.
            </p>
            <Select
              value={form.policyTimezone || " "}
              onValueChange={(v) => setForm((f) => ({ ...f, policyTimezone: v === " " ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Server default" />
              </SelectTrigger>
              <SelectContent>
                {POLICY_TIMEZONE_OPTIONS.map((opt: { value: string; label: string }) => (
                  <SelectItem key={opt.value || "default"} value={opt.value || " "}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Working days</Label>
            <p className="text-xs text-slate-500">Check-ins on unselected days get status <strong>weekend</strong>. At least one day must stay selected.</p>
            <div className="flex flex-wrap gap-3">
              {WORKING_DAY_OPTIONS.map(({ dow, label }) => (
                <label key={dow} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={form.workingDays.includes(dow)}
                    onCheckedChange={(checked) => {
                      setForm((f) => {
                        const set = new Set(f.workingDays);
                        if (checked === true) set.add(dow);
                        else set.delete(dow);
                        const next = Array.from(set).sort((a, b) => a - b);
                        return { ...f, workingDays: next.length > 0 ? next : [...DEFAULT_WORKING_DAYS] };
                      });
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="ts-start">Work day starts</Label>
              <Input
                id="ts-start"
                type="time"
                step={60}
                value={form.workDayStart}
                onChange={(e) => setForm((f) => ({ ...f, workDayStart: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ts-end">Work day ends</Label>
              <Input
                id="ts-end"
                type="time"
                step={60}
                value={form.workDayEnd}
                onChange={(e) => setForm((f) => ({ ...f, workDayEnd: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ts-grace">Grace period (minutes after start)</Label>
            <Input
              id="ts-grace"
              type="number"
              min={0}
              max={240}
              value={form.graceMinutes}
              onChange={(e) => setForm((f) => ({ ...f, graceMinutes: parseInt(e.target.value || "0", 10) || 0 }))}
            />
          </div>
          <div className="grid gap-2 rounded-lg border border-border p-3 bg-muted/20">
            <Label>Web check-in allowed window</Label>
            <p className="text-xs text-slate-500">
              Check-in is only accepted between <strong>work start + these offsets</strong> (policy timezone). This is separate from “work day ends” above — the default “latest” offset is only 4 hours after start, so afternoon check-ins are rejected unless you raise it.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="ts-ci-earliest" className="text-xs font-normal">
                  Earliest (minutes <em>before</em> work start)
                </Label>
                <Input
                  id="ts-ci-earliest"
                  type="number"
                  min={-720}
                  max={0}
                  value={form.checkinWindowStartOffsetMinutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      checkinWindowStartOffsetMinutes: parseInt(e.target.value || "0", 10) || 0,
                    }))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="ts-ci-latest" className="text-xs font-normal">
                  Latest (minutes <em>after</em> work start)
                </Label>
                <Input
                  id="ts-ci-latest"
                  type="number"
                  min={0}
                  max={1440}
                  value={form.checkinWindowEndOffsetMinutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      checkinWindowEndOffsetMinutes: parseInt(e.target.value || "0", 10) || 0,
                    }))
                  }
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  checkinWindowEndOffsetMinutes: minutesWorkDaySpan(f.workDayStart, f.workDayEnd),
                }))
              }
            >
              Set latest check-in to work day end
            </Button>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ts-half">Half-day threshold (% of expected hours)</Label>
            <p className="text-xs text-slate-500">
              If time worked is less than this share of the policy work day above, status is <strong>Half day</strong> on the timesheet.
            </p>
            <Input
              id="ts-half"
              type="number"
              min={1}
              max={100}
              value={form.halfDayThresholdPercent}
              onChange={(e) =>
                setForm((f) => ({ ...f, halfDayThresholdPercent: parseInt(e.target.value || "50", 10) || 50 }))
              }
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const r = await apiRequest("PATCH", "/api/attendance/timesheet-policy", {
                    policyTimezone: form.policyTimezone.trim() || null,
                    workDayStart: form.workDayStart,
                    workDayEnd: form.workDayEnd,
                    graceMinutes: form.graceMinutes,
                    halfDayThresholdPercent: form.halfDayThresholdPercent,
                    workingDays: form.workingDays,
                    checkinWindowStartOffsetMinutes: form.checkinWindowStartOffsetMinutes,
                    checkinWindowEndOffsetMinutes: form.checkinWindowEndOffsetMinutes,
                  });
                  await r.json();
                  await queryClient.invalidateQueries({ queryKey: ["/api/attendance/timesheet-policy"] });
                  await queryClient.invalidateQueries({ queryKey: ["/api/attendance/today"] });
                  await queryClient.invalidateQueries({ queryKey: ["/api/attendance/report"] });
                  await queryClient.invalidateQueries({ queryKey: ["/api/attendance/records"] });
                  toast.success("Timesheet policy saved. Check-in rules and reminders use these settings immediately.");
                } catch {
                  toast.error("Failed to save timesheet policy.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving…" : "Save policy"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Checkin Reminders Section ───────────────────────────────────────────────

type CheckinReminderRow = {
  id: string;
  send_time: string;
  enabled: boolean;
  notify_hr: boolean;
  notify_employee: boolean;
  label: string | null;
  sort_order: number;
  branch_ids: string[] | null;
};

type ReminderDraft = {
  id: string | null;
  sendTime: string;
  enabled: boolean;
  notifyHr: boolean;
  notifyEmployee: boolean;
  label: string;
  branchIds: string[];
};

function emptyDraft(): ReminderDraft {
  return { id: null, sendTime: "09:00", enabled: true, notifyHr: true, notifyEmployee: false, label: "", branchIds: [] };
}

function fmt12(hhmm: string): string {
  if (!hhmm) return "";
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr ?? "0", 10);
  const m = parseInt(mStr ?? "0", 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

const POLICY_TZ_LABELS: Record<string, string> = {
  "America/New_York": "US Eastern",
  "Asia/Karachi": "Pakistan",
  "Asia/Dubai": "UAE",
  "UTC": "UTC",
  "Europe/London": "UK",
};

export function CheckinRemindersSection() {
  const queryClient = useQueryClient();
  const { data: policy } = useQuery<{ policyTimezone?: string | null }>({
    queryKey: ["/api/attendance/timesheet-policy"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/attendance/timesheet-policy");
      return r.json();
    },
  });
  const policyTz = (policy?.policyTimezone ?? "").trim() || "UTC";
  const policyTzLabel = POLICY_TZ_LABELS[policyTz] ?? policyTz;
  const [policyNow, setPolicyNow] = useState("");
  useEffect(() => {
    const tick = () => {
      try {
        setPolicyNow(formatLeaveAppliedAt(new Date(), policyTz));
      } catch {
        setPolicyNow("(invalid timezone in policy)");
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [policyTz]);

  const { data: rows = [], isLoading } = useQuery<CheckinReminderRow[]>({
    queryKey: ["/api/attendance/checkin-reminders"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/attendance/checkin-reminders");
      return r.json();
    },
  });

  const { data: branchesRaw, isLoading: branchesLoading } = useQuery({
    queryKey: ["/api/departments/branches"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/departments/branches");
      return r.json() as { success?: boolean; data?: { branches?: { id: string; name: string; isActive?: boolean }[] }; branches?: { id: string; name: string; isActive?: boolean }[] };
    },
  });
  const branches: { id: string; name: string; isActive: boolean }[] = (() => {
    if (!branchesRaw) return [];
    if (Array.isArray(branchesRaw)) return branchesRaw as { id: string; name: string; isActive: boolean }[];
    const fromEnvelope = branchesRaw.data?.branches;
    if (Array.isArray(fromEnvelope)) return fromEnvelope.map((b) => ({ ...b, isActive: b.isActive !== false }));
    if (Array.isArray(branchesRaw.branches)) return branchesRaw.branches.map((b) => ({ ...b, isActive: b.isActive !== false }));
    return [];
  })();
  const activeBranches = branches.filter((b) => b.isActive !== false);

  const [editing, setEditing] = useState<ReminderDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CheckinReminderRow | null>(null);
  const [saving, setSaving] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (draft: ReminderDraft) => {
      const method = draft.id ? "PATCH" : "POST";
      const url = draft.id ? `/api/attendance/checkin-reminders/${draft.id}` : "/api/attendance/checkin-reminders";
      const r = await apiRequest(method, url, {
        id: draft.id,
        sendTime: draft.sendTime,
        enabled: draft.enabled,
        notifyHr: draft.notifyHr,
        notifyEmployee: draft.notifyEmployee,
        label: draft.label.trim() || null,
        sortOrder: 0,
        branchIds: draft.branchIds.length > 0 ? draft.branchIds : null,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/checkin-reminders"] });
      setEditing(null);
      toast.success("Reminder saved.");
    },
    onError: () => toast.error("Failed to save reminder."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/attendance/checkin-reminders/${id}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/checkin-reminders"] });
      setDeleteTarget(null);
      toast.success("Reminder deleted.");
    },
    onError: () => toast.error("Failed to delete reminder."),
  });

  const toggleEnabled = async (row: CheckinReminderRow) => {
    try {
      await apiRequest("PATCH", `/api/attendance/checkin-reminders/${row.id}`, {
        id: row.id,
        sendTime: row.send_time.slice(0, 5),
        enabled: !row.enabled,
        notifyHr: row.notify_hr,
        notifyEmployee: row.notify_employee,
        label: row.label ?? null,
        sortOrder: row.sort_order,
        branchIds: Array.isArray(row.branch_ids) && row.branch_ids.length > 0 ? row.branch_ids : null,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/checkin-reminders"] });
    } catch {
      toast.error("Failed to toggle reminder.");
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Check-in Reminders</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Reminder times use <strong>Timesheet policy timezone</strong> only (not your personal timezone or <code className="text-[10px]">DEFAULT_TIMEZONE</code> in .env). Emails send only if at least one employee has not checked in.
          </p>
          <p className="text-xs mt-1.5 rounded-md border border-blue-200 bg-blue-50 text-blue-900 px-2.5 py-1.5 font-mono">
            Policy TZ: <strong>{policyTz}</strong>
            {policyTzLabel !== policyTz ? ` (${policyTzLabel})` : ""}
            {" · "}Now: <strong>{policyNow || "…"}</strong>
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing(emptyDraft())} className="shrink-0">
          <Plus className="w-4 h-4 mr-1.5" /> Add reminder
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No reminders configured yet.</p>
          <p className="text-xs text-slate-400 mt-1">Click <strong>Add reminder</strong> to set up your first check-in notification.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                row.enabled ? "border-border bg-card" : "border-dashed border-border/60 bg-muted/30 opacity-60",
              )}
            >
              {/* Time badge */}
              <div className="shrink-0 w-20 text-center">
                <span className="text-lg font-bold font-mono text-foreground leading-none">{fmt12(row.send_time.slice(0, 5))}</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{row.label || "Check-in reminder"}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {row.notify_hr && (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                      <Mail className="w-3 h-3" /> HR digest
                    </span>
                  )}
                  {row.notify_employee && (
                    <span className="inline-flex items-center gap-1 text-xs text-violet-600 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">
                      <Bell className="w-3 h-3" /> Employee nudge
                    </span>
                  )}
                  {!row.notify_hr && !row.notify_employee && (
                    <span className="text-xs text-slate-400">No recipients selected</span>
                  )}
                  {Array.isArray(row.branch_ids) && row.branch_ids.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/></svg>
                      {row.branch_ids.length} branch{row.branch_ids.length !== 1 ? "es" : ""}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 0 1 2 2v1a2 2 0 0 0 2 2 2 2 0 0 1 2 2v2.945"/><path strokeLinecap="round" strokeLinejoin="round" d="M8 3.935V5.5A2.5 2.5 0 0 0 10.5 8h.5a2 2 0 0 1 2 2 2 2 0 0 0 4 0 2 2 0 0 1 2-2h1.064"/></svg>
                      All branches
                    </span>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="shrink-0 flex items-center gap-2">
                <Switch
                  checked={row.enabled}
                  onCheckedChange={() => toggleEnabled(row)}
                  title={row.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() =>
                    setEditing({
                      id: row.id,
                      sendTime: row.send_time.slice(0, 5),
                      enabled: row.enabled,
                      notifyHr: row.notify_hr,
                      notifyEmployee: row.notify_employee,
                      label: row.label ?? "",
                      branchIds: Array.isArray(row.branch_ids) ? row.branch_ids : [],
                    })
                  }
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.1 2.1 0 1 1 2.97 2.97L7.5 18.79l-4 1 1-4 12.362-12.303Z"/>
                  </svg>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(row)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / Add dialog */}
      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit reminder" : "Add reminder"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 pt-1">
              <div className="grid gap-1.5">
                <Label htmlFor="rem-time">
                  Send time <span className="text-slate-400 text-xs">({policyTz} — 24h clock)</span>
                </Label>
                <Input
                  id="rem-time"
                  type="time"
                  step={60}
                  value={editing.sendTime}
                  onChange={(e) => setEditing((d) => d && { ...d, sendTime: e.target.value })}
                />
                {editing.sendTime && (
                  <p className="text-xs text-slate-500">
                    = {fmt12(editing.sendTime)} in <strong>{policyTz}</strong> (same clock as above)
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rem-label">Label <span className="text-slate-400 text-xs">(optional)</span></Label>
                <Input
                  id="rem-label"
                  placeholder="e.g. Morning reminder"
                  value={editing.label}
                  onChange={(e) => setEditing((d) => d && { ...d, label: e.target.value })}
                />
              </div>

              {/* Branch filter — always visible */}
              <div className="grid gap-1.5 rounded-lg border border-amber-200/80 bg-amber-50/40 p-3">
                <Label className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/></svg>
                  Branches <span className="text-slate-400 text-xs font-normal">(optional)</span>
                </Label>
                <p className="text-xs text-slate-500">
                  Leave all unchecked = reminder applies to <strong>all branches</strong>. Check one or more to limit this reminder to those locations only.
                </p>
                {branchesLoading ? (
                  <p className="text-xs text-slate-500 py-2">Loading branches…</p>
                ) : activeBranches.length === 0 ? (
                  <p className="text-xs text-amber-800 py-2">
                    No branches found. Add branches under <strong>Org structure → Branches</strong>, then refresh this page.
                  </p>
                ) : (
                  <>
                    <div className="rounded-md border border-border bg-background p-3 max-h-40 overflow-y-auto space-y-2">
                      {activeBranches.map((b) => (
                        <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={editing.branchIds.includes(b.id)}
                            onCheckedChange={(checked) =>
                              setEditing((d) => {
                                if (!d) return d;
                                const set = new Set(d.branchIds);
                                if (checked === true) set.add(b.id);
                                else set.delete(b.id);
                                return { ...d, branchIds: Array.from(set) };
                              })
                            }
                          />
                          {b.name}
                        </label>
                      ))}
                    </div>
                    {editing.branchIds.length > 0 && (
                      <button
                        type="button"
                        className="text-xs text-slate-500 underline hover:text-slate-700 text-left"
                        onClick={() => setEditing((d) => d && { ...d, branchIds: [] })}
                      >
                        Clear selection (use all branches)
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/20">
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Who receives this reminder?</p>
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={editing.notifyHr}
                    onCheckedChange={(v) => setEditing((d) => d && { ...d, notifyHr: v === true })}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">HR digest</p>
                    <p className="text-xs text-slate-500">A summary email listing all missing employees goes to HR and Limited HR users.</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={editing.notifyEmployee}
                    onCheckedChange={(v) => setEditing((d) => d && { ...d, notifyEmployee: v === true })}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">Employee nudge</p>
                    <p className="text-xs text-slate-500">Each employee who hasn't checked in gets an individual reminder email at their work email address.</p>
                  </div>
                </label>
              </div>

              <div className="flex items-center gap-3 justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={editing.enabled}
                    onCheckedChange={(v) => setEditing((d) => d && { ...d, enabled: v })}
                  />
                  <span className="text-sm">{editing.enabled ? "Enabled" : "Disabled"}</span>
                </label>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button
                    disabled={saveMutation.isPending || !editing.sendTime}
                    onClick={() => saveMutation.mutate(editing)}
                  >
                    {saveMutation.isPending ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete reminder?</AlertDialogTitle>
            <AlertDialogDescription>
              The <strong>{deleteTarget?.label || fmt12(deleteTarget?.send_time?.slice(0, 5) ?? "")}</strong> reminder slot will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type RoleCatalogRow = {
  id: string;
  title: string;
  tagline: string;
  permissions: string[];
  restrictions?: string[];
  userCount: number;
  activeUserCount: number;
  orgDerived?: boolean;
  /** Employee card uses total accounts; admin/hr/it use grant + primary; manager uses stored only (0). */
  countScope?: "all_users" | "stored_role" | "grant_or_primary";
};

function userInitials(u: UserRow): string {
  const name = u.employeeName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return u.email[0]?.toUpperCase() || "?";
}

function displayName(u: UserRow): string {
  if (u.employeeName?.trim()) return u.employeeName.trim();
  return u.email.split("@")[0] || u.email;
}

/** Searchable combobox for picking a user (User Access → role modal → Choose user). */
function SearchableUserPicker({
  users,
  onSelect,
  placeholder,
  disabled,
  emptyMessage = "No users found.",
}: {
  users: UserRow[];
  onSelect: (userId: string) => void;
  placeholder: string;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-9 text-sm font-normal"
          disabled={disabled}
        >
          <span className="truncate text-muted-foreground">{placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by email or name…" />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {users.map((row) => (
                <CommandItem
                  key={row.id}
                  value={`${row.email} ${row.employeeName ?? ""} ${row.jobTitle ?? ""} ${row.role}`}
                  onSelect={() => {
                    onSelect(row.id);
                    setOpen(false);
                  }}
                >
                  <div className="flex flex-col min-w-0 w-full">
                    <span className="text-sm font-medium truncate">{displayName(row)}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {row.email}
                      <span className="capitalize"> · {roleLabel(row.role)}</span>
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type EmployeeOption = { id: string; first_name: string; last_name: string; job_title: string; department: string; work_email?: string };

/** Modal: users in one role — search, full edit (role, employee, active, module overrides), assign, add new. */
function RoleUsersDialog({
  open,
  onOpenChange,
  roleId,
  roleTitle,
  users,
  employees,
  currentUserId,
  onPatchUser,
  saveUserAsync,
  onToggleSuperRegion,
  superRegionPending,
  canManageSuperRegion,
  selectableBranches,
  onAddUserWithRole,
  onRequestDeleteUser,
  patchPending,
  usersLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleId: string;
  roleTitle: string;
  users: UserRow[];
  employees: EmployeeOption[];
  currentUserId?: string | null;
  onPatchUser: (args: { id: string; role?: string; employeeId?: string | null; branchId?: string | null; isActive?: boolean; allowedModules?: string[]; additionalRoles?: string[] }) => void;
  saveUserAsync: (args: { id: string; role?: string; employeeId?: string | null; branchId?: string | null; isActive?: boolean; allowedModules?: string[]; additionalRoles?: string[] }) => Promise<unknown>;
  onToggleSuperRegion?: (userId: string, grant: boolean) => void;
  superRegionPending?: boolean;
  /** Only Super Region / HQ admins may grant regional_super_admin. */
  canManageSuperRegion?: boolean;
  selectableBranches?: BranchOption[];
  onAddUserWithRole: (roleIdForNewUser: string) => void;
  onRequestDeleteUser: (u: UserRow) => void;
  patchPending: boolean;
  usersLoading?: boolean;
}) {
  const [q, setQ] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editAdditionalRoles, setEditAdditionalRoles] = useState<string[]>([]);
  const [editEmployeeId, setEditEmployeeId] = useState("");
  const [editBranchId, setEditBranchId] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editUseRoleBased, setEditUseRoleBased] = useState(true);
  const [editAllowedModules, setEditAllowedModules] = useState<string[]>([]);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [grantRemovalTarget, setGrantRemovalTarget] = useState<UserRow | null>(null);
  const moduleGroups = moduleGroupsForViewer(canManageSuperRegion === true);

  const beginEdit = (u: UserRow) => {
    setEditingUserId(u.id);
    const { primary, additional } = splitPrimaryForUi(u);
    setEditRole(primary);
    setEditAdditionalRoles(additional);
    setEditEmployeeId(u.employeeId || "");
    setEditBranchId(u.branchId || "");
    setEditActive(u.isActive);
    const mods = (u.allowedModules ?? []).filter((k) => k !== "audit" || canManageSuperRegion === true);
    setEditAllowedModules(mods);
    setEditUseRoleBased(mods.length === 0);
    setModulesOpen(true);
  };

  const cancelEdit = () => {
    setEditingUserId(null);
  };

  const toggleEditModule = (key: string, checked: boolean) => {
    setEditAllowedModules((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));
  };

  const toggleAdditionalRole = (r: string, checked: boolean) => {
    setEditAdditionalRoles((prev) => (checked ? [...prev, r] : prev.filter((x) => x !== r)));
  };

  useEffect(() => {
    if (!open) {
      setQ("");
      setEditingUserId(null);
      setGrantRemovalTarget(null);
    }
  }, [open]);

  const isEmployeeBaseline = roleId === "employee";

  const activeInRole = useMemo(
    () =>
      isEmployeeBaseline
        ? users.filter((u) => u.isActive).length
        : users.filter((u) => userHasPrivilegeGrant(u, roleId) && u.isActive).length,
    [users, roleId, isEmployeeBaseline],
  );

  const inRoleFiltered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const matchesRoleCard = (u: UserRow) => {
      if (isEmployeeBaseline) return true;
      if (roleId === "manager") return false;
      return userHasPrivilegeGrant(u, roleId);
    };
    return users
      .filter((u) => matchesRoleCard(u))
      .filter((u) => {
        if (!qq) return true;
        return (
          u.email.toLowerCase().includes(qq) ||
          (u.employeeName || "").toLowerCase().includes(qq) ||
          (u.jobTitle || "").toLowerCase().includes(qq)
        );
      })
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.email.localeCompare(b.email);
      });
  }, [users, roleId, q, isEmployeeBaseline]);

  const assignable = useMemo(() => {
    const pureEmployee = (u: UserRow) => u.role === "employee" && (u.additionalRoles?.length ?? 0) === 0;
    if (isEmployeeBaseline) {
      return users.filter((u) => u.isActive && !pureEmployee(u)).sort((a, b) => a.email.localeCompare(b.email));
    }
    return users.filter((u) => u.isActive && !userHasPrivilegeGrant(u, roleId)).sort((a, b) => a.email.localeCompare(b.email));
  }, [users, roleId, isEmployeeBaseline]);

  const canRemoveThisRoleFromList =
    !isEmployeeBaseline && roleId !== "manager" && PRIVILEGE_GRANTS_UI.has(roleId);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] flex flex-col gap-4 w-[96vw] max-w-3xl overflow-y-auto">
        <DialogHeader className="text-left space-y-1 pr-8 shrink-0">
          <DialogTitle className="text-lg leading-snug">
            {roleTitle}{" "}
            <span className="text-muted-foreground font-normal">({activeInRole} active)</span>
          </DialogTitle>
        </DialogHeader>

        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8"
            placeholder={isEmployeeBaseline ? "Search all users…" : "Search users in this role…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <ScrollArea className="h-[min(52vh,420px)] rounded-md border border-border pr-3 shrink-0">
          <div className="space-y-2 p-2">
            {usersLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading users…</p>
            ) : inRoleFiltered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center px-2">
                {isEmployeeBaseline ? "No users match your search." : "No users match this role and search."}
              </p>
            ) : (
              inRoleFiltered.map((u) => (
                <div
                  key={u.id}
                  className={cn(
                    "rounded-lg border border-border bg-muted/15 overflow-hidden",
                    !u.isActive && "opacity-80",
                    editingUserId === u.id && "ring-2 ring-primary/30",
                  )}
                >
                  {editingUserId === u.id ? (
                    <div className="p-3 sm:p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-end">
                        <div className="min-w-0 flex-1 sm:min-w-[140px]">
                          <p className="text-sm font-semibold text-foreground">{displayName(u)}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {u.jobTitle || "—"}
                            {u.department ? ` · ${u.department}` : ""}
                          </p>
                        </div>
                        <div className="space-y-1 shrink-0">
                          <Label className="text-xs">Primary role</Label>
                          <Select
                            value={editRole}
                            onValueChange={(newPrimary) => {
                              setEditAdditionalRoles((prevAdd) => mergePrimaryChangeIntoAdditional(editRole, newPrimary, prevAdd));
                              setEditRole(newPrimary);
                            }}
                            disabled={patchPending}
                          >
                            <SelectTrigger className="w-[140px] h-9 capitalize">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ASSIGNABLE_ROLES.filter((r) => r !== "employee" && !SCOPE_GRANTS_UI.has(r)).map((r) => (
                                <SelectItem key={r} value={r}>
                                  {roleLabel(r)}
                                </SelectItem>
                              ))}
                              <SelectItem value="employee">Employee (baseline)</SelectItem>
                              <SelectItem value="manager" disabled className="opacity-50 cursor-not-allowed">
                                Manager (org-derived — set via reporting lines)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 flex-1 min-w-[180px]">
                          <Label className="text-xs">Link to employee</Label>
                          <Select
                            value={editEmployeeId || "__none__"}
                            onValueChange={(v) => setEditEmployeeId(v === "__none__" ? "" : v)}
                            disabled={patchPending}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">None</SelectItem>
                              {employees.map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.first_name} {e.last_name}
                                  {e.job_title ? ` · ${e.job_title}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 flex-1 min-w-[180px]">
                          <Label className="text-xs flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> Branch / region
                          </Label>
                          <Select
                            value={editBranchId || "__none__"}
                            onValueChange={(v) => setEditBranchId(v === "__none__" ? "" : v)}
                            disabled={patchPending}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Select branch" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">
                                {editEmployeeId ? "Use linked employee's branch" : "Unassigned (no region)"}
                              </SelectItem>
                              {(selectableBranches ?? []).map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.name}
                                  {b.regionCode ? ` · ${REGION_LABELS[b.regionCode as RegionCode] ?? b.regionCode}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2 pb-1">
                          <Label className="text-xs whitespace-nowrap">Active</Label>
                          <Switch checked={editActive} onCheckedChange={setEditActive} disabled={patchPending} />
                        </div>
                      </div>

                      {/* Additional roles — access stacks on top of the primary role */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Additional roles</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Grants extra access on top of primary. If you change primary (e.g. IT → Admin), the previous role is kept here automatically. Manager is org-derived only.
                        </p>
                        <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-0.5">
                          {ASSIGNABLE_ROLES.filter((r) => r !== editRole && r !== "employee" && !SCOPE_GRANTS_UI.has(r)).map((r) => (
                            <div key={r} className="flex items-center gap-1.5">
                              <Checkbox
                                id={`dlg-xrole-${u.id}-${r}`}
                                checked={editAdditionalRoles.includes(r)}
                                onCheckedChange={(v) => toggleAdditionalRole(r, !!v)}
                                disabled={patchPending}
                              />
                              <Label htmlFor={`dlg-xrole-${u.id}-${r}`} className="text-xs font-normal cursor-pointer">
                                {roleLabel(r)}
                              </Label>
                            </div>
                          ))}
                        </div>
                        {/* Cross-region scope grants — only Super Region admins can manage these */}
                        {canManageSuperRegion ? (
                          <>
                            <p className="text-[11px] text-muted-foreground pt-1 font-medium">Cross-region scope</p>
                            <p className="text-[11px] text-muted-foreground">
                              Extends the user's reach to all regions for their function. Assign alongside the matching function role (hr, it, recruiter).
                            </p>
                            <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-0.5">
                              {Array.from(SCOPE_GRANTS_UI).map((r) => (
                                <div key={r} className="flex items-center gap-1.5">
                                  <Checkbox
                                    id={`dlg-xrole-${u.id}-${r}`}
                                    checked={editAdditionalRoles.includes(r)}
                                    onCheckedChange={(v) => toggleAdditionalRole(r, !!v)}
                                    disabled={patchPending}
                                  />
                                  <Label htmlFor={`dlg-xrole-${u.id}-${r}`} className="text-xs font-normal cursor-pointer">
                                    {roleLabel(r)}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : null}
                        {editAdditionalRoles.length > 0 && (
                          <p className="text-[11px] text-blue-600 dark:text-blue-400">
                            Active: primary <strong className="capitalize">{editRole}</strong> + <strong className="capitalize">{editAdditionalRoles.join(", ")}</strong>
                          </p>
                        )}
                      </div>

                      <Collapsible open={modulesOpen} onOpenChange={setModulesOpen} className="w-full">
                        <CollapsibleTrigger asChild>
                          <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto">
                            Modules ({editUseRoleBased ? "role-based" : editAllowedModules.length})
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-3 space-y-3 border-t border-border/60 mt-3">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`dlg-use-role-${u.id}`}
                              checked={editUseRoleBased}
                              onCheckedChange={(v) => {
                                setEditUseRoleBased(!!v);
                                if (v) setEditAllowedModules([]);
                              }}
                              disabled={patchPending}
                            />
                            <Label htmlFor={`dlg-use-role-${u.id}`} className="text-sm font-normal cursor-pointer">
                              Use role-based access (default for their role)
                            </Label>
                          </div>
                          {!editUseRoleBased &&
                            moduleGroups.map((grp) => (
                              <div key={grp.title} className="space-y-1.5">
                                <p className="text-xs font-medium text-muted-foreground">{grp.title}</p>
                                <div className="flex flex-wrap gap-x-4 gap-y-1">
                                  {grp.modules.map((m) => (
                                    <div key={m.key} className="flex items-center gap-2">
                                      <Checkbox
                                        id={`dlg-mod-${u.id}-${m.key}`}
                                        checked={editAllowedModules.includes(m.key)}
                                        onCheckedChange={(v) => toggleEditModule(m.key, !!v)}
                                        disabled={patchPending}
                                      />
                                      <Label htmlFor={`dlg-mod-${u.id}-${m.key}`} className="text-xs font-normal cursor-pointer">
                                        {m.label}
                                      </Label>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                        </CollapsibleContent>
                      </Collapsible>

                      {userHasPrivilegeGrant(u, "admin") && onToggleSuperRegion && (() => {
                        const pkAdminAutoSuper = isPkAdminAutoSuper(u);
                        const superActive = u.isSuperRegionAdmin === true || pkAdminAutoSuper;
                        const toggleDisabled =
                          superRegionPending || !canManageSuperRegion || pkAdminAutoSuper;
                        return (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-500/10 p-3">
                          <Checkbox
                            id={`dlg-super-region-${u.id}`}
                            checked={superActive}
                            onCheckedChange={(v) => onToggleSuperRegion(u.id, !!v)}
                            disabled={toggleDisabled}
                          />
                          <div className="space-y-0.5">
                            <Label
                              htmlFor={`dlg-super-region-${u.id}`}
                              className={`text-sm font-medium text-amber-800 dark:text-amber-300 ${!toggleDisabled ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
                            >
                              🌐 Super Region Admin (Pakistan)
                            </Label>
                            <p className="text-[11px] text-muted-foreground">
                              Can view and modify records across <strong>all regions</strong> (PK, US, IN-N, IN-S). Applies immediately.
                            </p>
                            {pkAdminAutoSuper ? (
                              <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                                Automatic for Pakistan admins — no grant required.
                              </p>
                            ) : !canManageSuperRegion ? (
                              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                                Only a Super Region admin can grant or revoke this.
                              </p>
                            ) : null}
                          </div>
                        </div>
                        );
                      })()}

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          disabled={patchPending}
                          onClick={() => {
                            void (async () => {
                              try {
                                await saveUserAsync({
                                  id: u.id,
                                  role: editRole,
                                  additionalRoles: editAdditionalRoles.filter((r) => r !== editRole),
                                  employeeId: editEmployeeId || null,
                                  branchId: editBranchId || null,
                                  isActive: editActive,
                                  allowedModules: editUseRoleBased ? [] : editAllowedModules,
                                });
                                cancelEdit();
                              } catch {
                                /* toast from mutation */
                              }
                            })();
                          }}
                        >
                          {patchPending ? "Saving…" : "Save"}
                        </Button>
                        <Button size="sm" variant="ghost" type="button" disabled={patchPending} onClick={cancelEdit}>
                          Cancel
                        </Button>
                      </div>
                      <div className="pt-2 border-t border-border/60">
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 text-xs"
                          disabled={patchPending || currentUserId === u.id}
                          onClick={() => {
                            cancelEdit();
                            onRequestDeleteUser(u);
                          }}
                        >
                          Permanently delete account…
                        </Button>
                        {currentUserId === u.id && (
                          <p className="text-[11px] text-muted-foreground mt-1">You cannot delete your own account.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3 p-3">
                      <Avatar className="h-10 w-10 border border-border shrink-0">
                        <AvatarImage src={u.employeeId ? `/api/employees/${u.employeeId}/avatar` : undefined} />
                        <AvatarFallback className="text-xs">{userInitials(u)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-primary">{displayName(u)}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        {!u.isActive && (
                          <Badge variant="secondary" className="mt-1 text-[10px] h-5">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {roleLabel(u.role)}
                      </Badge>
                      {u.additionalRoles?.filter((r) => r !== u.role && !SCOPE_GRANTS_UI.has(r)).map((r) => (
                        <Badge key={r} variant="secondary" className="shrink-0 text-[10px]">
                          +{roleLabel(r)}
                        </Badge>
                      ))}
                      {(() => {
                        const { label, isGlobal } = scopeBadgeLabel(u);
                        if (isGlobal) return (
                          <Badge className="shrink-0 text-[10px] gap-1 bg-amber-500 hover:bg-amber-500 text-white">
                            <Globe className="h-3 w-3" /> {label}
                          </Badge>
                        );
                        if (u.regionCode) return (
                          <Badge variant="outline" className="shrink-0 text-[10px] gap-1 border-violet-300 text-violet-700 dark:text-violet-300">
                            <MapPin className="h-3 w-3" /> {label}
                          </Badge>
                        );
                        return (
                          <Badge variant="outline" className="shrink-0 text-[10px] border-amber-300 text-amber-700">
                            No region
                          </Badge>
                        );
                      })()}
                      <Button size="sm" variant="secondary" type="button" onClick={() => beginEdit(u)} disabled={patchPending}>
                        Edit
                      </Button>
                      {canRemoveThisRoleFromList && userHasPrivilegeGrant(u, roleId) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                          disabled={patchPending || currentUserId === u.id}
                          title={
                            currentUserId === u.id
                              ? "You cannot change your own roles here"
                              : `Remove ${roleLabel(roleId)} from this user (account stays)`
                          }
                          onClick={() => setGrantRemovalTarget(u)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/20 p-3 shrink-0">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add existing user to this role</Label>
          <p className="text-[11px] text-muted-foreground">
            {isEmployeeBaseline
              ? "Everyone already has employee-level access. Use this only to set someone’s stored role to Employee (e.g. remove Admin or HR). Only users who are not already stored as Employee appear below."
              : "Grants this role to the user. Their existing roles and access are preserved."}
          </p>
          <SearchableUserPicker
            users={assignable}
            disabled={patchPending || assignable.length === 0}
            placeholder={assignable.length === 0 ? "No other users to assign" : "Choose user…"}
            emptyMessage="No matching users."
            onSelect={(id) => {
              const row = users.find((x) => x.id === id);
              if (!row) return;
              onPatchUser({
                id: row.id,
                role: row.role,
                additionalRoles: (() => {
                  const g = new Set(row.additionalRoles ?? []);
                  if (row.role !== roleId) g.add(roleId);
                  return Array.from(g);
                })(),
                employeeId: row.employeeId,
                isActive: row.isActive,
                allowedModules: row.allowedModules,
              });
            }}
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end shrink-0">
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onAddUserWithRole(roleId);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add new login with this role
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!grantRemovalTarget} onOpenChange={(o) => !o && setGrantRemovalTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {roleLabel(roleId)}?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove the <strong>{roleLabel(roleId)}</strong> role from{" "}
            <strong>{grantRemovalTarget?.email}</strong>? Their login stays active; other roles are unchanged. To delete
            the account entirely, open <strong>Edit</strong> and use &quot;Permanently delete account…&quot;.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              const row = grantRemovalTarget;
              if (!row) return;
              const next = computeRolesAfterRemovingGrant(row, roleId);
              if (!next) {
                toast.error("Could not update roles.");
                setGrantRemovalTarget(null);
                return;
              }
              setGrantRemovalTarget(null);
              void (async () => {
                try {
                  await saveUserAsync({
                    id: row.id,
                    role: next.role,
                    additionalRoles: next.additionalRoles.filter((r) => r !== next.role),
                    employeeId: row.employeeId,
                    isActive: row.isActive,
                    allowedModules: row.allowedModules ?? [],
                  });
                } catch {
                  /* mutation onError toast */
                }
              })();
            }}
          >
            Remove role
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

/** Role catalog with live counts — embedded in User access (compact = right column / sticky panel). */
function RoleDefinitionsPanel({
  onOpenRoleUsers,
}: {
  onOpenRoleUsers?: (roleId: string, title: string) => void;
}) {
  const { data, isLoading, isError } = useQuery<{
    roles: RoleCatalogRow[];
    otherRoles: Array<{ role: string; userCount: number; activeUserCount: number }>;
  }>({
    queryKey: ["/api/auth/roles/catalog"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/auth/roles/catalog");
      return r.json();
    },
  });

  const orderedRoles = useMemo(() => {
    if (!data?.roles) return [];
    const rank: Record<string, number> = {
      admin: 100,
      hr: 95,
      limited_hr: 90,
      recruiter: 85,
      limited_recruiter: 80,
      onboarding_specialist: 75,
      hiring_manager: 70,
      it: 65,
      manager: 60,
      employee: 10,
    };
    return [...data.roles].sort((a, b) => (rank[b.id] ?? 0) - (rank[a.id] ?? 0));
  }, [data?.roles]);

  return (
    <div className="space-y-3">
      {isLoading && <p className="text-sm text-muted-foreground">Loading roles…</p>}
      {isError && <p className="text-sm text-destructive">Could not load role catalog.</p>}

      {data && (
        <>
          <Card className="overflow-hidden border-border/80">
            <CardContent className="p-0">
              <div className="divide-y divide-border/80">
                {orderedRoles.map((r) => {
                  const isOrgDerived = r.orgDerived === true;
                  const isClickable = !isOrgDerived && !!onOpenRoleUsers;
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        "flex items-start justify-between gap-3 px-4 py-3.5",
                        isClickable && "cursor-pointer hover:bg-muted/40 transition-colors",
                      )}
                      role={isClickable ? "button" : undefined}
                      tabIndex={isClickable ? 0 : undefined}
                      onClick={() => isClickable && onOpenRoleUsers?.(r.id, r.title)}
                      onKeyDown={(e) => {
                        if (!isClickable) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpenRoleUsers?.(r.id, r.title);
                        }
                      }}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{r.title}</h3>
                          <Badge variant="secondary" className="text-[9px] uppercase tracking-wide font-mono px-1.5 py-0 h-5">
                            {r.id}
                          </Badge>
                          {isOrgDerived && (
                            <Badge variant="outline" className="text-[9px] uppercase tracking-wide font-mono px-1.5 py-0 h-5 border-amber-400 text-amber-700 dark:text-amber-400">
                              auto
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{r.tagline}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-1 rounded border border-border/80 bg-background px-2 py-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold tabular-nums">{r.activeUserCount}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {data.otherRoles.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/20">
              <CardHeader className="pb-2 px-3 pt-3">
                <CardTitle className="text-xs">Other roles in DB</CardTitle>
                <CardDescription className="text-xs">
                  Not in catalog — fix assignments or migrate data.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-1 px-3 pb-3">
                {data.otherRoles.map((o) => (
                  <div key={o.role} className="flex justify-between gap-2">
                    <code className="text-[10px] bg-background px-1 py-0.5 rounded">{o.role}</code>
                    <span className="text-muted-foreground tabular-nums shrink-0">
                      {o.activeUserCount}/{o.userCount}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/** Admin-only: list users, add user (register), edit role & link to employee */
export function UserAccessSection() {
  const queryClient = useQueryClient();
  const addUserCardRef = useRef<HTMLDivElement>(null);
  const [roleUsersModal, setRoleUsersModal] = useState<{ roleId: string; title: string } | null>(null);
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addRole, setAddRole] = useState<string>("employee");
  const [addEmployeeId, setAddEmployeeId] = useState<string>("");
  const [addBranchId, setAddBranchId] = useState<string>("");
  const [addUseMicrosoft, setAddUseMicrosoft] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ id: string; email: string } | null>(null);

  const { user, isSuperRegionAdmin, regionCode } = useAuth();
  const { data: users = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ["/api/auth/users"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/auth/users");
      return r.json();
    },
  });

  const { data: employeesRaw } = useQuery<Array<{ id: string; first_name: string; last_name: string; job_title: string; department: string; work_email?: string }>>({
    // Dedicated key — don't share cache with region-scoped list queries (withRegionView appends ?region=).
    queryKey: ["/api/employees", "user-access"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/employees");
      const json = await r.json();
      if (Array.isArray(json)) return json;
      return Array.isArray(json?.data) ? json.data : [];
    },
  });
  const employees = Array.isArray(employeesRaw) ? employeesRaw : [];

  // Branches drive the region a new login lands in (multi-region access control).
  const { data: branchesRaw } = useQuery<{ data?: { branches?: BranchOption[] }; branches?: BranchOption[] }>({
    queryKey: ["/api/departments/branches"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/departments/branches");
      return r.json();
    },
  });
  const allBranches: BranchOption[] = Array.isArray(branchesRaw)
    ? (branchesRaw as BranchOption[])
    : branchesRaw?.data?.branches ?? branchesRaw?.branches ?? [];

  // Regional (non-super) admins may only place new users in their own region.
  const isSuperRegionViewer = isSuperRegionAdmin || !regionCode;
  const canManageSuperRegion = isSuperRegionAdmin || !regionCode;
  const selectableBranches = isSuperRegionViewer
    ? allBranches
    : allBranches.filter((b) => b.regionCode === user?.regionCode);

  const registerMutation = useMutation({
    mutationFn: async (body: { email: string; password: string; role: string; employeeId?: string | null; authProvider?: "local" | "microsoft"; branchId?: string | null }) => {
      const r = await apiRequest("POST", "/api/auth/register", body);
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Registration failed");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/roles/catalog"] });
      toast.success("User created");
      setAddEmail(""); setAddPassword(""); setAddRole("employee"); setAddEmployeeId(""); setAddBranchId(""); setAddUseMicrosoft(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, role, employeeId, branchId, isActive, allowedModules, additionalRoles }: { id: string; role?: string; employeeId?: string | null; branchId?: string | null; isActive?: boolean; allowedModules?: string[]; additionalRoles?: string[] }) => {
      const r = await apiRequest("PATCH", `/api/auth/users/${id}`, { role, employeeId, branchId, isActive, allowedModules, additionalRoles });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Update failed");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/roles/catalog"] });
      toast.success("User updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/auth/users/${id}`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Delete failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/roles/catalog"] });
      setUserToDelete(null);
      toast.success("User deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Grant/revoke Pakistan Super Region admin (regional_super_admin) — admin users only.
  const superRegionMutation = useMutation({
    mutationFn: async ({ id, grant }: { id: string; grant: boolean }) => {
      const r = await apiRequest("PATCH", `/api/auth/users/${id}/super-region`, { grant });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Update failed");
      }
      return r.json();
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      toast.success(vars.grant ? "Super Region access granted" : "Super Region access revoked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Guard: find employees linked to multiple users
  const linkedEmployeeIds = users.filter((u) => u.employeeId).map((u) => u.employeeId!);
  const duplicateEmployeeIds = new Set(linkedEmployeeIds.filter((eid, i) => linkedEmployeeIds.indexOf(eid) !== i));
  // Employees with no user account
  const linkedSet = new Set(linkedEmployeeIds);
  const unlinkedEmployees = employees.filter((e) => !linkedSet.has(e.id));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
      <div className="space-y-10 w-full">
        <section className="space-y-6" aria-labelledby="user-access-add-heading">
          <h3 id="user-access-add-heading" className="sr-only">
            Add user
          </h3>
          <div ref={addUserCardRef}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Add user
                </CardTitle>
                <CardDescription>
                  Create a new login. They can sign in with email and password (or SSO if configured).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="user@company.com" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={addPassword}
                onChange={(e) => setAddPassword(e.target.value)}
                placeholder={addUseMicrosoft ? "Leave blank for SSO only" : "Min 8 characters"}
              />
              {addEmployeeId && (
                <p className="text-xs text-muted-foreground">Work emails use Microsoft sign-in. They can use <strong>Sign in with Microsoft</strong> or the password above.</p>
              )}
            </div>
            {addEmployeeId && (
              <div className="space-y-2 flex items-center gap-2">
                <Checkbox id="add-use-microsoft" checked={addUseMicrosoft} onCheckedChange={(c) => setAddUseMicrosoft(!!c)} />
                <Label htmlFor="add-use-microsoft" className="text-sm font-normal cursor-pointer">Use Microsoft sign-in (no password needed)</Label>
              </div>
            )}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={addRole} onValueChange={setAddRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.filter((r) => r !== "employee" && !SCOPE_GRANTS_UI.has(r)).map((r) => (
                    <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                  ))}
                  <SelectItem value="employee">Employee (baseline)</SelectItem>
                  <SelectItem value="manager" disabled className="opacity-50 cursor-not-allowed">
                    Manager (auto — set via reporting lines)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Link to employee (optional)</Label>
              <Select
                value={addEmployeeId || "__none__"}
                onValueChange={(v) => {
                  const empId = v === "__none__" ? "" : v;
                  setAddEmployeeId(empId);
                  if (empId) {
                    const emp = employees.find((e) => e.id === empId);
                    if (emp?.work_email) setAddEmail(emp.work_email);
                  } else {
                    setAddUseMicrosoft(false);
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.first_name} {e.last_name} {e.job_title ? ` · ${e.job_title}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                Branch / region
              </Label>
              <Select
                value={addBranchId || "__none__"}
                onValueChange={(v) => setAddBranchId(v === "__none__" ? "" : v)}
                disabled={!isSuperRegionViewer && selectableBranches.length === 0}
              >
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {addEmployeeId ? "Use linked employee's branch" : "Unassigned (no region)"}
                  </SelectItem>
                  {selectableBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                      {b.regionCode ? ` · ${REGION_LABELS[b.regionCode as RegionCode] ?? b.regionCode}` : " · No region"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {addEmployeeId
                  ? "Leave blank to inherit the region from the linked employee’s branch."
                  : isSuperRegionViewer
                    ? "Determines which region this login can see. Leave blank for an unassigned (no-region) login."
                    : `New logins are scoped to your region (${user?.regionCode ? REGION_LABELS[user.regionCode as RegionCode] ?? user.regionCode : "—"}).`}
              </p>
            </div>
          </div>
          <Button
            disabled={!addEmail || (!addUseMicrosoft && addPassword.length < 8) || registerMutation.isPending}
            onClick={() =>
              registerMutation.mutate({
                email: addEmail.trim(),
                password: addPassword,
                role: addRole,
                employeeId: addEmployeeId || null,
                authProvider: addUseMicrosoft ? "microsoft" : "local",
                branchId: addBranchId || null,
              })
            }
          >
            {registerMutation.isPending ? "Creating…" : "Create user"}
          </Button>
        </CardContent>
            </Card>
          </div>

          {duplicateEmployeeIds.size > 0 && (
            <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20">
              <CardContent className="pt-4">
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                  Warning: {duplicateEmployeeIds.size} employee(s) linked to multiple user accounts. Each employee should have
                  only one login.
                </p>
              </CardContent>
            </Card>
          )}
          {unlinkedEmployees.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
              <CardContent className="pt-4">
                <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                  {unlinkedEmployees.length} employee(s) have no user account and cannot log in.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {unlinkedEmployees.slice(0, 5).map((e) => `${e.first_name} ${e.last_name}`).join(", ")}
                  {unlinkedEmployees.length > 5 ? ` and ${unlinkedEmployees.length - 5} more` : ""}
                </p>
              </CardContent>
            </Card>
          )}
        </section>

        <section className="space-y-4" aria-labelledby="user-access-roles-heading">
          <Separator />
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600 shrink-0" />
            <h3
              id="user-access-roles-heading"
              className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight"
            >
              Manage roles
            </h3>
          </div>
          <p className="text-sm text-muted-foreground -mt-1">
            Each card summarizes what that role can do. Click a card to list members, remove that role from someone (trash
            icon), edit access, or permanently delete an account from <strong>Edit</strong>.
          </p>
          <RoleDefinitionsPanel onOpenRoleUsers={(roleId, title) => setRoleUsersModal({ roleId, title })} />
        </section>
      </div>

      {roleUsersModal && (
        <RoleUsersDialog
          open
          onOpenChange={(open) => !open && setRoleUsersModal(null)}
          roleId={roleUsersModal.roleId}
          roleTitle={roleUsersModal.title}
          users={users}
          employees={employees}
          currentUserId={user?.id}
          usersLoading={isLoading}
          patchPending={updateMutation.isPending}
          onPatchUser={(args) => updateMutation.mutate(args)}
          saveUserAsync={(args) => updateMutation.mutateAsync(args)}
          onToggleSuperRegion={(id, grant) => superRegionMutation.mutate({ id, grant })}
          superRegionPending={superRegionMutation.isPending}
          canManageSuperRegion={canManageSuperRegion}
          selectableBranches={selectableBranches}
          onRequestDeleteUser={(u) => setUserToDelete({ id: u.id, email: u.email })}
          onAddUserWithRole={(rid) => {
            setRoleUsersModal(null);
            setAddRole(rid);
            window.requestAnimationFrame(() => {
              addUserCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }}
        />
      )}

      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete the user account for <strong>{userToDelete?.email}</strong>? They will no longer be able to sign in. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => userToDelete && deleteMutation.mutate(userToDelete.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Email Notifications Section ────────────────────────────────────────────────

interface EventSettingDTO {
  eventKey: string;
  tab: string;
  label: string;
  description: string;
  recipientNote: string;
  enabled: boolean;
  subjectTemplate: string;
  bodyTemplate: string;
  updatedAt: string | null;
  defaultSubject: string;
  defaultBody: string;
  defaultEnabled: boolean;
}

interface TabGroupDTO {
  key: string;
  label: string;
  events: EventSettingDTO[];
}

export function EmailNotificationsSection() {
  const queryClient = useQueryClient();

  const { data: groups = [], isLoading } = useQuery<TabGroupDTO[]>({
    queryKey: ["/api/email-notifications/"] as const,
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/email-notifications/");
      return r.json();
    },
    staleTime: 3 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const [editingEvent, setEditingEvent] = useState<EventSettingDTO | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  /** Remount WYSIWYG when opening a template or inserting a placeholder chip. */
  const [notifyTemplateEditorKey, setNotifyTemplateEditorKey] = useState(0);

  const openEditor = (ev: EventSettingDTO) => {
    setEditingEvent(ev);
    setEditSubject(ev.subjectTemplate);
    setEditBody(bodyTemplateToEditorHtml(ev.bodyTemplate));
    setNotifyTemplateEditorKey((k) => k + 1);
  };

  const EMAIL_NOTIF_QK = ["/api/email-notifications/"] as const;

  const mergeEventIntoGroups = (
    old: TabGroupDTO[] | undefined,
    updated: EventSettingDTO,
  ): TabGroupDTO[] | undefined => {
    if (!old?.length) return old;
    return old.map((g) => ({
      ...g,
      events: g.events.map((e) => (e.eventKey === updated.eventKey ? { ...e, ...updated } : e)),
    }));
  };

  const toggleEnabled = async (eventKey: string, enabled: boolean) => {
    try {
      const r = await apiRequest("PATCH", `/api/email-notifications/${eventKey}/enabled`, { enabled });
      const updated = (await r.json()) as EventSettingDTO;
      // Controlled Switch reads `ev.enabled` from cache — update immediately so UI does not wait on refetch.
      queryClient.setQueryData<TabGroupDTO[]>(EMAIL_NOTIF_QK, (old) => mergeEventIntoGroups(old, updated));
      void queryClient.invalidateQueries({ queryKey: EMAIL_NOTIF_QK });
      toast.success(enabled ? "Notification enabled" : "Notification disabled");
    } catch {
      toast.error("Failed to update notification");
    }
  };

  const saveTemplate = async () => {
    if (!editingEvent) return;
    setSaving(true);
    try {
      const r = await apiRequest("PATCH", `/api/email-notifications/${editingEvent.eventKey}/template`, {
        subjectTemplate: editSubject,
        bodyTemplate: editBody,
      });
      const updated = (await r.json()) as EventSettingDTO;
      queryClient.setQueryData<TabGroupDTO[]>(EMAIL_NOTIF_QK, (old) => mergeEventIntoGroups(old, updated));
      void queryClient.invalidateQueries({ queryKey: EMAIL_NOTIF_QK });
      toast.success("Template saved");
      setEditingEvent(null);
    } catch {
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const resetTemplate = async () => {
    if (!editingEvent) return;
    setResetting(true);
    try {
      const r = await apiRequest("POST", `/api/email-notifications/${editingEvent.eventKey}/reset`);
      const updated = (await r.json()) as EventSettingDTO;
      queryClient.setQueryData<TabGroupDTO[]>(EMAIL_NOTIF_QK, (old) => mergeEventIntoGroups(old, updated));
      void queryClient.invalidateQueries({ queryKey: EMAIL_NOTIF_QK });
      toast.success("Template reset to default");
      setEditingEvent(null);
    } catch {
      toast.error("Failed to reset template");
    } finally {
      setResetting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  const TAB_COLORS: Record<string, string> = {
    leave: "bg-emerald-50 text-emerald-700 border-emerald-200",
    recruitment: "bg-blue-50 text-blue-700 border-blue-200",
    task: "bg-violet-50 text-violet-700 border-violet-200",
    it_assets: "bg-orange-50 text-orange-700 border-orange-200",
    onboarding: "bg-cyan-50 text-cyan-700 border-cyan-200",
    company: "bg-pink-50 text-pink-700 border-pink-200",
    general: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Tabs defaultValue={groups[0]?.key ?? "leave"} className="w-full">
        <TabsList className="flex-wrap h-auto gap-1 bg-slate-100/80 p-1 rounded-lg mb-4">
          {groups.map((g) => {
            const on = g.events.filter((e) => e.enabled).length;
            return (
              <TabsTrigger key={g.key} value={g.key} className="text-xs sm:text-sm gap-1.5">
                {g.label}
                <span className={cn(
                  "ml-1 inline-flex items-center justify-center rounded-full px-1.5 py-0 text-[10px] font-semibold min-w-[18px] border",
                  on > 0 ? "bg-blue-600 text-white border-blue-600" : "bg-slate-200 text-slate-500 border-slate-300"
                )}>
                  {on}/{g.events.length}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {groups.map((g) => (
          <TabsContent key={g.key} value={g.key} className="space-y-3 mt-0">
            {g.events.map((ev) => (
              <div
                key={ev.eventKey}
                className={cn(
                  "flex items-start gap-4 rounded-lg border p-4 bg-white dark:bg-slate-900 transition-all",
                  ev.enabled ? "border-slate-200" : "border-slate-100 opacity-60"
                )}
              >
                {/* Toggle */}
                <div className="pt-0.5">
                  <Switch
                    checked={ev.enabled}
                    onCheckedChange={(checked) => toggleEnabled(ev.eventKey, checked)}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{ev.label}</p>
                    {ev.enabled ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-slate-400" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mb-1.5">{ev.description}</p>
                  <span className={cn(
                    "inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border",
                    TAB_COLORS[g.key] ?? TAB_COLORS.general
                  )}>
                    Recipients: {ev.recipientNote}
                  </span>
                </div>

                {/* Edit button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-xs h-8"
                  onClick={() => openEditor(ev)}
                >
                  <FileText className="h-3.5 w-3.5 mr-1" />
                  Template
                </Button>
              </div>
            ))}
          </TabsContent>
        ))}
      </Tabs>

      {/* Template edit dialog */}
      <Dialog open={!!editingEvent} onOpenChange={(open) => !open && setEditingEvent(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-600" />
              Edit Template — {editingEvent?.label}
            </DialogTitle>
          </DialogHeader>

          {editingEvent && (
            <div className="space-y-5 mt-2">
              {/* Recipient info badge */}
              <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2.5">
                <Bell className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700">
                  <strong>Recipients:</strong> {editingEvent.recipientNote}
                </p>
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Subject line</Label>
                <Input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="What recipients see in their inbox…"
                  className="text-sm"
                />
                <p className="text-xs text-slate-500">You can use placeholders such as{" "}
                  <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{"{{employee_name}}"}</code> in the subject too.
                </p>
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                  <Label className="text-sm font-medium">Email message</Label>
                  <p className="text-xs text-slate-500">Edit with the toolbar; no HTML code required.</p>
                </div>
                <SimpleEmailBodyEditor
                  remountKey={`${editingEvent.eventKey}-${notifyTemplateEditorKey}`}
                  value={editBody}
                  onChange={setEditBody}
                  placeholder="Write the email people will receive…"
                  contentMaxHeightClass="max-h-[min(420px,45vh)]"
                  className="shadow-sm"
                />
              </div>

              {/* Common placeholder reference */}
              <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2.5">
                <p className="text-[11px] font-semibold text-slate-600 mb-1.5">Insert a field — click to add at the end of the message</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "{{employee_name}}", "{{recipient_name}}", "{{doer_name}}",
                    "{{company_name}}", "{{app_url}}", "{{date}}",
                  ].map((p) => (
                    <code
                      key={p}
                      className="text-[10px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-600 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors"
                      onClick={() => {
                        setEditBody((b) => appendPlaceholderToEmailHtml(b, p));
                        setNotifyTemplateEditorKey((k) => k + 1);
                      }}
                      title="Add to message"
                    >
                      {p}
                    </code>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-500 hover:text-slate-700 gap-1.5"
                  disabled={resetting}
                  onClick={resetTemplate}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {resetting ? "Resetting…" : "Reset to default"}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingEvent(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" disabled={saving} onClick={saveTemplate}>
                    {saving ? "Saving…" : "Save template"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Email Branding Section ─────────────────────────────────────────────────────

interface EmailBrandingDTO {
  logoUrl: string;
  logoHeight: number;
  headerBg: string;
  headerTitleColor: string;
  cardBg: string;
  contentText: string;
  footerBg: string;
  footerBorder: string;
  footerText: string;
  outerBg: string;
}

const BRANDING_QK = ["/api/settings/email-branding"] as const;

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 rounded border border-slate-200 cursor-pointer p-0"
        style={{ backgroundColor: value }}
      />
      <div className="flex-1 min-w-0">
        <Label className="text-xs text-slate-600">{label}</Label>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 text-xs font-mono mt-0.5"
          placeholder="#000000"
        />
      </div>
    </div>
  );
}

export function EmailBrandingSection() {
  const qc = useQueryClient();

  const { data: branding, isLoading } = useQuery<EmailBrandingDTO>({
    queryKey: BRANDING_QK,
    queryFn: async () => { const r = await apiRequest("GET", "/api/settings/email-branding"); return r.json(); },
    staleTime: 3 * 60 * 1000,
  });

  const { data: logos = [] } = useQuery<string[]>({
    queryKey: ["/api/settings/email-branding/logos"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/settings/email-branding/logos"); return r.json(); },
    staleTime: 10 * 60 * 1000,
  });

  const [draft, setDraft] = useState<EmailBrandingDTO | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (branding && !draft) setDraft({ ...branding });
  }, [branding, draft]);

  const patch = (key: keyof EmailBrandingDTO, value: string | number) =>
    setDraft((d) => d ? { ...d, [key]: value } : d);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const r = await apiRequest("PUT", "/api/settings/email-branding", draft);
      const updated = await r.json();
      qc.setQueryData(BRANDING_QK, updated);
      toast.success("Email branding saved");
    } catch { toast.error("Failed to save branding"); }
    finally { setSaving(false); }
  };

  const reset = async () => {
    setSaving(true);
    try {
      const r = await apiRequest("POST", "/api/settings/email-branding/reset");
      const updated = await r.json();
      qc.setQueryData(BRANDING_QK, updated);
      setDraft({ ...updated });
      toast.success("Branding reset to defaults");
    } catch { toast.error("Failed to reset"); }
    finally { setSaving(false); }
  };

  if (isLoading || !draft) return <p className="text-sm text-slate-500 py-4">Loading branding…</p>;

  const companyName = "LDP Logistics";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2"><Palette className="h-4 w-4 text-violet-600" /> Email branding</h3>
          <p className="text-xs text-slate-500 mt-0.5">Customise the header, footer, and colors of all notification emails.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset} disabled={saving}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save branding"}
          </Button>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: controls */}
        <div className="space-y-6">
          {/* Logo */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Header logo</Label>
            <p className="text-xs text-slate-500">Choose a logo from your public assets, or leave empty for a text header.</p>
            <Select value={draft.logoUrl || "__none__"} onValueChange={(v) => patch("logoUrl", v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="No logo (text header)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No logo (text only)</SelectItem>
                {logos.map((f) => (
                  <SelectItem key={f} value={f}>
                    <span className="flex items-center gap-2">
                      <img src={f} alt="" className="h-5 w-auto max-w-[80px] object-contain" />
                      <span className="text-xs text-slate-500 truncate">{f}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {draft.logoUrl && (
              <div className="flex items-center gap-3 mt-2">
                <Label className="text-xs text-slate-500">Height (px)</Label>
                <Input
                  type="number"
                  min={16} max={80}
                  value={draft.logoHeight}
                  onChange={(e) => patch("logoHeight", Number(e.target.value) || 36)}
                  className="h-7 w-20 text-xs"
                />
              </div>
            )}
          </div>

          <Separator />

          {/* Colors */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Colors</Label>
            <div className="grid grid-cols-2 gap-3">
              <ColorField label="Page background" value={draft.outerBg} onChange={(v) => patch("outerBg", v)} />
              <ColorField label="Header background" value={draft.headerBg} onChange={(v) => patch("headerBg", v)} />
              <ColorField label="Header text" value={draft.headerTitleColor} onChange={(v) => patch("headerTitleColor", v)} />
              <ColorField label="Card background" value={draft.cardBg} onChange={(v) => patch("cardBg", v)} />
              <ColorField label="Body text" value={draft.contentText} onChange={(v) => patch("contentText", v)} />
              <ColorField label="Footer background" value={draft.footerBg} onChange={(v) => patch("footerBg", v)} />
              <ColorField label="Footer border" value={draft.footerBorder} onChange={(v) => patch("footerBorder", v)} />
              <ColorField label="Footer text" value={draft.footerText} onChange={(v) => patch("footerText", v)} />
            </div>
          </div>
        </div>

        {/* Right: live preview */}
        <div className="space-y-2">
          <Label className="text-sm font-medium flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" /> Live preview</Label>
          <div
            className="rounded-lg border overflow-hidden"
            style={{ background: draft.outerBg, padding: "24px 12px" }}
          >
            <div
              style={{
                maxWidth: 460,
                margin: "0 auto",
                background: draft.cardBg,
                borderRadius: 8,
                overflow: "hidden",
                boxShadow: "0 1px 4px rgba(0,0,0,.08)",
              }}
            >
              {/* Header */}
              <div style={{ background: draft.headerBg, padding: "18px 24px" }}>
                {draft.logoUrl ? (
                  <img src={draft.logoUrl} alt="" style={{ height: draft.logoHeight, maxHeight: 80, width: "auto" }} />
                ) : (
                  <span style={{ color: draft.headerTitleColor, fontSize: 16, fontWeight: 600, letterSpacing: ".3px" }}>{companyName}</span>
                )}
              </div>
              {/* Body */}
              <div style={{ padding: "24px 24px", fontSize: 13, lineHeight: 1.6, color: draft.contentText }}>
                <p style={{ margin: "0 0 8px" }}>Hi John,</p>
                <p style={{ margin: "0 0 8px" }}>This is a preview of how your notification emails will appear to recipients.</p>
                <div style={{ margin: "12px 0", padding: "12px 16px", background: "#f0f4ff", borderLeft: "4px solid #2563eb", borderRadius: 6 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1e293b" }}>Sample Notification</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>Details appear here &middot; Date &middot; Info</p>
                </div>
                <p style={{ margin: "12px 0 0" }}>
                  <span style={{ display: "inline-block", padding: "8px 20px", background: "#2563eb", color: "#fff", borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>View Details</span>
                </p>
                <p style={{ margin: "16px 0 0", fontSize: 12, color: "#64748b" }}>Regards,<br />{companyName} HR</p>
              </div>
              {/* Footer */}
              <div style={{ background: draft.footerBg, padding: "14px 24px", borderTop: `1px solid ${draft.footerBorder}` }}>
                <div style={{ fontSize: 11, color: draft.footerText, lineHeight: 1.5 }}>
                  {draft.logoUrl && (
                    <img src={draft.logoUrl} alt="" style={{ display: "inline-block", height: 16, width: "auto", verticalAlign: "middle", marginRight: 6, opacity: 0.6 }} />
                  )}
                  <span style={{ verticalAlign: "middle" }}>{companyName}</span>
                  <br />
                  <span style={{ opacity: 0.75 }}>Powered by <strong>eHire</strong> &middot; Automated notification.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Recruitment Settings ───────────────────────────────────────────────────

export function RecruitmentSettingsSection() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ locations: string[] }>({
    queryKey: ["/api/settings/interview-onsite-locations"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/settings/interview-onsite-locations");
      return r.json();
    },
  });

  const [locations, setLocations] = useState<string[]>([]);
  const [newLocation, setNewLocation] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.locations) setLocations(data.locations);
  }, [data]);

  const handleAdd = () => {
    const trimmed = newLocation.trim().slice(0, ONSITE_INTERVIEW_LOCATION_MAX_LENGTH);
    if (!trimmed) return;
    if (locations.includes(trimmed)) {
      toast.error("This location is already saved.");
      return;
    }
    setLocations((prev) => [...prev, trimmed]);
    setNewLocation("");
  };

  const handleRemove = (loc: string) => {
    setLocations((prev) => prev.filter((l) => l !== loc));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest("PUT", "/api/settings/interview-onsite-locations", { locations });
      await qc.invalidateQueries({ queryKey: ["/api/settings/interview-onsite-locations"] });
      toast.success("Onsite locations saved.");
    } catch {
      toast.error("Failed to save locations.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-emerald-600" />
            <div>
              <CardTitle className="text-base">Onsite Interview Locations</CardTitle>
              <CardDescription className="mt-1">
                Save default interview locations. When scheduling an onsite interview, you can pick from these saved locations — they auto-fill in the invite email.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              {locations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No locations saved yet. Add your first one below.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {locations.map((loc) => (
                    <div
                      key={loc}
                      className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted border text-sm"
                    >
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="flex-1 min-w-0 break-words whitespace-pre-wrap">{loc}</span>
                      <button
                        type="button"
                        onClick={() => handleRemove(loc)}
                        className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                        aria-label={`Remove ${loc}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Separator />

              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <Textarea
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="Street address on separate lines, then paste the Google Maps link on its own line (up to 500 characters)"
                  className="min-h-[80px] flex-1 resize-y"
                  maxLength={ONSITE_INTERVIEW_LOCATION_MAX_LENGTH}
                  rows={3}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAdd}
                  disabled={!newLocation.trim()}
                  className="h-9 gap-1.5 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
                  {saving ? "Saving…" : "Save Locations"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

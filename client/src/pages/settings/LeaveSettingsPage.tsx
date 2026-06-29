import Layout from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Calendar, ChevronLeft, ChevronRight, Plus, Settings, Shield, Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// ─────────────────────────── types ───────────────────────────
interface LeavePolicy { id: string; name: string; applicable_departments: string[]; applicable_employment_types: string[]; effective_from: string; effective_to: string | null; is_active: boolean; type_count: number; }
interface LeaveHoliday { id: string; date: string; name: string | null; }

type Section = "holidays" | "year-end" | "leave-types";

const ALL_EMPLOYMENT_TYPE_VALUES = ["full_time", "part_time", "contractor", "intern", "temporary"] as const;

const EMPLOYMENT_TYPE_LABELS: Record<(typeof ALL_EMPLOYMENT_TYPE_VALUES)[number], string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contractor: "Contractor",
  intern: "Intern",
  temporary: "Temporary",
};

function parsePolicyStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string" && v.trim()) {
    try {
      const j = JSON.parse(v);
      return Array.isArray(j) ? j.map((x) => String(x)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function buildPolicyFormFromRow(p: any) {
  const ww = p?.workweek
    ? (Array.isArray(p.workweek) ? p.workweek : (() => { try { return JSON.parse(p.workweek); } catch { return [1, 2, 3, 4, 5]; } })())
    : [1, 2, 3, 4, 5];
  const emp = parsePolicyStringArray(p?.applicable_employment_types);
  const dep = parsePolicyStringArray(p?.applicable_departments);
  return {
    effectiveFrom: p?.effective_from?.toString().slice(0, 10) ?? "",
    effectiveTo: p?.effective_to?.toString().slice(0, 10) ?? "",
    isDefault: !!p?.is_default,
    isActive: p?.is_active !== false,
    unit: (p?.unit || "days") as "days" | "hours",
    workweek: ww as number[],
    holidayCalendarName: p?.holiday_calendar_name || "",
    periodStartMonth: p?.period_start_month || 1,
    employmentMatchAll: emp.length === 0,
    applicableEmploymentTypes: emp.length ? emp : [...ALL_EMPLOYMENT_TYPE_VALUES],
    departmentMatchAll: dep.length === 0,
    applicableDepartments: dep.length ? dep : [],
  };
}

function normalizeEmploymentTypesForSave(matchAll: boolean, selected: string[]): string[] {
  if (matchAll) return [];
  const all = [...ALL_EMPLOYMENT_TYPE_VALUES];
  if (selected.length === all.length && all.every((x) => selected.includes(x))) return [];
  return selected;
}

/** Prefer standard / default / oldest policy so a newly created empty policy does not hide the real one. */
function pickDefaultPolicyId(policies: { id: string; name?: string; is_default?: boolean; created_at?: string }[]): string | null {
  if (!policies.length) return null;
  const std = policies.find((p) => /^standard leave policy$/i.test(String(p.name ?? "").trim()));
  if (std) return std.id;
  const def = policies.find((p) => p.is_default);
  if (def) return def.id;
  const oldest = [...policies].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
  )[0];
  return oldest?.id ?? policies[0]?.id ?? null;
}

// ─────────────────────────── main page ───────────────────────
export default function LeaveSettingsPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  // ── auth ──
  const { data: me } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try { const r = await apiRequest("GET", "/api/auth/me"); return r.json(); } catch { return null; }
    },
  });
  const role: string = (me?.role || "employee").toString().toLowerCase();
  const roles: string[] = Array.isArray(me?.roles) ? me.roles.map((r: unknown) => String(r).toLowerCase()) : [];
  const isHR    = role === "hr"      || role === "admin"   || roles.includes("hr")      || roles.includes("admin");

  useEffect(() => {
    if (me && !isHR) setLocation("/settings");
  }, [me, isHR, setLocation]);

  // ── state ──
  const [section, setSection]         = useState<Section>("holidays");
  const [yearEndYear, setYearEndYear] = useState(() => new Date().getFullYear());
  const [holidayForm, setHolidayForm] = useState({ date: "", name: "" });
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    effectiveFrom: "", effectiveTo: "",
    isDefault: false, isActive: true,
    unit: "days" as "days" | "hours",
    workweek: [1, 2, 3, 4, 5] as number[], holidayCalendarName: "",
    periodStartMonth: 1,
    employmentMatchAll: true,
    applicableEmploymentTypes: [...ALL_EMPLOYMENT_TYPE_VALUES] as string[],
    departmentMatchAll: true,
    applicableDepartments: [] as string[],
  });
  const [policyCustomDeptInput, setPolicyCustomDeptInput] = useState("");
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  // Year-end wizard
  const [yearEndWizard, setYearEndWizard] = useState<{
    open: boolean;
    step: 1 | 2 | 3;
    option: "continue" | "modify" | "new" | null;
    newPolicyName: string;
    newPolicyFrom: string;
    newPolicyTo: string;
    createdPolicyName: string | null;
    createdPolicyId: string | null;
  }>({ open: false, step: 1, option: null, newPolicyName: "", newPolicyFrom: "", newPolicyTo: "", createdPolicyName: null, createdPolicyId: null });
  const [wizardNewTypeForm, setWizardNewTypeForm] = useState({ name: "", paid: true, accrualType: "none" as "none" | "monthly" | "yearly", maxBalance: "12" });
  const [leaveTypeEdit, setLeaveTypeEdit] = useState<{ open: boolean; mode: "create" | "edit"; type: any }>({ open: false, mode: "edit", type: null });
  const emptyTypeForm = () => ({
    // identity
    name: "", paid: true, color: "#3b82f6",
    // accrual
    accrualType: "none" as "none" | "monthly" | "yearly",
    accrualRate: "", maxBalance: "21", prorationRequired: false,
    // balance
    carryForwardAllowed: false, maxCarryForward: "",
    allowNegativeBalance: false, carryoverExpiryDays: "",
    // request
    requiresApproval: true, hrApprovalRequired: false,
    autoApproveEnabled: false, autoApproveMaxDays: "",
    requiresDocument: false,
    mandatoryAttachmentAboveDays: "",
    mandatoryAttachmentOnBehalf: false,
    minDays: "", maxDaysPerRequest: "",
    backdatingLimitDays: "", minNoticeDays: "",
    // additional
    blockedDuringNotice: false, waitingPeriodDays: "",
    isCompensationLeave: false,
  });
  const [leaveTypeForm, setLeaveTypeForm] = useState(emptyTypeForm());
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);

  // ── queries ──
  const { data: policies = [] } = useQuery<LeavePolicy[]>({
    queryKey: ["/api/leave/policies"],
    queryFn: async () => (await apiRequest("GET", "/api/leave/policies")).json(),
    enabled: isHR,
  });
  const workingPolicyId = useMemo(() => {
    if (!policies.length) return null;
    if (selectedPolicyId && policies.some((p) => p.id === selectedPolicyId)) return selectedPolicyId;
    return pickDefaultPolicyId(policies as { id: string; name?: string; is_default?: boolean; created_at?: string }[]);
  }, [policies, selectedPolicyId]);
  const activePolicy = useMemo(
    () => (policies as any[]).find((p) => p.id === workingPolicyId) ?? null,
    [policies, workingPolicyId],
  );
  const { data: standardPolicyDetail } = useQuery<any>({
    queryKey: ["/api/leave/policies", workingPolicyId],
    queryFn: async () => (await apiRequest("GET", `/api/leave/policies/${workingPolicyId}`)).json(),
    enabled: !!workingPolicyId && isHR,
  });
  const leaveTypesList = standardPolicyDetail?.leave_types ?? [];
  const createdPolicyId = yearEndWizard.createdPolicyId;
  const { data: createdPolicyDetail } = useQuery<any>({
    queryKey: ["/api/leave/policies", createdPolicyId],
    queryFn: async () => (await apiRequest("GET", `/api/leave/policies/${createdPolicyId}`)).json(),
    enabled: !!createdPolicyId && yearEndWizard.open && isHR,
  });
  const createdPolicyTypes = createdPolicyDetail?.leave_types ?? [];

  const { data: holidays = [] } = useQuery<LeaveHoliday[]>({
    queryKey: ["/api/leave/holidays"],
    queryFn: async () => (await apiRequest("GET", "/api/leave/holidays")).json(),
    enabled: isHR,
  });
  const { data: employeeDepartmentsData } = useQuery<{ departments: string[] }>({
    queryKey: ["/api/employees/departments"],
    queryFn: async () => (await apiRequest("GET", "/api/employees/departments")).json(),
    enabled: isHR,
  });
  const orgDepartmentNames = employeeDepartmentsData?.departments ?? [];
  const policyDeptCheckboxNames = useMemo(() => {
    const set = new Set<string>([...orgDepartmentNames, ...policyForm.applicableDepartments]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [orgDepartmentNames, policyForm.applicableDepartments]);

  // ── mutations ──
  const yearEndMutation = useMutation({
    mutationFn: async ({ year, policyId }: { year: number; policyId?: string | null }) => {
      const r = await apiRequest("POST", "/api/leave/process-year-end", { year, policyId: policyId ?? undefined });
      return r.json() as Promise<{ processed: number; skipped: number; bereavementProcessed: number; errors?: string[] }>;
    },
    onSuccess: (data) => {
      const msg = [
        data.processed != null && `EL: ${data.processed} reset to 0`,
        data.bereavementProcessed != null && data.bereavementProcessed > 0 && `Bereavement: ${data.bereavementProcessed} set to 2`,
      ].filter(Boolean).join("; ");
      toast.success(msg ? `Year-end complete. ${msg}` : "Year-end complete.");
      if (data.errors?.length) data.errors.forEach((e: string) => toast.warning(e));
      qc.invalidateQueries({ queryKey: ["/api/leave"] });
    },
    onError: (err: any) => toast.error(err?.message || "Year-end processing failed"),
  });

  const accrueMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/leave/accrue", {});
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error((b as { message?: string; error?: string })?.message || (b as { error?: string })?.error || "Accrual failed");
      }
      return r.json() as Promise<{ success?: boolean; accruedCount?: number; earnedLeaveAccrued?: number }>;
    },
    onSuccess: (data) => {
      const total = data.accruedCount ?? 0;
      const el = data.earnedLeaveAccrued ?? 0;
      const other = Math.max(0, total - el);
      toast.success(
        other > 0
          ? `Accrual complete: ${total} update(s) (${el} Earned Leave, ${other} other monthly).`
          : `Accrual complete: ${total} Earned Leave / balance update(s).`,
      );
      qc.invalidateQueries({ queryKey: ["/api/leave"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Accrual failed"),
  });

  const addHolidayMutation = useMutation({
    mutationFn: async ({ date, name }: { date: string; name: string }) => {
      const r = await apiRequest("POST", "/api/leave/holidays", { date, name: name || undefined });
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b?.error || "Failed to add holiday"); }
      return r.json();
    },
    onSuccess: () => {
      toast.success("Holiday added");
      qc.invalidateQueries({ queryKey: ["/api/leave/holidays"] });
      setHolidayForm({ date: "", name: "" });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to add holiday"),
  });

  const deleteHolidayMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/leave/holidays/${id}`); },
    onSuccess: () => { toast.success("Holiday removed"); qc.invalidateQueries({ queryKey: ["/api/leave/holidays"] }); },
    onError: (err: any) => toast.error(err?.message || "Failed to delete holiday"),
  });

  const updatePolicyMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const r = await apiRequest("PATCH", `/api/leave/policies/${id}`, body);
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b?.error || "Failed to update policy");
      }
      return r.json();
    },
    onSuccess: () => {
      toast.success("Policy updated");
      qc.invalidateQueries({ queryKey: ["/api/leave/policies"] });
      setPolicyDialogOpen(false);
      setEditingPolicyId(null);
      setPolicyCustomDeptInput("");
    },
    onError: (err: any) => toast.error(err?.message || "Update failed"),
  });

  const updateLeaveTypeMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const r = await apiRequest("PATCH", `/api/leave/types/${id}`, body);
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b?.error || "Failed to update leave type"); }
      return r.json();
    },
    onSuccess: () => {
      toast.success("Leave type updated");
      qc.invalidateQueries({ queryKey: ["/api/leave/policies"] });
      setLeaveTypeEdit({ open: false, mode: "edit", type: null });
    },
    onError: (err: any) => toast.error(err?.message || "Update failed"),
  });

  const createLeaveTypeMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await apiRequest("POST", "/api/leave/types", body);
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b?.error || "Failed to create leave type"); }
      return r.json();
    },
    onSuccess: (data) => {
      toast.success(`Leave type "${data.name}" created and initialized for all active employees`);
      qc.invalidateQueries({ queryKey: ["/api/leave/policies"] });
      qc.invalidateQueries({ queryKey: ["/api/leave"] });
      setLeaveTypeEdit({ open: false, mode: "create", type: null });
    },
    onError: (err: any) => toast.error(err?.message || "Create failed"),
  });

  const deleteLeaveTypeMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/leave/types/${id}`);
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b?.error || "Failed to delete leave type"); }
    },
    onSuccess: () => {
      toast.success("Leave type removed");
      qc.invalidateQueries({ queryKey: ["/api/leave/policies"] });
      qc.invalidateQueries({ queryKey: ["/api/leave"] });
    },
    onError: (err: any) => toast.error(err?.message || "Delete failed"),
  });

  const createPolicyMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await apiRequest("POST", "/api/leave/policies", body);
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b?.error || "Failed to create policy"); }
      return r.json();
    },
    onSuccess: (data) => {
      toast.success(`Policy "${data.name}" created`);
      qc.invalidateQueries({ queryKey: ["/api/leave/policies"] });
      qc.invalidateQueries({ queryKey: ["/api/leave"] });
    },
    onError: (err: any) => toast.error(err?.message || "Create failed"),
  });

  if (!isHR) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto p-6 space-y-4">
          <p className="text-muted-foreground">This page is for HR and admins.</p>
          <Button variant="outline" onClick={() => setLocation("/settings")}>Back to Settings</Button>
        </div>
      </Layout>
    );
  }

  // ── section: holidays ──
  const holidaysSection = (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">Company Holidays</h2>
        <p className="text-sm text-muted-foreground">
          Dates excluded from leave business-day calculation.
        </p>
      </div>
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={holidayForm.date}
                onChange={e => setHolidayForm(f => ({ ...f, date: e.target.value }))}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Name (optional)</Label>
              <Input
                placeholder="e.g. Eid"
                value={holidayForm.name}
                onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))}
                className="w-[160px]"
              />
            </div>
            <Button
              size="sm"
              disabled={!holidayForm.date || addHolidayMutation.isPending}
              onClick={() => { if (holidayForm.date) addHolidayMutation.mutate({ date: holidayForm.date, name: holidayForm.name }); }}
            >
              Add holiday
            </Button>
          </div>

          {holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No holidays added yet.</p>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">{h.date}</TableCell>
                      <TableCell className="text-muted-foreground">{h.name || "—"}</TableCell>
                      <TableCell>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600"
                          disabled={deleteHolidayMutation.isPending}
                          onClick={() => window.confirm("Remove this holiday?") && deleteHolidayMutation.mutate(h.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ── section: year-end ──
  const yearEndSection = (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">Year-End Reset</h2>
        <p className="text-sm text-muted-foreground">
          Reset Earned Leave to 0 and Bereavement to 2 at the end of the year. Use the guided wizard to choose your policy approach first.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Process Year-End</CardTitle>
          <CardDescription>
            Choose the year, then click the wizard to select a policy option before running the reset.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/40 rounded-lg p-4 text-sm text-muted-foreground space-y-2 border">
            <p className="font-medium text-foreground">What happens during year-end reset:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>All Earned Leave balances → 0 (carry-forward can be added manually in Leave admin → Balances)</li>
              <li>All Bereavement balances → 2 days</li>
              <li>LWOP is unlimited, not reset</li>
            </ul>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Label className="text-sm font-medium">Year</Label>
            <Select value={String(yearEndYear)} onValueChange={v => setYearEndYear(parseInt(v, 10))}>
              <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[new Date().getFullYear() + 1, new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                const p = activePolicy as any;
                if (!p) { toast.error("Select a policy above"); return; }
                setPolicyForm(buildPolicyFormFromRow(p));
                setYearEndWizard({ open: true, step: 1, option: null, newPolicyName: "", newPolicyFrom: `${yearEndYear + 1}-01-01`, newPolicyTo: `${yearEndYear + 1}-12-31`, createdPolicyName: null, createdPolicyId: null });
              }}
              disabled={yearEndMutation.isPending || !activePolicy}
            >
              {yearEndMutation.isPending ? "Processing…" : "Process Year-End…"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ── section: leave types ──
  const leaveTypesSection = (
    <div className="space-y-4">
      <Card className="border-muted bg-muted/20">
        <CardHeader className="py-3 pb-2">
          <CardTitle className="text-base">Run accrual</CardTitle>
          <CardDescription>
            Applies <strong>Earned Leave</strong> (1 day per month, pro-rated in join month) and <strong>monthly</strong> accrual for other eligible leave types. Already-processed periods are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Button
            type="button"
            variant="secondary"
            disabled={accrueMutation.isPending}
            onClick={() => {
              if (window.confirm("Run leave accrual now for all eligible employees?")) accrueMutation.mutate();
            }}
          >
            {accrueMutation.isPending ? "Running…" : "Run leave accrual now"}
          </Button>
        </CardContent>
      </Card>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold mb-1">Leave Types</h2>
          <p className="text-sm text-muted-foreground">Add, edit or remove leave types. Changes apply to new requests immediately; accrual rate changes apply from the next accrual run.</p>
        </div>
        <div className="flex gap-2">
          {activePolicy && (
            <Button size="sm" variant="outline" onClick={() => {
              const p = activePolicy as any;
              setPolicyForm(buildPolicyFormFromRow(p));
              setPolicyCustomDeptInput("");
              setEditingPolicyId(p.id);
              setPolicyDialogOpen(true);
            }}>
              Edit Policy
            </Button>
          )}
          {workingPolicyId && (
            <Button size="sm" onClick={() => { setLeaveTypeEdit({ open: true, mode: "create", type: null }); setLeaveTypeForm(emptyTypeForm()); }}>
              + Add Leave Type
            </Button>
          )}
        </div>
      </div>
      <Card>
        <CardContent className="p-4">
          {leaveTypesList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No leave types found. Run migration 0021_standard_leave_policy.sql to create the standard policy.
            </p>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Accrual</TableHead>
                    <TableHead>Max / Carry</TableHead>
                    <TableHead>Approval</TableHead>
                    <TableHead className="text-right w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaveTypesList.map((lt: any) => (
                    <TableRow key={lt.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: lt.color || "#3b82f6" }} />
                          <span className="text-sm font-medium">{lt.name}</span>
                          {lt.is_compensation_leave && (
                            <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-700">Comp off</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {lt.paid
                          ? <Badge className="bg-green-50 text-green-700 border-green-200 text-[10px]">Paid</Badge>
                          : <Badge variant="outline" className="text-[10px]">Unpaid</Badge>
                        }
                      </TableCell>
                      <TableCell className="text-xs capitalize">
                        {lt.accrual_type === "none" ? "—" : `${lt.accrual_type}${lt.accrual_rate ? ` (${lt.accrual_rate}/period)` : ""}`}
                      </TableCell>
                      <TableCell className="text-sm">
                        {lt.is_compensation_leave
                          ? `Manual credit, max ${lt.max_balance}`
                          : lt.paid
                            ? `${lt.max_balance}${lt.carry_forward_allowed ? `, carry ${lt.max_carry_forward ?? "∞"}` : ""}`
                            : "Unlimited"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {!lt.requires_approval ? "Auto" : lt.hr_approval_required ? "Mgr + HR" : "Manager"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost" size="sm" className="h-7 text-xs"
                            onClick={() => {
                              setLeaveTypeEdit({ open: true, mode: "edit", type: lt });
                              setLeaveTypeForm({
                                name: lt.name || "", paid: lt.paid !== false, color: lt.color || "#3b82f6",
                                accrualType: lt.accrual_type || "none",
                                accrualRate: lt.accrual_rate != null ? String(lt.accrual_rate) : "",
                                maxBalance: String(lt.max_balance ?? "21"),
                                prorationRequired: !!lt.proration_required,
                                carryForwardAllowed: !!lt.carry_forward_allowed,
                                maxCarryForward: lt.max_carry_forward != null ? String(lt.max_carry_forward) : "",
                                allowNegativeBalance: !!lt.allow_negative_balance,
                                carryoverExpiryDays: lt.carryover_expiry_days != null ? String(lt.carryover_expiry_days) : "",
                                requiresApproval: lt.requires_approval !== false,
                                hrApprovalRequired: !!lt.hr_approval_required,
                                autoApproveEnabled: !!(lt.auto_approve_rules?.maxDays),
                                autoApproveMaxDays: lt.auto_approve_rules?.maxDays != null ? String(lt.auto_approve_rules.maxDays) : "",
                                requiresDocument: !!lt.requires_document,
                                mandatoryAttachmentAboveDays: lt.mandatory_attachment_above_days != null ? String(lt.mandatory_attachment_above_days) : "",
                                mandatoryAttachmentOnBehalf: !!lt.mandatory_attachment_on_behalf,
                                minDays: lt.min_days != null ? String(lt.min_days) : "",
                                maxDaysPerRequest: lt.max_days_per_request != null ? String(lt.max_days_per_request) : "",
                                backdatingLimitDays: lt.backdating_limit_days != null ? String(lt.backdating_limit_days) : "",
                                minNoticeDays: lt.min_notice_days != null ? String(lt.min_notice_days) : "",
                                blockedDuringNotice: !!lt.blocked_during_notice,
                                waitingPeriodDays: lt.waiting_period_days != null ? String(lt.waiting_period_days) : "",
                                isCompensationLeave: !!lt.is_compensation_leave,
                              });
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                            disabled={deleteLeaveTypeMutation.isPending}
                            title={lt.has_requests ? "Cannot remove: leave requests reference this type" : "Remove leave type"}
                            onClick={() => {
                              if (window.confirm(`Remove leave type "${lt.name}"? This cannot be undone. Existing leave requests will keep their reference.`)) {
                                deleteLeaveTypeMutation.mutate(lt.id);
                              }
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const sectionContent: Record<Section, import("react").ReactNode> = {
    holidays: holidaysSection,
    "year-end": yearEndSection,
    "leave-types": leaveTypesSection,
  };

  const sectionTabs: { id: Section; label: string; icon: import("react").ReactNode }[] = [
    { id: "holidays", label: "Holidays", icon: <Calendar className="h-4 w-4" /> },
    { id: "year-end", label: "Year-End", icon: <Settings className="h-4 w-4" /> },
    { id: "leave-types", label: "Leave types", icon: <Shield className="h-4 w-4" /> },
  ];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => setLocation("/settings")}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Settings
            </Button>
            <h1 className="text-2xl font-semibold">Leave settings</h1>
            <p className="text-sm text-muted-foreground">Holidays, year-end reset, policy, and leave types.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLocation("/leave/admin")}>
            Leave admin (approvals & balances)
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 border-b pb-3">
          {sectionTabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSection(t.id)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                section === t.id ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted",
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {(section === "year-end" || section === "leave-types") && policies.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 p-3 rounded-lg border bg-muted/20">
            <div className="space-y-1 min-w-[200px]">
              <Label className="text-xs font-medium">Leave policy</Label>
              <Select value={workingPolicyId ?? ""} onValueChange={(v) => setSelectedPolicyId(v)}>
                <SelectTrigger className="w-full sm:w-[300px]">
                  <SelectValue placeholder="Select policy" />
                </SelectTrigger>
                <SelectContent>
                  {(policies as any[]).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {p.type_count ?? 0} types{p.is_default ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground sm:max-w-xl pb-0.5">
              The list is ordered by newest first. Your previous policy is still in the database—choose it here if the screen showed the wrong one after creating a new policy.
            </p>
          </div>
        )}
        <div>{sectionContent[section]}</div>
      </div>

      {/* Year-end wizard */}
      <Dialog open={yearEndWizard.open} onOpenChange={open => !open && setYearEndWizard(w => ({ ...w, open: false, step: 1, option: null, createdPolicyName: null, createdPolicyId: null }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Year-End Reset — {yearEndYear}</DialogTitle>
            <DialogDescription>
              {yearEndWizard.step === 1 && "Step 1: Choose policy approach for next year."}
              {yearEndWizard.step === 2 && yearEndWizard.option === "modify" && "Step 2: Set policy effective dates and change existing leave types."}
              {yearEndWizard.step === 2 && yearEndWizard.option === "new" && !yearEndWizard.createdPolicyId && "Step 2: Set policy effective dates and create policy."}
              {yearEndWizard.step === 2 && yearEndWizard.option === "new" && yearEndWizard.createdPolicyId && "Step 2: Add leave types to the new policy (multiple allowed)."}
              {yearEndWizard.step === 3 && "Step 3: Review and confirm reset."}
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: choose option */}
          {yearEndWizard.step === 1 && (
            <div className="space-y-3 py-2">
              {[
                { id: "continue" as const, label: "Continue current policy as-is", desc: "Just run the reset. No changes to leave types or policy rules." },
                { id: "modify" as const, label: "Modify the current policy first", desc: "Change policy dates, accrual rules, or leave type settings before resetting." },
                { id: "new" as const, label: "Create a new policy for next year", desc: "Start fresh with a new policy. Leave types can be added after creation." },
              ].map(o => (
                <button
                  key={o.id}
                  onClick={() => setYearEndWizard(w => ({ ...w, option: o.id }))}
                  className={cn(
                    "w-full text-left rounded-lg border p-3 transition-colors",
                    yearEndWizard.option === o.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  )}
                >
                  <p className="text-sm font-medium">{o.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{o.desc}</p>
                </button>
              ))}
            </div>
          )}

          {/* Step 2a: modify — policy effective dates + change existing leave types */}
          {yearEndWizard.step === 2 && yearEndWizard.option === "modify" && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">Set policy effective dates for next year, then change existing leave types if needed.</p>
              {policies.length > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Policy effective from</Label>
                      <Input type="date" className="mt-1" value={policyForm.effectiveFrom} onChange={e => setPolicyForm(f => ({ ...f, effectiveFrom: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Effective to (optional)</Label>
                      <Input type="date" className="mt-1" value={policyForm.effectiveTo} onChange={e => setPolicyForm(f => ({ ...f, effectiveTo: e.target.value }))} />
                    </div>
                  </div>
                  <Button
                    variant="outline" size="sm"
                    disabled={!policyForm.effectiveFrom || updatePolicyMutation.isPending}
                    onClick={() => { const p = activePolicy; if (p) updatePolicyMutation.mutate({ id: p.id, body: { effectiveFrom: policyForm.effectiveFrom, effectiveTo: policyForm.effectiveTo || undefined } }); }}
                  >
                    {updatePolicyMutation.isPending ? "Saving…" : "Save policy dates"}
                  </Button>
                </>
              )}
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">Change existing leave types</p>
                <p className="text-xs text-muted-foreground mb-2">Edit accrual, max balance, or other rules. Click Edit to open the full form.</p>
                {leaveTypesList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No leave types in this policy.</p>
                ) : (
                  <div className="space-y-1">
                    {leaveTypesList.map((lt: any) => (
                      <div key={lt.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                        <span className="font-medium">{lt.name}</span>
                        <Button
                          variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => {
                            setLeaveTypeEdit({ open: true, mode: "edit", type: lt });
                            setLeaveTypeForm({
                              name: lt.name || "", paid: lt.paid !== false, color: lt.color || "#3b82f6",
                              accrualType: lt.accrual_type || "none",
                              accrualRate: lt.accrual_rate != null ? String(lt.accrual_rate) : "",
                              maxBalance: String(lt.max_balance ?? "21"),
                              prorationRequired: !!lt.proration_required,
                              carryForwardAllowed: !!lt.carry_forward_allowed,
                              maxCarryForward: lt.max_carry_forward != null ? String(lt.max_carry_forward) : "",
                              allowNegativeBalance: !!lt.allow_negative_balance,
                              carryoverExpiryDays: lt.carryover_expiry_days != null ? String(lt.carryover_expiry_days) : "",
                              requiresApproval: lt.requires_approval !== false,
                              hrApprovalRequired: !!lt.hr_approval_required,
                              autoApproveEnabled: !!(lt.auto_approve_rules?.maxDays),
                              autoApproveMaxDays: lt.auto_approve_rules?.maxDays != null ? String(lt.auto_approve_rules.maxDays) : "",
                              requiresDocument: !!lt.requires_document,
                              mandatoryAttachmentAboveDays: lt.mandatory_attachment_above_days != null ? String(lt.mandatory_attachment_above_days) : "",
                              mandatoryAttachmentOnBehalf: !!lt.mandatory_attachment_on_behalf,
                              minDays: lt.min_days != null ? String(lt.min_days) : "",
                              maxDaysPerRequest: lt.max_days_per_request != null ? String(lt.max_days_per_request) : "",
                              backdatingLimitDays: lt.backdating_limit_days != null ? String(lt.backdating_limit_days) : "",
                              minNoticeDays: lt.min_notice_days != null ? String(lt.min_notice_days) : "",
                              blockedDuringNotice: !!lt.blocked_during_notice,
                              waitingPeriodDays: lt.waiting_period_days != null ? String(lt.waiting_period_days) : "",
                              isCompensationLeave: !!lt.is_compensation_leave,
                            });
                          }}
                        >
                          Edit
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2b: new policy — effective dates, then create, then add leave types */}
          {yearEndWizard.step === 2 && yearEndWizard.option === "new" && (
            <div className="space-y-4 py-2">
              {!yearEndWizard.createdPolicyId ? (
                <>
                  <p className="text-sm text-muted-foreground">Enter policy effective dates and create the policy. Then add leave types on the next screen.</p>
                  <div>
                    <Label>Policy name</Label>
                    <Input className="mt-1" value={yearEndWizard.newPolicyName} onChange={e => setYearEndWizard(w => ({ ...w, newPolicyName: e.target.value }))} placeholder={`Leave Policy ${yearEndYear + 1}`} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Effective from</Label>
                      <Input type="date" className="mt-1" value={yearEndWizard.newPolicyFrom} onChange={e => setYearEndWizard(w => ({ ...w, newPolicyFrom: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Effective to (optional)</Label>
                      <Input type="date" className="mt-1" value={yearEndWizard.newPolicyTo} onChange={e => setYearEndWizard(w => ({ ...w, newPolicyTo: e.target.value }))} />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    disabled={createPolicyMutation.isPending || !yearEndWizard.newPolicyFrom}
                    onClick={() => createPolicyMutation.mutate(
                      {
                        name: yearEndWizard.newPolicyName || `Leave Policy ${yearEndYear + 1}`,
                        effectiveFrom: yearEndWizard.newPolicyFrom,
                        effectiveTo: yearEndWizard.newPolicyTo || null,
                        policyYear: yearEndYear + 1,
                      },
                      {
                        onSuccess: (data: { name?: string; id?: string }) => setYearEndWizard(w => ({ ...w, createdPolicyName: (data?.name ?? w.newPolicyName) ?? null, createdPolicyId: data?.id ?? null })),
                      }
                    )}
                  >
                    {createPolicyMutation.isPending ? "Creating…" : "Create Policy"}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Policy <strong>{yearEndWizard.createdPolicyName}</strong> created. Add leave types (e.g. Earned Leave, LWOP, Bereavement). You can add multiple.</p>
                  <div className="rounded border p-3 space-y-2 bg-muted/30">
                    <p className="text-xs font-medium">Add a leave type</p>
                    <div className="flex flex-wrap gap-2 items-end">
                      <div className="flex-1 min-w-[120px]">
                        <Label className="text-xs">Name</Label>
                        <Input className="mt-0.5 h-8" placeholder="e.g. Earned Leave" value={wizardNewTypeForm.name} onChange={e => setWizardNewTypeForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div className="w-24">
                        <Label className="text-xs">Max days</Label>
                        <Input type="number" className="mt-0.5 h-8" min={0} value={wizardNewTypeForm.maxBalance} onChange={e => setWizardNewTypeForm(f => ({ ...f, maxBalance: e.target.value }))} />
                      </div>
                      <div className="flex items-center gap-1">
                        <input type="checkbox" id="wiz-paid" checked={wizardNewTypeForm.paid} onChange={e => setWizardNewTypeForm(f => ({ ...f, paid: e.target.checked }))} className="h-3 w-3" />
                        <Label htmlFor="wiz-paid" className="text-xs">Paid</Label>
                      </div>
                      <Select value={wizardNewTypeForm.accrualType} onValueChange={(v: "none" | "monthly" | "yearly") => setWizardNewTypeForm(f => ({ ...f, accrualType: v }))}>
                        <SelectTrigger className="h-8 w-[100px]"><SelectValue placeholder="Accrual" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="yearly">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm" className="h-8"
                        disabled={!wizardNewTypeForm.name.trim() || createLeaveTypeMutation.isPending}
                        onClick={() => {
                          if (!yearEndWizard.createdPolicyId) return;
                          createLeaveTypeMutation.mutate(
                            {
                              policyId: yearEndWizard.createdPolicyId,
                              name: wizardNewTypeForm.name.trim(),
                              paid: wizardNewTypeForm.paid,
                              accrualType: wizardNewTypeForm.accrualType,
                              maxBalance: parseFloat(wizardNewTypeForm.maxBalance) || 12,
                              accrualRate: wizardNewTypeForm.accrualType !== "none" ? "0.5" : null,
                            },
                            {
                              onSuccess: () => {
                                setWizardNewTypeForm({ name: "", paid: true, accrualType: "none", maxBalance: "12" });
                                qc.invalidateQueries({ queryKey: ["/api/leave/policies", yearEndWizard.createdPolicyId] });
                              },
                            }
                          );
                        }}
                      >
                        {createLeaveTypeMutation.isPending ? "…" : "Add"}
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Leave types in this policy: {createdPolicyTypes.length === 0 ? "None yet" : createdPolicyTypes.map((t: any) => t.name).join(", ")}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: review & confirm — policy is already decided by path */}
          {yearEndWizard.step === 3 && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Policy for reset: <strong className="text-foreground">{yearEndWizard.option === "new" ? (yearEndWizard.createdPolicyName ?? "New policy") : (activePolicy?.name ?? "Current policy")}</strong> · Year: <strong className="text-foreground">{yearEndYear}</strong>
              </p>
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
                <p className="font-medium">What will happen:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Earned Leave balances for all employees → <strong className="text-foreground">0</strong></li>
                  <li>Bereavement balances for all employees → <strong className="text-foreground">2 days</strong></li>
                  <li>LWOP is unlimited, not affected</li>
                  <li>Current balances are snapshotted before reset</li>
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">Carry-forward amounts can be added manually in Leave admin → Balances afterwards.</p>
            </div>
          )}

          <DialogFooter className="gap-2">
            {yearEndWizard.step > 1 && (
              <Button variant="outline" onClick={() => setYearEndWizard(w => ({ ...w, step: (w.step - 1) as 1 | 2 | 3 }))}>Back</Button>
            )}
            <Button variant="outline" onClick={() => setYearEndWizard(w => ({ ...w, open: false, step: 1, option: null, createdPolicyName: null, createdPolicyId: null }))}>Cancel</Button>
            {yearEndWizard.step < 3 && (
              <Button
                disabled={
                  (yearEndWizard.step === 1 && !yearEndWizard.option) ||
                  (yearEndWizard.step === 2 && yearEndWizard.option === "new" && !yearEndWizard.createdPolicyId)
                }
                onClick={() => setYearEndWizard(w => {
                  const nextStep = w.step === 2 ? 3 : (w.option === "continue" ? 3 : 2);
                  return { ...w, step: nextStep as 1 | 2 | 3 };
                })}
              >
                {yearEndWizard.step === 1 && yearEndWizard.option === "continue" ? "Review Reset" : yearEndWizard.step === 2 ? "Next → Review" : "Next"}
              </Button>
            )}
            {yearEndWizard.step === 3 && (
              <Button
                disabled={yearEndMutation.isPending || !(yearEndWizard.option === "new" ? yearEndWizard.createdPolicyId : activePolicy?.id)}
                onClick={() => {
                  const policyId = yearEndWizard.option === "new" ? yearEndWizard.createdPolicyId : activePolicy?.id;
                  yearEndMutation.mutate({ year: yearEndYear, policyId: policyId ?? undefined });
                  setYearEndWizard(w => ({ ...w, open: false, step: 1, option: null, createdPolicyId: null }));
                }}
              >
                {yearEndMutation.isPending ? "Processing…" : "Confirm Reset"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Policy details dialog */}
      <Dialog
        open={policyDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPolicyDialogOpen(false);
            setEditingPolicyId(null);
            setPolicyCustomDeptInput("");
          }
        }}
      >
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Policy</DialogTitle>
            <DialogDescription>
              Who the policy applies to, effective dates, workweek, and period. Empty department or employment lists mean “all”.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <p className="text-sm font-medium">Who this policy matches</p>
              <p className="text-xs text-muted-foreground">
                Leave balances and matching use the employee&apos;s department and employment type. Strings must match the employee profile exactly.
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border bg-background p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">All employment types</Label>
                  <p className="text-xs text-muted-foreground">Interns, contractors, full-time, etc.</p>
                </div>
                <Switch
                  checked={policyForm.employmentMatchAll}
                  onCheckedChange={(c) => {
                    const matchAll = Boolean(c);
                    setPolicyForm((f) => ({
                      ...f,
                      employmentMatchAll: matchAll,
                      applicableEmploymentTypes: matchAll
                        ? [...ALL_EMPLOYMENT_TYPE_VALUES]
                        : f.applicableEmploymentTypes.length
                          ? f.applicableEmploymentTypes
                          : [...ALL_EMPLOYMENT_TYPE_VALUES],
                    }));
                  }}
                />
              </div>
              {!policyForm.employmentMatchAll && (
                <div className="grid grid-cols-2 gap-2 pl-1">
                  {ALL_EMPLOYMENT_TYPE_VALUES.map((val) => (
                    <label key={val} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={policyForm.applicableEmploymentTypes.includes(val)}
                        onCheckedChange={() => {
                          setPolicyForm((f) => ({
                            ...f,
                            applicableEmploymentTypes: f.applicableEmploymentTypes.includes(val)
                              ? f.applicableEmploymentTypes.filter((x) => x !== val)
                              : [...f.applicableEmploymentTypes, val],
                          }));
                        }}
                      />
                      <span>{EMPLOYMENT_TYPE_LABELS[val]}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border bg-background p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">All departments</Label>
                  <p className="text-xs text-muted-foreground">Any department on the employee profile</p>
                </div>
                <Switch
                  checked={policyForm.departmentMatchAll}
                  onCheckedChange={(c) => {
                    const matchAll = Boolean(c);
                    setPolicyForm((f) => {
                      if (matchAll) return { ...f, departmentMatchAll: true, applicableDepartments: [] };
                      const next =
                        f.applicableDepartments.length > 0 ? f.applicableDepartments : [...orgDepartmentNames];
                      return { ...f, departmentMatchAll: false, applicableDepartments: next };
                    });
                  }}
                />
              </div>
              {!policyForm.departmentMatchAll && (
                <div className="space-y-2">
                  <ScrollArea className="h-[140px] rounded-md border bg-background p-2">
                    <div className="space-y-2 pr-2">
                      {policyDeptCheckboxNames.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-1 py-2">
                          No departments in the directory yet. Add a name below if employees use a department not listed in Org Structure.
                        </p>
                      ) : (
                        policyDeptCheckboxNames.map((name) => (
                          <label key={name} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                            <Checkbox
                              checked={policyForm.applicableDepartments.includes(name)}
                              onCheckedChange={() => {
                                setPolicyForm((f) => ({
                                  ...f,
                                  applicableDepartments: f.applicableDepartments.includes(name)
                                    ? f.applicableDepartments.filter((x) => x !== name)
                                    : [...f.applicableDepartments, name],
                                }));
                              }}
                            />
                            <span className="truncate" title={name}>{name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                    <div className="flex-1 min-w-0">
                      <Label className="text-xs">Add department (exact name as on employee)</Label>
                      <Input
                        className="mt-1"
                        value={policyCustomDeptInput}
                        onChange={(e) => setPolicyCustomDeptInput(e.target.value)}
                        placeholder="e.g. Engineering"
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          const raw = policyCustomDeptInput.trim();
                          if (!raw) return;
                          setPolicyForm((f) =>
                            f.applicableDepartments.includes(raw)
                              ? f
                              : { ...f, applicableDepartments: [...f.applicableDepartments, raw] },
                          );
                          setPolicyCustomDeptInput("");
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        const raw = policyCustomDeptInput.trim();
                        if (!raw) return;
                        setPolicyForm((f) =>
                          f.applicableDepartments.includes(raw)
                            ? f
                            : { ...f, applicableDepartments: [...f.applicableDepartments, raw] },
                        );
                        setPolicyCustomDeptInput("");
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )}
            </div>
            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Effective from</Label>
                <Input type="date" value={policyForm.effectiveFrom} onChange={e => setPolicyForm(f => ({ ...f, effectiveFrom: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Effective to (optional)</Label>
                <Input type="date" value={policyForm.effectiveTo} onChange={e => setPolicyForm(f => ({ ...f, effectiveTo: e.target.value }))} className="mt-1" placeholder="No end" />
              </div>
            </div>
            {/* Unit */}
            <div>
              <Label>Calculate time off in</Label>
              <Select value={policyForm.unit} onValueChange={(v: "days"|"hours") => setPolicyForm(f => ({ ...f, unit: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="days">Days</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Workweek */}
            <div>
              <Label>Workweek</Label>
              <div className="flex gap-1.5 mt-2">
                {[{d:0,l:"Su"},{d:1,l:"Mo"},{d:2,l:"Tu"},{d:3,l:"We"},{d:4,l:"Th"},{d:5,l:"Fr"},{d:6,l:"Sa"}].map(({d,l}) => {
                  const active = policyForm.workweek.includes(d);
                  return (
                    <button
                      key={d} type="button"
                      className={cn("h-9 w-9 rounded-full text-xs font-medium border transition-colors", active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary")}
                      onClick={() => setPolicyForm(f => ({ ...f, workweek: active ? f.workweek.filter(x => x!==d) : [...f.workweek,d].sort() }))}
                    >{l}</button>
                  );
                })}
              </div>
            </div>
            {/* Holiday calendar */}
            <div>
              <Label>Holiday calendar (optional)</Label>
              <Input value={policyForm.holidayCalendarName} onChange={e => setPolicyForm(f => ({ ...f, holidayCalendarName: e.target.value }))} className="mt-1" placeholder="e.g. Pakistan Holidays" />
            </div>
            {/* Period start month */}
            <div>
              <Label>Period start month</Label>
              <Select value={String(policyForm.periodStartMonth)} onValueChange={v => setPolicyForm(f => ({ ...f, periodStartMonth: parseInt(v) }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m,i) => (
                    <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Default flag */}
            <div className="flex items-center gap-3">
              <input type="checkbox" id="pf-default" checked={policyForm.isDefault} onChange={e => setPolicyForm(f => ({ ...f, isDefault: e.target.checked }))} className="h-4 w-4" />
              <Label htmlFor="pf-default">Mark as default policy (fallback when no other policy matches)</Label>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/80 dark:bg-amber-950/20 p-3">
              <input type="checkbox" id="pf-active" checked={policyForm.isActive} onChange={e => setPolicyForm(f => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4 mt-0.5" />
              <div>
                <Label htmlFor="pf-active" className="font-medium">Policy active</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Turn off to deactivate a duplicate or retired policy. Employees cannot submit leave using types on an inactive policy.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPolicyDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!policyForm.effectiveFrom || updatePolicyMutation.isPending}
              onClick={() => {
                if (!editingPolicyId) return;
                const applicableEmploymentTypes = normalizeEmploymentTypesForSave(
                  policyForm.employmentMatchAll,
                  policyForm.applicableEmploymentTypes,
                );
                const applicableDepartments = policyForm.departmentMatchAll ? [] : policyForm.applicableDepartments;
                if (!policyForm.employmentMatchAll && applicableEmploymentTypes.length === 0) {
                  toast.error("Select at least one employment type, or enable “All employment types”.");
                  return;
                }
                if (!policyForm.departmentMatchAll && applicableDepartments.length === 0) {
                  toast.error("Select or add at least one department, or enable “All departments”.");
                  return;
                }
                updatePolicyMutation.mutate({
                  id: editingPolicyId,
                  body: {
                    effectiveFrom: policyForm.effectiveFrom,
                    effectiveTo: policyForm.effectiveTo || undefined,
                    isDefault: policyForm.isDefault,
                    isActive: policyForm.isActive,
                    unit: policyForm.unit,
                    workweek: policyForm.workweek,
                    holidayCalendarName: policyForm.holidayCalendarName || null,
                    periodStartMonth: policyForm.periodStartMonth,
                    applicableEmploymentTypes,
                    applicableDepartments,
                  },
                });
              }}
            >
              {updatePolicyMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave type create / edit dialog — four tabs */}
      <Dialog open={leaveTypeEdit.open} onOpenChange={open => !open && setLeaveTypeEdit({ open: false, mode: "edit", type: null })}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{leaveTypeEdit.mode === "create" ? "Add Leave Type" : `Edit: ${leaveTypeEdit.type?.name}`}</DialogTitle>
            <DialogDescription>
              {leaveTypeEdit.mode === "create" ? "New type will be auto-initialized for all active employees." : "Changes apply immediately."}
            </DialogDescription>
          </DialogHeader>

          {/* Name + paid + color — always visible */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end py-1">
            <div>
              <Label>Name</Label>
              <Input value={leaveTypeForm.name} onChange={e => setLeaveTypeForm(f => ({ ...f, name: e.target.value }))} className="mt-1" placeholder="e.g. Paternity Leave" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <Label className="text-xs">Paid</Label>
              <input type="checkbox" checked={leaveTypeForm.paid} onChange={e => setLeaveTypeForm(f => ({ ...f, paid: e.target.checked }))} className="h-4 w-4" />
            </div>
            <div>
              <Label className="text-xs">Color</Label>
              <input type="color" value={leaveTypeForm.color} onChange={e => setLeaveTypeForm(f => ({ ...f, color: e.target.value }))} className="mt-1 h-8 w-10 rounded border cursor-pointer p-0.5" />
            </div>
          </div>

          <Tabs defaultValue="accrual" className="mt-1">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="accrual">Accrual</TabsTrigger>
              <TabsTrigger value="balance">Balance</TabsTrigger>
              <TabsTrigger value="request">Request</TabsTrigger>
              <TabsTrigger value="additional">Additional</TabsTrigger>
            </TabsList>

            {/* ── Accrual rules ── */}
            <TabsContent value="accrual" className="space-y-3 pt-3">
              {leaveTypeForm.isCompensationLeave && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Compensation leave uses manual credit only — accrual is disabled.
                </p>
              )}
              <div>
                <Label>Accrual type</Label>
                <Select value={leaveTypeForm.accrualType} onValueChange={(v: any) => setLeaveTypeForm(f => ({ ...f, accrualType: v }))} disabled={leaveTypeForm.isCompensationLeave}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Fixed balance (no accrual)</SelectItem>
                    <SelectItem value="monthly">Monthly accrual</SelectItem>
                    <SelectItem value="yearly">Yearly grant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(leaveTypeForm.accrualType === "monthly" || leaveTypeForm.accrualType === "yearly") && (
                <div>
                  <Label># of days (accrual rate per period)</Label>
                  <Input type="number" min={0} step={0.25} value={leaveTypeForm.accrualRate} onChange={e => setLeaveTypeForm(f => ({ ...f, accrualRate: e.target.value }))} className="mt-1" placeholder="e.g. 1.0" />
                </div>
              )}
              <div>
                <Label>Max balance (days){leaveTypeForm.isCompensationLeave ? " — bank cap" : ""}</Label>
                <Input type="number" min={0} step={0.5} value={leaveTypeForm.maxBalance} onChange={e => setLeaveTypeForm(f => ({ ...f, maxBalance: e.target.value }))} className="mt-1" />
                {leaveTypeForm.isCompensationLeave && (
                  <p className="text-xs text-muted-foreground mt-1">Maximum comp-off days an employee can hold at once. Balance starts at 0 until HR adds credit.</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="ltf-proration" checked={leaveTypeForm.prorationRequired} onChange={e => setLeaveTypeForm(f => ({ ...f, prorationRequired: e.target.checked }))} className="h-4 w-4" disabled={leaveTypeForm.isCompensationLeave} />
                <div>
                  <Label htmlFor="ltf-proration">Proration required</Label>
                  <p className="text-xs text-muted-foreground">Pro-rate balance for employees joining mid-period; claw back on exit.</p>
                </div>
              </div>
            </TabsContent>

            {/* ── Balance rules ── */}
            <TabsContent value="balance" className="space-y-3 pt-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="ltf-compensation"
                    checked={leaveTypeForm.isCompensationLeave}
                    onChange={e => {
                      const checked = e.target.checked;
                      setLeaveTypeForm(f => ({
                        ...f,
                        isCompensationLeave: checked,
                        ...(checked
                          ? {
                              name: f.name.trim() ? f.name : "Compensation Leave",
                              paid: true,
                              accrualType: "none" as const,
                              accrualRate: "",
                              carryForwardAllowed: false,
                              maxCarryForward: "",
                              prorationRequired: false,
                              carryoverExpiryDays: "",
                              maxBalance: f.maxBalance === "21" ? "30" : f.maxBalance,
                            }
                          : {}),
                      }));
                    }}
                    className="h-4 w-4 mt-0.5"
                  />
                  <div>
                    <Label htmlFor="ltf-compensation" className="font-medium">Compensation leave (comp off)</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      For employees who work on a holiday or off day. Balance starts at <strong>0</strong> — manager or HR adds days in Leave Admin when credit is earned.
                      Employee can take the leave later. <strong>No auto accrual, no carry forward, no cash-in.</strong> Unused balance resets to 0 at year-end.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="ltf-negative" checked={leaveTypeForm.allowNegativeBalance} onChange={e => setLeaveTypeForm(f => ({ ...f, allowNegativeBalance: e.target.checked }))} className="h-4 w-4" disabled={leaveTypeForm.isCompensationLeave} />
                <Label htmlFor="ltf-negative">Allow requests beyond current balance (negative / advance)</Label>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="ltf-cf" checked={leaveTypeForm.carryForwardAllowed} onChange={e => setLeaveTypeForm(f => ({ ...f, carryForwardAllowed: e.target.checked }))} className="h-4 w-4" disabled={leaveTypeForm.isCompensationLeave} />
                <Label htmlFor="ltf-cf">Allow carryover to next period</Label>
              </div>
              {leaveTypeForm.carryForwardAllowed && !leaveTypeForm.isCompensationLeave && (
                <div className="pl-6 space-y-3">
                  <div>
                    <Label>Max carry forward (days, blank = unlimited)</Label>
                    <Input type="number" min={0} step={0.5} value={leaveTypeForm.maxCarryForward} onChange={e => setLeaveTypeForm(f => ({ ...f, maxCarryForward: e.target.value }))} className="mt-1" placeholder="Unlimited" />
                  </div>
                  <div>
                    <Label>Expire carryover balance after (days into new period, blank = never)</Label>
                    <Input type="number" min={1} step={1} value={leaveTypeForm.carryoverExpiryDays} onChange={e => setLeaveTypeForm(f => ({ ...f, carryoverExpiryDays: e.target.value }))} className="mt-1" placeholder="Never" />
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── Request rules ── */}
            <TabsContent value="request" className="space-y-3 pt-3">
              <div className="flex items-center gap-3">
                <input type="checkbox" id="ltf-req-approval" checked={leaveTypeForm.requiresApproval} onChange={e => setLeaveTypeForm(f => ({ ...f, requiresApproval: e.target.checked }))} className="h-4 w-4" />
                <Label htmlFor="ltf-req-approval">Requires approval</Label>
              </div>
              {leaveTypeForm.requiresApproval && (
                <div className="flex items-center gap-3 pl-6">
                  <input type="checkbox" id="ltf-hr-approval" checked={leaveTypeForm.hrApprovalRequired} onChange={e => setLeaveTypeForm(f => ({ ...f, hrApprovalRequired: e.target.checked }))} className="h-4 w-4" />
                  <Label htmlFor="ltf-hr-approval">HR approval required (in addition to manager)</Label>
                </div>
              )}
              <div className="flex items-center gap-3">
                <input type="checkbox" id="ltf-auto" checked={leaveTypeForm.autoApproveEnabled} onChange={e => setLeaveTypeForm(f => ({ ...f, autoApproveEnabled: e.target.checked }))} className="h-4 w-4" />
                <Label htmlFor="ltf-auto">Enable auto-approval</Label>
              </div>
              {leaveTypeForm.autoApproveEnabled && (
                <div className="pl-6">
                  <Label>Auto-approve if ≤ N days</Label>
                  <Input type="number" min={1} step={1} value={leaveTypeForm.autoApproveMaxDays} onChange={e => setLeaveTypeForm(f => ({ ...f, autoApproveMaxDays: e.target.value }))} className="mt-1" placeholder="1" />
                </div>
              )}
              <div className="border-t pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Min days per request</Label>
                    <Input type="number" min={0} step={0.5} value={leaveTypeForm.minDays} onChange={e => setLeaveTypeForm(f => ({ ...f, minDays: e.target.value }))} className="mt-1" placeholder="None" />
                  </div>
                  <div>
                    <Label>Max days per request</Label>
                    <Input type="number" min={0} step={1} value={leaveTypeForm.maxDaysPerRequest} onChange={e => setLeaveTypeForm(f => ({ ...f, maxDaysPerRequest: e.target.value }))} className="mt-1" placeholder="No limit" />
                  </div>
                </div>
                <div>
                  <Label>Restrict back-dating — limit (days in past, blank = no restriction)</Label>
                  <Input type="number" min={0} step={1} value={leaveTypeForm.backdatingLimitDays} onChange={e => setLeaveTypeForm(f => ({ ...f, backdatingLimitDays: e.target.value }))} className="mt-1" placeholder="No restriction" />
                </div>
                <div>
                  <Label>Minimum notice before leave starts (days, blank = no restriction)</Label>
                  <Input type="number" min={0} step={1} value={leaveTypeForm.minNoticeDays} onChange={e => setLeaveTypeForm(f => ({ ...f, minNoticeDays: e.target.value }))} className="mt-1" placeholder="No restriction" />
                </div>
              </div>
              <div className="border-t pt-3 space-y-3">
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="ltf-doc" checked={leaveTypeForm.requiresDocument} onChange={e => setLeaveTypeForm(f => ({ ...f, requiresDocument: e.target.checked }))} className="h-4 w-4" />
                  <Label htmlFor="ltf-doc">Always require supporting document</Label>
                </div>
                <div>
                  <Label>Mandatory document if request &gt; N days (blank = not enforced)</Label>
                  <Input type="number" min={0} step={1} value={leaveTypeForm.mandatoryAttachmentAboveDays} onChange={e => setLeaveTypeForm(f => ({ ...f, mandatoryAttachmentAboveDays: e.target.value }))} className="mt-1" placeholder="e.g. 10" />
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="ltf-behalf-doc" checked={leaveTypeForm.mandatoryAttachmentOnBehalf} onChange={e => setLeaveTypeForm(f => ({ ...f, mandatoryAttachmentOnBehalf: e.target.checked }))} className="h-4 w-4" />
                  <Label htmlFor="ltf-behalf-doc">Mandatory document when applying on behalf of an employee</Label>
                </div>
              </div>
            </TabsContent>

            {/* ── Additional rules ── */}
            <TabsContent value="additional" className="space-y-3 pt-3">
              <div>
                <Label>Waiting period after joining (days, blank = no waiting period)</Label>
                <Input type="number" min={0} step={1} value={leaveTypeForm.waitingPeriodDays} onChange={e => setLeaveTypeForm(f => ({ ...f, waitingPeriodDays: e.target.value }))} className="mt-1" placeholder="e.g. 90" />
                <p className="text-xs text-muted-foreground mt-1">Employees cannot use this leave type until N days after their joining date.</p>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="ltf-notice-period" checked={leaveTypeForm.blockedDuringNotice} onChange={e => setLeaveTypeForm(f => ({ ...f, blockedDuringNotice: e.target.checked }))} className="h-4 w-4" />
                <Label htmlFor="ltf-notice-period">Blocked during notice period</Label>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setLeaveTypeEdit({ open: false, mode: "edit", type: null })}>Cancel</Button>
            <Button
              disabled={updateLeaveTypeMutation.isPending || createLeaveTypeMutation.isPending}
              onClick={() => {
                const body: Record<string, unknown> = {
                  name: leaveTypeForm.name, paid: leaveTypeForm.paid, color: leaveTypeForm.color,
                  // accrual
                  accrualType: leaveTypeForm.accrualType,
                  accrualRate: leaveTypeForm.accrualRate !== "" ? parseFloat(leaveTypeForm.accrualRate) : null,
                  maxBalance: leaveTypeForm.maxBalance !== "" ? parseFloat(leaveTypeForm.maxBalance) : 21,
                  prorationRequired: leaveTypeForm.prorationRequired,
                  // balance
                  carryForwardAllowed: leaveTypeForm.carryForwardAllowed,
                  maxCarryForward: leaveTypeForm.carryForwardAllowed && leaveTypeForm.maxCarryForward !== "" ? parseFloat(leaveTypeForm.maxCarryForward) : null,
                  allowNegativeBalance: leaveTypeForm.allowNegativeBalance,
                  carryoverExpiryDays: leaveTypeForm.carryoverExpiryDays !== "" ? parseInt(leaveTypeForm.carryoverExpiryDays, 10) : null,
                  // request
                  requiresApproval: leaveTypeForm.requiresApproval,
                  hrApprovalRequired: leaveTypeForm.hrApprovalRequired,
                  autoApproveRules: leaveTypeForm.autoApproveEnabled && leaveTypeForm.autoApproveMaxDays !== "" ? { maxDays: parseInt(leaveTypeForm.autoApproveMaxDays, 10) } : null,
                  requiresDocument: leaveTypeForm.requiresDocument,
                  mandatoryAttachmentAboveDays: leaveTypeForm.mandatoryAttachmentAboveDays !== "" ? parseInt(leaveTypeForm.mandatoryAttachmentAboveDays, 10) : null,
                  mandatoryAttachmentOnBehalf: leaveTypeForm.mandatoryAttachmentOnBehalf,
                  minDays: leaveTypeForm.minDays !== "" ? parseFloat(leaveTypeForm.minDays) : null,
                  maxDaysPerRequest: leaveTypeForm.maxDaysPerRequest !== "" ? parseFloat(leaveTypeForm.maxDaysPerRequest) : null,
                  backdatingLimitDays: leaveTypeForm.backdatingLimitDays !== "" ? parseInt(leaveTypeForm.backdatingLimitDays, 10) : null,
                  minNoticeDays: leaveTypeForm.minNoticeDays !== "" ? parseInt(leaveTypeForm.minNoticeDays, 10) : null,
                  // additional
                  blockedDuringNotice: leaveTypeForm.blockedDuringNotice,
                  waitingPeriodDays: leaveTypeForm.waitingPeriodDays !== "" ? parseInt(leaveTypeForm.waitingPeriodDays, 10) : null,
                  isCompensationLeave: leaveTypeForm.isCompensationLeave,
                };
                if (leaveTypeEdit.mode === "create") {
                  if (!workingPolicyId) { toast.error("No policy found"); return; }
                  createLeaveTypeMutation.mutate({ ...body, policyId: workingPolicyId });
                } else {
                  if (!leaveTypeEdit.type?.id) return;
                  updateLeaveTypeMutation.mutate({ id: leaveTypeEdit.type.id, body });
                }
              }}
            >
              {(updateLeaveTypeMutation.isPending || createLeaveTypeMutation.isPending) ? "Saving…" : leaveTypeEdit.mode === "create" ? "Create & Initialize" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

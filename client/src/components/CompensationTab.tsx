import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { keepPreviousData } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { DollarSign, Banknote, TrendingUp, Plus, Trash2, Lock, Edit2, Eye, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTimeDisplay, formatLeaveDisplayDate } from "@/lib/dateUtils";
import {
  type AdditionalAllowance,
  type CalendarYearCompensationSummary,
  computeCalendarYearCompensationSummary,
  computeMonthlyGross,
  getMonthlyGrossFromRecord,
  normalizeAdditionalAllowances,
  parseSalaryAmount,
  salaryRecordHasBreakdown,
} from "@shared/compensationSalary";

// ===================== Types =====================
interface SalaryDetail {
  id: string;
  employee_id: string;
  annual_salary: string;
  base_salary_monthly?: string | null;
  allowances_monthly?: string | null;
  additional_allowances?: AdditionalAllowance[] | null;
  currency: string;
  start_date: string;
  is_current: string | boolean;
  reason: string | null;
  pay_rate: string | null;
  pay_rate_period: string | null;
  payout_frequency: string | null;
  pay_group: string | null;
  pay_method: string | null;
  eligible_work_hours: string | null;
  additional_details: string | null;
  notes: string | null;
  updated_at: string;
}

type AdditionalAllowanceFormRow = {
  key: string;
  label: string;
  amount: string;
  includeInGross: boolean;
};

interface BankingDetail {
  id: string;
  employee_id: string;
  bank_name: string;
  name_on_account: string;
  bank_code: string | null;
  account_number: string;
  iban: string | null;
  is_primary: string | boolean;
}

interface Bonus {
  id: string;
  employee_id: string;
  bonus_type: string;
  amount: string;
  currency: string;
  bonus_date: string;
  notes: string | null;
}

interface StockGrant {
  id: string;
  employee_id: string;
  units: number;
  grant_date: string;
  vesting_schedule: string | null;
  notes: string | null;
}

// ===================== Helpers =====================
function formatCurrency(amount: string | number, currency: string = "PKR") {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `${currency} ${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(dateStr: string | null | undefined, tz?: string | null, df?: string | null) {
  if (!dateStr) return "-";
  return formatLeaveDisplayDate(dateStr, tz ?? null, df ?? null);
}

function maskAccount(acc: string) {
  if (acc.length <= 4) return acc;
  return acc;
}

function newAllowanceRow(): AdditionalAllowanceFormRow {
  return { key: crypto.randomUUID(), label: "", amount: "", includeInGross: true };
}

function CalendarYearCommitmentCard({
  summary,
  joinDate,
  compact,
}: {
  summary: CalendarYearCompensationSummary;
  joinDate?: string | null;
  compact?: boolean;
}) {
  if (summary.payableMonths === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
        No payable months in {summary.year} (join date is after this year).
      </div>
    );
  }
  return (
    <div className={`rounded-lg border border-blue-200/70 bg-blue-50/50 dark:bg-blue-950/20 ${compact ? "p-3" : "p-4"} space-y-3`}>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">
          {summary.year} company commitment
        </p>
        <p className="text-xs text-blue-700/80 dark:text-blue-400/90 mt-0.5">
          {summary.periodLabel}
          {joinDate ? ` · joined ${formatLeaveDisplayDate(joinDate, null, null) || joinDate.slice(0, 10)}` : ""}
        </p>
      </div>
      <div className={compact ? "space-y-2 text-sm" : "grid grid-cols-2 gap-3 text-sm"}>
        <div>
          <p className="text-xs text-muted-foreground">Salary ({summary.payableMonths} mo × {summary.currency})</p>
          <p className="font-semibold">{formatCurrency(summary.salaryPortion, summary.currency)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Bonuses this year</p>
          <p className="font-semibold">{formatCurrency(summary.bonusesYtd, summary.currency)}</p>
        </div>
      </div>
      <div className="pt-2 border-t border-blue-200/60 dark:border-blue-800/60">
        <p className="text-xs text-muted-foreground">Total expected this year (salary + bonuses)</p>
        <p className={`font-bold text-blue-900 dark:text-blue-100 ${compact ? "text-lg" : "text-xl"}`}>
          {formatCurrency(summary.totalCompanyCommitment, summary.currency)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Full-year run rate (12 mo): {formatCurrency(summary.fullYearRunRate, summary.currency)}
        </p>
      </div>
    </div>
  );
}

function SalaryBreakdownView({ salary, currency }: { salary: SalaryDetail; currency: string }) {
  const hasBreakdown = salaryRecordHasBreakdown(salary);
  const additionals = normalizeAdditionalAllowances(salary.additional_allowances);
  const monthlyGross = getMonthlyGrossFromRecord(salary);

  if (!hasBreakdown) {
    return (
      <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-1">
        <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Imported total (breakdown not entered yet)</p>
        {monthlyGross != null && (
          <p className="text-sm font-semibold">{formatCurrency(monthlyGross, currency)} / month</p>
        )}
        <p className="text-xs text-muted-foreground">
          Annual: {formatCurrency(salary.annual_salary, currency)}
          {salary.additional_details ? ` · ${salary.additional_details}` : ""}
        </p>
      </div>
    );
  }

  const base = parseSalaryAmount(salary.base_salary_monthly);
  const allowances = parseSalaryAmount(salary.allowances_monthly);

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex justify-between items-baseline">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Monthly gross (calculated)</p>
        <p className="text-xl font-bold text-foreground">{formatCurrency(monthlyGross ?? 0, currency)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Base salary</p>
          <p className="font-medium">{formatCurrency(base, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Allowances</p>
          <p className="font-medium">{formatCurrency(allowances, currency)}</p>
        </div>
      </div>
      {additionals.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Additional allowances</p>
          {additionals.map((a, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span>
                {a.label || "Additional"}
                {!a.includeInGross && (
                  <span className="text-xs text-muted-foreground ml-1">(not in gross)</span>
                )}
              </span>
              <span className="font-medium">{formatCurrency(a.amount, currency)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===================== Sub-Dialogs =====================

/** Dialog to view full salary details (like the Freshteams screenshot) */
function SalaryDetailDialog({
  salary,
  open,
  onOpenChange,
  joinDate,
  bonuses,
}: {
  salary: SalaryDetail | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  joinDate?: string | null;
  bonuses?: Bonus[];
}) {
  const { user } = useAuth();
  if (!salary) return null;
  const yearSummary = computeCalendarYearCompensationSummary({
    joinDateIso: joinDate,
    monthlyGross: getMonthlyGrossFromRecord(salary),
    currency: salary.currency,
    bonuses,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-3">
            Salary Details
            <span className="text-xs text-muted-foreground font-normal">Updated on {formatDateTimeDisplay(salary.updated_at, user?.timeZone ?? null, user?.dateFormat ?? null)}</span>
          </DialogTitle>
          <DialogDescription>Detailed view of the compensation record.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2 overflow-y-auto min-h-0 flex-1 pr-1">
          <SalaryBreakdownView salary={salary} currency={salary.currency} />
          {yearSummary && (
            <CalendarYearCommitmentCard summary={yearSummary} joinDate={joinDate} />
          )}

          {/* Overview */}
          <div>
            <h4 className="font-bold text-sm mb-3">Overview</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Full-year equivalent (12 × monthly)</p>
                <p className="font-bold text-lg">{formatCurrency(salary.annual_salary, salary.currency)}</p>
                {(salary.is_current === "true" || salary.is_current === true) && <Badge variant="outline" className="bg-teal-100 text-teal-700 mt-1">Current</Badge>}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Start Date</p>
                <p className="font-medium">{formatDate(salary.start_date, user?.timeZone ?? null, user?.dateFormat ?? null)}</p>
              </div>
            </div>
            {salary.reason && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground">Reason</p>
                <p className="font-medium text-sm">{salary.reason}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Additional Details */}
          <div>
            <h4 className="font-bold text-sm mb-3">Additional Details</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Pay Rate</p>
                <p className="font-medium text-sm">{salary.pay_rate ? `${salary.currency} ${parseFloat(salary.pay_rate).toLocaleString()} / ${salary.pay_rate_period || "Monthly"}` : "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Payout Frequency</p>
                <p className="font-medium text-sm">{salary.payout_frequency || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pay Group</p>
                <p className="font-medium text-sm">{salary.pay_group || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pay Method</p>
                <p className="font-medium text-sm flex items-center gap-1"><CreditCard className="h-3 w-3" /> {salary.pay_method || "Direct Deposit"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Eligible Work Hours</p>
                <p className="font-medium text-sm">{salary.eligible_work_hours || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Additional Details on Compensation</p>
                <p className="font-medium text-sm">{salary.additional_details || "-"}</p>
              </div>
            </div>
          </div>

          {salary.notes && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Add Summary/Notes</p>
                <p className="text-sm">{salary.notes}</p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const emptySalaryForm = {
  currency: "PKR", startDate: "", reason: "", payGroup: "", payMethod: "Direct Deposit",
  eligibleWorkHours: "", additionalDetails: "", notes: "", isCurrent: "true",
  baseSalaryMonthly: "", allowancesMonthly: "", additionalAllowances: [] as AdditionalAllowanceFormRow[],
};

/** Form dialog for adding/editing salary */
function AddSalaryDialog({
  employeeId,
  open,
  onOpenChange,
  initialSalary,
  joinDate,
  bonuses,
}: {
  employeeId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialSalary?: SalaryDetail | null;
  joinDate?: string | null;
  bonuses?: Bonus[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptySalaryForm);
  const [saving, setSaving] = useState(false);
  const isEdit = !!initialSalary?.id;

  const computedGross = computeMonthlyGross(
    parseSalaryAmount(form.baseSalaryMonthly),
    parseSalaryAmount(form.allowancesMonthly),
    form.additionalAllowances.map((a) => ({
      label: a.label,
      amount: parseSalaryAmount(a.amount),
      includeInGross: a.includeInGross,
    })),
  );

  const previewYearSummary =
    computedGross > 0
      ? computeCalendarYearCompensationSummary({
          joinDateIso: joinDate,
          monthlyGross: computedGross,
          currency: form.currency,
          bonuses,
        })
      : null;

  useEffect(() => {
    if (open && initialSalary) {
      const start = initialSalary.start_date ? new Date(initialSalary.start_date).toISOString().slice(0, 10) : "";
      const additionals = normalizeAdditionalAllowances(initialSalary.additional_allowances).map((a) => ({
        key: crypto.randomUUID(),
        label: a.label,
        amount: a.amount ? String(a.amount) : "",
        includeInGross: a.includeInGross,
      }));
      setForm({
        currency: initialSalary.currency || "PKR",
        startDate: start,
        reason: initialSalary.reason || "",
        payGroup: initialSalary.pay_group || "",
        payMethod: initialSalary.pay_method || "Direct Deposit",
        eligibleWorkHours: initialSalary.eligible_work_hours || "",
        additionalDetails: initialSalary.additional_details || "",
        notes: initialSalary.notes || "",
        isCurrent: (initialSalary.is_current === true || initialSalary.is_current === "true") ? "true" : "false",
        baseSalaryMonthly: initialSalary.base_salary_monthly ?? "",
        allowancesMonthly: initialSalary.allowances_monthly ?? "",
        additionalAllowances: additionals,
      });
    } else if (open && !initialSalary) setForm(emptySalaryForm);
  }, [open, initialSalary]);

  const handleSave = async () => {
    if (!form.startDate) { toast.error("Start date is required"); return; }
    const hasBreakdownInput =
      form.baseSalaryMonthly.trim() !== "" ||
      form.allowancesMonthly.trim() !== "" ||
      form.additionalAllowances.some((a) => a.label.trim() || a.amount.trim());

    if (hasBreakdownInput && computedGross <= 0) {
      toast.error("Enter at least one positive amount in the salary breakdown");
      return;
    }
    if (!hasBreakdownInput && !isEdit) {
      toast.error("Enter base salary, allowances, or additional allowance amounts");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        currency: form.currency,
        startDate: form.startDate,
        reason: form.reason,
        payoutFrequency: "Monthly",
        payGroup: form.payGroup,
        payMethod: form.payMethod,
        eligibleWorkHours: form.eligibleWorkHours,
        additionalDetails: form.additionalDetails,
        notes: form.notes,
        isCurrent: form.isCurrent,
      };

      if (hasBreakdownInput) {
        payload.baseSalaryMonthly = form.baseSalaryMonthly || "0";
        payload.allowancesMonthly = form.allowancesMonthly || "0";
        payload.additionalAllowances = form.additionalAllowances
          .filter((a) => a.label.trim() || a.amount.trim())
          .map((a) => ({
            label: a.label.trim() || "Additional",
            amount: parseSalaryAmount(a.amount),
            includeInGross: a.includeInGross,
          }));
      } else if (isEdit && initialSalary) {
        payload.annualSalary = initialSalary.annual_salary;
        payload.payRate = initialSalary.pay_rate;
      }

      if (isEdit && initialSalary) {
        const resp = await fetch(`/api/compensation/salary/${initialSalary.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify(payload),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || err.message || await resp.text());
        }
        toast.success("Salary details updated");
      } else {
        const resp = await fetch(`/api/compensation/${employeeId}/salary`, {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify(payload),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || err.message || await resp.text());
        }
        toast.success("Salary details added");
      }
      queryClient.invalidateQueries({ queryKey: [`/api/compensation/${employeeId}/salary`] });
      onOpenChange(false);
      setForm(emptySalaryForm);
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? "Edit Salary Revision" : "Add Salary Revision"}</DialogTitle>
          <DialogDescription>
            Enter monthly base, allowances, and additional allowances. Monthly gross is calculated automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2 overflow-y-auto min-h-0 flex-1 pr-1">
          {isEdit && initialSalary && !salaryRecordHasBreakdown(initialSalary) && (
            <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
              This record was imported from FreshTeam ({formatCurrency(getMonthlyGrossFromRecord(initialSalary) ?? 0, initialSalary.currency)}/mo).
              Fill in the breakdown below to replace the imported total.
            </div>
          )}

          <div className="rounded-lg border border-green-200/80 bg-green-50/60 dark:bg-green-950/20 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-400">Monthly gross (calculated)</p>
            <p className="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">
              {formatCurrency(computedGross, form.currency)}
            </p>
          </div>

          {previewYearSummary && computedGross > 0 && (
            <CalendarYearCommitmentCard summary={previewYearSummary} joinDate={joinDate} compact />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Base salary (monthly)</Label>
              <Input type="number" min={0} placeholder="e.g. 63000" value={form.baseSalaryMonthly} onChange={(e) => setForm({ ...form, baseSalaryMonthly: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Allowances (monthly)</Label>
              <Input type="number" min={0} placeholder="e.g. 17000" value={form.allowancesMonthly} onChange={(e) => setForm({ ...form, allowancesMonthly: e.target.value })} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Additional allowances (monthly)</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, additionalAllowances: [...f.additionalAllowances, newAllowanceRow()] }))}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
            {form.additionalAllowances.length === 0 ? (
              <p className="text-xs text-muted-foreground">Optional — e.g. shift premium, hardship allowance.</p>
            ) : (
              form.additionalAllowances.map((row, idx) => (
                <div key={row.key} className="grid grid-cols-12 gap-2 items-end border border-border rounded-lg p-3">
                  <div className="col-span-4 space-y-1">
                    <Label className="text-xs">Label</Label>
                    <Input placeholder="e.g. Shift" value={row.label} onChange={(e) => {
                      const next = [...form.additionalAllowances];
                      next[idx] = { ...row, label: e.target.value };
                      setForm({ ...form, additionalAllowances: next });
                    }} />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs">Amount</Label>
                    <Input type="number" min={0} placeholder="5000" value={row.amount} onChange={(e) => {
                      const next = [...form.additionalAllowances];
                      next[idx] = { ...row, amount: e.target.value };
                      setForm({ ...form, additionalAllowances: next });
                    }} />
                  </div>
                  <div className="col-span-4 flex items-center gap-2 pb-2">
                    <Checkbox
                      id={`gross-${row.key}`}
                      checked={row.includeInGross}
                      onCheckedChange={(v) => {
                        const next = [...form.additionalAllowances];
                        next[idx] = { ...row, includeInGross: v === true };
                        setForm({ ...form, additionalAllowances: next });
                      }}
                    />
                    <Label htmlFor={`gross-${row.key}`} className="text-xs font-normal cursor-pointer">Include in gross</Label>
                  </div>
                  <div className="col-span-1 flex justify-end pb-1">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setForm((f) => ({ ...f, additionalAllowances: f.additionalAllowances.filter((_, i) => i !== idx) }))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PKR">PKR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="AED">AED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Start Date *</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="New Inductee">New Inductee</SelectItem>
                  <SelectItem value="Annual Appraisal">Annual Appraisal</SelectItem>
                  <SelectItem value="Promotion">Promotion</SelectItem>
                  <SelectItem value="Salary Correction">Salary Correction</SelectItem>
                  <SelectItem value="Probation Completion">Probation Completion</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isEdit && (
              <div className="space-y-1.5">
                <Label>Is current</Label>
                <Select value={form.isCurrent} onValueChange={(v) => setForm({ ...form, isCurrent: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes (current salary)</SelectItem>
                    <SelectItem value="false">No (historical)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Pay Method</Label>
              <Select value={form.payMethod} onValueChange={(v) => setForm({ ...form, payMethod: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Direct Deposit">Direct Deposit</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Pay Group</Label>
              <Input placeholder="e.g. Pakistan Monthly Payroll" value={form.payGroup} onChange={(e) => setForm({ ...form, payGroup: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Eligible Work Hours</Label>
              <Input placeholder="e.g. 9 Per Day" value={form.eligibleWorkHours} onChange={(e) => setForm({ ...form, eligibleWorkHours: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Legacy notes (from import)</Label>
              <Input placeholder="e.g. Base: 63000 Fuel: 7000" value={form.additionalDetails} onChange={(e) => setForm({ ...form, additionalDetails: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Summary / Notes</Label>
              <Textarea placeholder="Any notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t pt-4 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : isEdit ? "Update Salary" : "Save Salary Details"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Form dialog for banking */
function AddBankDialog({ employeeId, open, onOpenChange, initialBank }: { employeeId: string; open: boolean; onOpenChange: (v: boolean) => void; initialBank?: BankingDetail | null }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ bankName: "", nameOnAccount: "", bankCode: "", accountNumber: "", iban: "", isPrimary: true });
  const [saving, setSaving] = useState(false);
  const isEdit = !!initialBank?.id;

  useEffect(() => {
    if (open && initialBank) {
      setForm({
        bankName: initialBank.bank_name || "",
        nameOnAccount: initialBank.name_on_account || "",
        bankCode: initialBank.bank_code || "",
        accountNumber: initialBank.account_number || "",
        iban: initialBank.iban || "",
        isPrimary: initialBank.is_primary === true || initialBank.is_primary === "true",
      });
    } else if (open && !initialBank) setForm({ bankName: "", nameOnAccount: "", bankCode: "", accountNumber: "", iban: "", isPrimary: true });
  }, [open, initialBank]);

  const handleSave = async () => {
    if (!form.bankName || !form.nameOnAccount || !form.accountNumber) { toast.error("Bank name, account holder, and account number are required"); return; }
    setSaving(true);
    try {
      if (isEdit && initialBank) {
        const resp = await fetch(`/api/compensation/banking/${initialBank.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ ...form, isPrimary: form.isPrimary }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        toast.success("Banking details updated");
      } else {
        const resp = await fetch(`/api/compensation/${employeeId}/banking`, {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ ...form, isPrimary: true }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        toast.success("Banking details added");
      }
      queryClient.invalidateQueries({ queryKey: [`/api/compensation/${employeeId}/banking`] });
      onOpenChange(false);
      setForm({ bankName: "", nameOnAccount: "", bankCode: "", accountNumber: "", iban: "", isPrimary: true });
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Banking Details" : "Add Banking Details"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update this bank account." : "Employee bank account for salary disbursement."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Bank Name *</Label>
            <Input placeholder="e.g. Meezan Bank" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Name As Per Bank Account *</Label>
            <Input placeholder="Account holder name" value={form.nameOnAccount} onChange={(e) => setForm({ ...form, nameOnAccount: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Bank Code</Label>
              <Input placeholder="e.g. 0030" value={form.bankCode} onChange={(e) => setForm({ ...form, bankCode: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Account Number *</Label>
              <Input placeholder="Account number" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>IBAN</Label>
            <Input placeholder="e.g. PK71MEZN000030011417..." value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} />
          </div>
          {isEdit && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="bank-primary" checked={form.isPrimary} onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })} className="rounded border-input" />
              <Label htmlFor="bank-primary">Primary account</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : isEdit ? "Update" : "Save Banking Details"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Form dialog for bonus */
function AddBonusDialog({ employeeId, open, onOpenChange, initialBonus }: { employeeId: string; open: boolean; onOpenChange: (v: boolean) => void; initialBonus?: Bonus | null }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ bonusType: "", amount: "", currency: "PKR", bonusDate: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const isEdit = !!initialBonus?.id;

  useEffect(() => {
    if (open && initialBonus) {
      const d = initialBonus.bonus_date ? new Date(initialBonus.bonus_date).toISOString().slice(0, 10) : "";
      setForm({
        bonusType: initialBonus.bonus_type || "",
        amount: initialBonus.amount || "",
        currency: initialBonus.currency || "PKR",
        bonusDate: d,
        notes: initialBonus.notes || "",
      });
    } else if (open && !initialBonus) setForm({ bonusType: "", amount: "", currency: "PKR", bonusDate: "", notes: "" });
  }, [open, initialBonus]);

  const handleSave = async () => {
    if (!form.bonusType || !form.amount || !form.bonusDate) { toast.error("Type, amount, and date are required"); return; }
    setSaving(true);
    try {
      if (isEdit && initialBonus) {
        const resp = await fetch(`/api/compensation/bonuses/${initialBonus.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify(form),
        });
        if (!resp.ok) throw new Error(await resp.text());
        toast.success("Bonus updated");
      } else {
        const resp = await fetch(`/api/compensation/${employeeId}/bonuses`, {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify(form),
        });
        if (!resp.ok) throw new Error(await resp.text());
        toast.success("Bonus added");
      }
      queryClient.invalidateQueries({ queryKey: [`/api/compensation/${employeeId}/bonuses`] });
      onOpenChange(false);
      setForm({ bonusType: "", amount: "", currency: "PKR", bonusDate: "", notes: "" });
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Bonus" : "Add Bonus"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update this bonus record." : "Record a bonus for this employee."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Bonus Type *</Label>
            <Select value={form.bonusType} onValueChange={(v) => setForm({ ...form, bonusType: v })}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Performance">Performance</SelectItem>
                <SelectItem value="Holiday">Holiday</SelectItem>
                <SelectItem value="Signing">Signing</SelectItem>
                <SelectItem value="Spot">Spot</SelectItem>
                <SelectItem value="Eid">Eid</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount *</Label>
            <Input type="number" placeholder="e.g. 50000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PKR">PKR</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="AED">AED</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date *</Label>
            <Input type="date" value={form.bonusDate} onChange={(e) => setForm({ ...form, bonusDate: e.target.value })} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <Input placeholder="Optional notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : isEdit ? "Update Bonus" : "Save Bonus"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Form dialog for stock grant */
function AddStockGrantDialog({ employeeId, open, onOpenChange, initialStock }: { employeeId: string; open: boolean; onOpenChange: (v: boolean) => void; initialStock?: StockGrant | null }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ units: "", grantDate: "", vestingSchedule: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const isEdit = !!initialStock?.id;

  useEffect(() => {
    if (open && initialStock) {
      const d = initialStock.grant_date ? new Date(initialStock.grant_date).toISOString().slice(0, 10) : "";
      setForm({
        units: String(initialStock.units ?? ""),
        grantDate: d,
        vestingSchedule: initialStock.vesting_schedule || "",
        notes: initialStock.notes || "",
      });
    } else if (open && !initialStock) setForm({ units: "", grantDate: "", vestingSchedule: "", notes: "" });
  }, [open, initialStock]);

  const handleSave = async () => {
    if (!form.units || !form.grantDate) { toast.error("Units and grant date are required"); return; }
    setSaving(true);
    try {
      if (isEdit && initialStock) {
        const resp = await fetch(`/api/compensation/stock-grants/${initialStock.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ ...form, units: parseInt(form.units) }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        toast.success("Stock grant updated");
      } else {
        const resp = await fetch(`/api/compensation/${employeeId}/stock-grants`, {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ ...form, units: parseInt(form.units) }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        toast.success("Stock grant added");
      }
      queryClient.invalidateQueries({ queryKey: [`/api/compensation/${employeeId}/stock-grants`] });
      onOpenChange(false);
      setForm({ units: "", grantDate: "", vestingSchedule: "", notes: "" });
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Stock Grant" : "Add Stock Grant"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update this stock grant." : "Record stock/equity grant for this employee."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Units *</Label>
            <Input type="number" placeholder="e.g. 1000" value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Grant Date *</Label>
            <Input type="date" value={form.grantDate} onChange={(e) => setForm({ ...form, grantDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Vesting Schedule</Label>
            <Input placeholder="e.g. 4 years quarterly" value={form.vestingSchedule} onChange={(e) => setForm({ ...form, vestingSchedule: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input placeholder="Optional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : isEdit ? "Update Stock Grant" : "Save Stock Grant"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== MAIN COMPONENT =====================

export function CompensationTab({
  employeeId,
  canEdit,
  joinDate,
}: {
  employeeId?: string;
  canEdit: boolean;
  /** Employee join date — used for calendar-year pro-rated commitment */
  joinDate?: string | null;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Dialog state
  const [showAddSalary, setShowAddSalary] = useState(false);
  const [showAddBank, setShowAddBank] = useState(false);
  const [showAddBonus, setShowAddBonus] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);
  const [viewSalary, setViewSalary] = useState<SalaryDetail | null>(null);
  const [editSalary, setEditSalary] = useState<SalaryDetail | null>(null);
  const [editBank, setEditBank] = useState<BankingDetail | null>(null);
  const [editBonus, setEditBonus] = useState<Bonus | null>(null);
  const [editStock, setEditStock] = useState<StockGrant | null>(null);

  // Queries
  const unwrap = (json: any): any[] => (Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []);

  const { data: salaries = [] } = useQuery<SalaryDetail[]>({
    queryKey: [`/api/compensation/${employeeId}/salary`],
    queryFn: async () => {
      const resp = await fetch(`/api/compensation/${employeeId}/salary`, { credentials: "include" });
      if (!resp.ok) return [];
      return unwrap(await resp.json());
    },
    enabled: !!employeeId,
    placeholderData: keepPreviousData,
  });

  const { data: bankAccounts = [] } = useQuery<BankingDetail[]>({
    queryKey: [`/api/compensation/${employeeId}/banking`],
    queryFn: async () => {
      const resp = await fetch(`/api/compensation/${employeeId}/banking`, { credentials: "include" });
      if (!resp.ok) return [];
      return unwrap(await resp.json());
    },
    enabled: !!employeeId,
    placeholderData: keepPreviousData,
  });

  const { data: bonusList = [] } = useQuery<Bonus[]>({
    queryKey: [`/api/compensation/${employeeId}/bonuses`],
    queryFn: async () => {
      const resp = await fetch(`/api/compensation/${employeeId}/bonuses`, { credentials: "include" });
      if (!resp.ok) return [];
      return unwrap(await resp.json());
    },
    enabled: !!employeeId,
    placeholderData: keepPreviousData,
  });

  const { data: stockGrants = [] } = useQuery<StockGrant[]>({
    queryKey: [`/api/compensation/${employeeId}/stock-grants`],
    queryFn: async () => {
      const resp = await fetch(`/api/compensation/${employeeId}/stock-grants`, { credentials: "include" });
      if (!resp.ok) return [];
      return unwrap(await resp.json());
    },
    enabled: !!employeeId,
    placeholderData: keepPreviousData,
  });

  // Ensure arrays (guard against cached envelope or placeholderData from previous query)
  const salariesList = Array.isArray(salaries) ? salaries : [];
  const bankAccountsList = Array.isArray(bankAccounts) ? bankAccounts : [];
  const bonusListSafe = Array.isArray(bonusList) ? bonusList : [];
  const stockGrantsList = Array.isArray(stockGrants) ? stockGrants : [];

  // Delete helpers
  const deleteSalary = async (id: string) => {
    if (!confirm("Delete this salary record?")) return;
    try {
      await fetch(`/api/compensation/salary/${id}`, { method: "DELETE", credentials: "include" });
      queryClient.invalidateQueries({ queryKey: [`/api/compensation/${employeeId}/salary`] });
      toast.success("Salary record deleted");
    } catch { toast.error("Failed to delete"); }
  };
  const deleteBank = async (id: string) => {
    if (!confirm("Delete this bank account?")) return;
    try {
      await fetch(`/api/compensation/banking/${id}`, { method: "DELETE", credentials: "include" });
      queryClient.invalidateQueries({ queryKey: [`/api/compensation/${employeeId}/banking`] });
      toast.success("Bank account deleted");
    } catch { toast.error("Failed to delete"); }
  };
  const deleteBonus = async (id: string) => {
    if (!confirm("Delete this bonus?")) return;
    try {
      await fetch(`/api/compensation/bonuses/${id}`, { method: "DELETE", credentials: "include" });
      queryClient.invalidateQueries({ queryKey: [`/api/compensation/${employeeId}/bonuses`] });
      toast.success("Bonus deleted");
    } catch { toast.error("Failed to delete"); }
  };
  const deleteStock = async (id: string) => {
    if (!confirm("Delete this stock grant?")) return;
    try {
      await fetch(`/api/compensation/stock-grants/${id}`, { method: "DELETE", credentials: "include" });
      queryClient.invalidateQueries({ queryKey: [`/api/compensation/${employeeId}/stock-grants`] });
      toast.success("Stock grant deleted");
    } catch { toast.error("Failed to delete"); }
  };

  const currentSalary = salariesList.find((s) => s.is_current === true || s.is_current === "true");
  const totalStockUnits = stockGrantsList.reduce((sum, g) => sum + Number(g.units), 0);

  const currentYearSummary =
    currentSalary != null
      ? computeCalendarYearCompensationSummary({
          joinDateIso: joinDate,
          monthlyGross: getMonthlyGrossFromRecord(currentSalary),
          currency: currentSalary.currency,
          bonuses: bonusListSafe,
        })
      : null;

  if (!employeeId) return <TabsContent value="compensation"><p className="text-muted-foreground">No employee data.</p></TabsContent>;

  return (
    <TabsContent value="compensation" className="space-y-6">
      {/* ==================== SALARY DETAILS (top section, like Freshteams screenshot) ==================== */}
      <Card className="border border-border shadow-sm flex flex-col max-h-[min(70vh,42rem)]">
        <CardHeader className="flex flex-row items-center justify-between pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Salary Details</CardTitle>
            <Lock className="h-3.5 w-3.5 text-red-400" />
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => { setEditSalary(null); setShowAddSalary(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add New
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="overflow-y-auto min-h-0 flex-1">
          {salariesList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No salary records yet. {canEdit ? "Click 'Add New' to enter the first salary details." : "HR will add salary details."}
            </div>
          ) : (
            <div className="space-y-0">
              {/* Current salary as highlight card */}
              {currentSalary && (
                <div
                  className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-lg border border-green-200/60 cursor-pointer hover:shadow-md transition-shadow mb-4 group/card"
                  onClick={() => setViewSalary(currentSalary)}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wider">
                        {salaryRecordHasBreakdown(currentSalary) ? "Current monthly gross" : "Current monthly pay (imported)"}
                      </p>
                      <h2 className="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">
                        {formatCurrency(getMonthlyGrossFromRecord(currentSalary) ?? 0, currentSalary.currency)}
                        <span className="text-sm font-normal text-green-700 dark:text-green-400 ml-1">/ month</span>
                      </h2>
                      {salaryRecordHasBreakdown(currentSalary) ? (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                          Base {formatCurrency(parseSalaryAmount(currentSalary.base_salary_monthly), currentSalary.currency)}
                          {" · "}Allowances {formatCurrency(parseSalaryAmount(currentSalary.allowances_monthly), currentSalary.currency)}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">Breakdown not entered — edit to add base &amp; allowances</p>
                      )}
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        Effective: {formatDate(currentSalary.start_date, user?.timeZone ?? null, user?.dateFormat ?? null)} {currentSalary.reason ? `- ${currentSalary.reason}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover/card:opacity-100" onClick={(e) => { e.stopPropagation(); setEditSalary(currentSalary); setShowAddSalary(true); }}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                      <div className="bg-white dark:bg-green-900/40 p-2 rounded-full shadow-sm">
                        <DollarSign className="h-5 w-5 text-green-600" />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-green-500 mt-3 underline">Click for breakdown details</p>
                </div>
              )}

              {currentYearSummary && (
                <CalendarYearCommitmentCard summary={currentYearSummary} joinDate={joinDate} />
              )}

              {/* Salary timeline / history */}
              {salariesList.length > 1 && (
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3">Salary History</h4>
                  <div className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-3 space-y-6 pl-6 pb-2">
                    {salariesList.map((s, i) => {
                      const prevSalary = salariesList[i + 1];
                      const monthly = getMonthlyGrossFromRecord(s);
                      const prevMonthly = prevSalary ? getMonthlyGrossFromRecord(prevSalary) : null;
                      let change = "";
                      if (prevMonthly != null && monthly != null && prevMonthly > 0) {
                        const pct = ((monthly - prevMonthly) / prevMonthly * 100);
                        change = pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
                      }
                      return (
                        <div key={s.id} className="relative group">
                          <div className={`absolute -left-[29px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-800 shadow-sm ${(s.is_current === true || s.is_current === "true") ? "bg-green-500" : "bg-blue-500"}`} />
                          <div className="flex justify-between items-start">
                            <div
                              className="cursor-pointer hover:underline"
                              onClick={() => setViewSalary(s)}
                            >
                              <p className="font-bold text-sm">
                                {formatCurrency(monthly ?? 0, s.currency)}
                                <span className="text-xs font-normal text-muted-foreground ml-1">/ mo</span>
                              </p>
                              <p className="text-xs text-muted-foreground">{s.reason || "Salary entry"}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <p className="text-xs font-medium">{formatDate(s.start_date, user?.timeZone ?? null, user?.dateFormat ?? null)}</p>
                                {change && (
                                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${parseFloat(change) >= 0 ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50"}`}>{change}</span>
                                )}
                              </div>
                              {canEdit && (
                                <>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setEditSalary(s); setShowAddSalary(true); }}>
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); deleteSalary(s.id); }}>
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ==================== BANKING DETAILS ==================== */}
      <Card className="border border-border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Banking Details</CardTitle>
            <Lock className="h-3.5 w-3.5 text-red-400" />
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => { setEditBank(null); setShowAddBank(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {bankAccountsList.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">No banking details on record.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-9">Bank Name</TableHead>
                  <TableHead className="h-9">Name As Per Bank Account</TableHead>
                  <TableHead className="h-9">Bank Code</TableHead>
                  <TableHead className="h-9">Account Number</TableHead>
                  {canEdit && <TableHead className="h-9 w-20"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankAccountsList.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-sm font-medium">{b.bank_name}</TableCell>
                    <TableCell className="text-sm">{b.name_on_account}</TableCell>
                    <TableCell className="text-sm">{b.bank_code || "-"}</TableCell>
                    <TableCell className="text-sm font-mono">{b.account_number}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex items-center gap-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditBank(b); setShowAddBank(true); }}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteBank(b.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {bankAccountsList.length > 0 && bankAccountsList[0].iban && (
            <div className="mt-3 px-1">
              <p className="text-xs text-muted-foreground">IBAN</p>
              <p className="text-sm font-mono font-medium">{bankAccountsList[0].iban}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ==================== BONUSES + STOCK GRANTS (side by side) ==================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bonuses */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base">Bonuses</CardTitle>
              {currentYearSummary && (
                <p className="text-xs text-muted-foreground font-normal mt-0.5">
                  Counted in {currentYearSummary.year} commitment above
                </p>
              )}
            </div>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => { setEditBonus(null); setShowAddBonus(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          )}
          </CardHeader>
          <CardContent>
            {bonusListSafe.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">No Records</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8">Date</TableHead>
                    <TableHead className="h-8">Type</TableHead>
                    <TableHead className="h-8 text-right">Amount</TableHead>
                    {canEdit && <TableHead className="h-8 w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bonusListSafe.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs">{formatDate(b.bonus_date, user?.timeZone ?? null, user?.dateFormat ?? null)}</TableCell>
                      <TableCell className="text-xs">{b.bonus_type}</TableCell>
                      <TableCell className="text-xs font-bold text-right">{formatCurrency(b.amount, b.currency)}</TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex items-center gap-0">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditBonus(b); setShowAddBonus(true); }}>
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteBonus(b.id)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Stock Grants */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Stock Grants</CardTitle>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => { setEditStock(null); setShowAddStock(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          )}
          </CardHeader>
          <CardContent>
            {stockGrantsList.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">No Records</div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-slate-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Units</p>
                    <p className="font-bold text-lg">{totalStockUnits.toLocaleString()}</p>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8">Date</TableHead>
                      <TableHead className="h-8">Units</TableHead>
                      <TableHead className="h-8">Vesting</TableHead>
                      {canEdit && <TableHead className="h-8 w-10"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockGrantsList.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="text-xs">{formatDate(g.grant_date, user?.timeZone ?? null, user?.dateFormat ?? null)}</TableCell>
                        <TableCell className="text-xs font-bold">{Number(g.units).toLocaleString()}</TableCell>
                        <TableCell className="text-xs">{g.vesting_schedule || "-"}</TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex items-center gap-0">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditStock(g); setShowAddStock(true); }}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteStock(g.id)}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ==================== Dialogs ==================== */}
      <SalaryDetailDialog
        salary={viewSalary}
        open={!!viewSalary}
        onOpenChange={(v) => !v && setViewSalary(null)}
        joinDate={joinDate}
        bonuses={bonusListSafe}
      />
      {employeeId && (
        <AddSalaryDialog
          employeeId={employeeId}
          open={showAddSalary}
          onOpenChange={(v) => { setShowAddSalary(v); if (!v) setEditSalary(null); }}
          initialSalary={editSalary}
          joinDate={joinDate}
          bonuses={bonusListSafe}
        />
      )}
      {employeeId && (
        <AddBankDialog
          employeeId={employeeId}
          open={showAddBank}
          onOpenChange={(v) => { setShowAddBank(v); if (!v) setEditBank(null); }}
          initialBank={editBank}
        />
      )}
      {employeeId && (
        <AddBonusDialog
          employeeId={employeeId}
          open={showAddBonus}
          onOpenChange={(v) => { setShowAddBonus(v); if (!v) setEditBonus(null); }}
          initialBonus={editBonus}
        />
      )}
      {employeeId && (
        <AddStockGrantDialog
          employeeId={employeeId}
          open={showAddStock}
          onOpenChange={(v) => { setShowAddStock(v); if (!v) setEditStock(null); }}
          initialStock={editStock}
        />
      )}
    </TabsContent>
  );
}

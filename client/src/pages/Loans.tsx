import { useState, useMemo, useEffect } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign, FileText, Clock, Plus, CheckCircle2, XCircle,
  AlertCircle, TrendingDown, Users, Activity, Calendar,
  Edit, Trash2, Play, Pause, Eye, ChevronRight, Banknote,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { EmployeeSelect } from "@/components/EmployeeSelect";
import { LoanCurrencySelect } from "@/components/loans/LoanCurrencySelect";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchLoanList, invalidateLoanQueries, unwrapApiData } from "@/lib/loanQueries";
import {
  DEFAULT_LOAN_CURRENCY,
  formatLoanAmount,
  formatAmountsByCurrency,
  normalizeLoanCurrency,
  sumAmountsByCurrency,
} from "@shared/loanCurrency";
import { formatDateOnly, formatDateTimeDisplay } from "@/lib/dateUtils";

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmtCalendarDate = (d: string | null | undefined, df?: string | null) =>
  formatDateOnly(d, df) ?? "—";

const fmtAppliedAt = (
  d: string | null | undefined,
  tz?: string | null,
  df?: string | null,
) => formatDateTimeDisplay(d, tz, df);

const LOAN_TYPE_LABEL: Record<string, string> = {
  salary_advance: "Salary Advance",
  personal_loan:  "Personal Loan",
  other:          "Other",
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending:   { label: "Pending",   className: "bg-amber-500/10  text-amber-700  border-amber-200  dark:text-amber-400" },
  approved:  { label: "Approved",  className: "bg-green-500/10  text-green-700  border-green-200  dark:text-green-400" },
  rejected:  { label: "Rejected",  className: "bg-red-500/10    text-red-700    border-red-200    dark:text-red-400"   },
  active:    { label: "Active",    className: "bg-green-500/10  text-green-700  border-green-200  dark:text-green-400" },
  completed: { label: "Completed", className: "bg-slate-500/10  text-slate-600  border-slate-200  dark:text-slate-400" },
  paused:    { label: "Paused",    className: "bg-blue-500/10   text-blue-700   border-blue-200   dark:text-blue-400"  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? { label: status, className: "" };
  return (
    <Badge variant="outline" className={cn("capitalize", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

// ── Employee View ────────────────────────────────────────────────────────────

function EmployeeView() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [applyOpen, setApplyOpen]     = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [form, setForm]               = useState({
    loanType: "personal_loan", currency: DEFAULT_LOAN_CURRENCY,
    requestedAmount: "", requestedTenure: "",
    reason: "", supportingNote: "",
  });

  const { data: applications = [], isLoading: loadingApps } = useQuery<any[]>({
    queryKey: ["/api/loans/my-applications"],
    queryFn: () => fetchLoanList("/api/loans/my-applications"),
  });

  const { data: records = [], isLoading: loadingRecords } = useQuery<any[]>({
    queryKey: ["/api/loans/my-records"],
    queryFn: () => fetchLoanList("/api/loans/my-records"),
  });

  const applyMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/loans/applications", data);
      return unwrapApiData<any>(await res.json());
    },
    onSuccess: (created) => {
      if (created?.id) {
        qc.setQueryData<any[]>(["/api/loans/my-applications"], (old) => {
          const list = Array.isArray(old) ? old : [];
          if (list.some((a) => a.id === created.id)) return list;
          return [created, ...list];
        });
      }
      void invalidateLoanQueries(qc);
      setApplySuccess(true);
      setForm({ loanType: "personal_loan", currency: DEFAULT_LOAN_CURRENCY, requestedAmount: "", requestedTenure: "", reason: "", supportingNote: "" });
    },
    onError: async (err: any) => {
      const msg = await err?.response?.json?.().catch?.(() => null);
      toast.error(msg?.error ?? "Failed to submit application");
    },
  });

  const handleApply = () => {
    if (!form.requestedAmount || !form.requestedTenure || !form.reason.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }
    applyMutation.mutate({
      loanType:        form.loanType,
      currency:        form.currency,
      requestedAmount: parseFloat(form.requestedAmount),
      requestedTenure: parseInt(form.requestedTenure, 10),
      reason:          form.reason.trim(),
      supportingNote:  form.supportingNote.trim() || null,
    });
  };

  const activeRecords     = records.filter(r => r.status === "active");
  const outstandingByCurrency = sumAmountsByCurrency(activeRecords, (r) => r.outstanding_balance);
  const monthlyByCurrency     = sumAmountsByCurrency(activeRecords, (r) => r.monthly_deduction);
  const pendingApps       = applications.filter(a => a.status === "pending");

  const monthlyDeduction = useMemo(() => {
    const amt = parseFloat(form.requestedAmount);
    const ten = parseInt(form.requestedTenure, 10);
    if (amt > 0 && ten > 0) return amt / ten;
    return null;
  }, [form.requestedAmount, form.requestedTenure]);

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">My Loans & Advances</h1>
          <p className="text-sm text-muted-foreground mt-1">Apply for loans, track balances, and view repayment history.</p>
        </div>
        <Button onClick={() => { setApplyOpen(true); setApplySuccess(false); }} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" /> Apply for Loan
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white border-none shadow-lg">
          <CardContent className="p-5 flex justify-between items-start">
            <div>
              <p className="text-blue-100 text-xs font-medium uppercase tracking-wide">Total Outstanding</p>
              <p className="text-2xl font-bold mt-1">{formatAmountsByCurrency(outstandingByCurrency)}</p>
              <p className="text-blue-200 text-xs mt-2">{activeRecords.length} active loan{activeRecords.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="bg-white/20 p-2 rounded-lg">
              <DollarSign className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex justify-between items-start">
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Monthly Deduction</p>
              <p className="text-2xl font-bold mt-1 text-foreground">{formatAmountsByCurrency(monthlyByCurrency)}</p>
              <p className="text-muted-foreground text-xs mt-2">Deducted from salary each month</p>
            </div>
            <div className="bg-amber-100 dark:bg-amber-900/20 p-2 rounded-lg">
              <TrendingDown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex justify-between items-start">
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Pending Applications</p>
              <p className="text-2xl font-bold mt-1 text-foreground">{pendingApps.length}</p>
              <p className="text-muted-foreground text-xs mt-2">Awaiting HR review</p>
            </div>
            <div className="bg-orange-100 dark:bg-orange-900/20 p-2 rounded-lg">
              <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Loans */}
      {activeRecords.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">Active Loans</h2>
          <div className="space-y-3">
            {activeRecords.map(record => {
              const total     = parseFloat(record.total_amount ?? 0);
              const paid      = total - parseFloat(record.outstanding_balance ?? 0);
              const pct       = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
              return (
                <Card key={record.id} className="border border-border hover:border-primary/40 transition-colors">
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row gap-4 justify-between">
                      <div className="flex items-start gap-3">
                        <div className={cn("p-2.5 rounded-lg", record.loan_type === "personal_loan"
                          ? "bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400"
                          : "bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400")}>
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{LOAN_TYPE_LABEL[record.loan_type] ?? record.loan_type}</p>
                          <p className="text-xs text-muted-foreground">Started {fmtCalendarDate(record.effective_start_date, user?.dateFormat ?? null)}</p>
                          <StatusBadge status={record.status} />
                        </div>
                      </div>
                      <div className="flex gap-8 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs">Total Loan</p>
                          <p className="font-bold text-foreground">{formatLoanAmount(record.total_amount, record.currency)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Outstanding</p>
                          <p className="font-bold text-foreground">{formatLoanAmount(record.outstanding_balance, record.currency)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Monthly</p>
                          <p className="font-bold text-foreground">{formatLoanAmount(record.monthly_deduction, record.currency)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Progress</p>
                          <p className="font-bold text-foreground">{record.months_paid} / {record.approved_tenure} mo</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{formatLoanAmount(paid, record.currency)} repaid</span>
                        <span>{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* My Applications */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3">My Applications</h2>
        {loadingApps ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : applications.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No loan applications yet.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => { setApplyOpen(true); setApplySuccess(false); }}>
                Apply for your first loan
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {applications.map(app => (
              <Card key={app.id} className="border border-border">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {app.status === "pending"  && <Clock       className="h-4 w-4 text-amber-500" />}
                      {app.status === "approved" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {app.status === "rejected" && <XCircle      className="h-4 w-4 text-red-500"   />}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-foreground">{LOAN_TYPE_LABEL[app.loan_type] ?? app.loan_type}</p>
                      <p className="text-xs text-muted-foreground">{formatLoanAmount(app.requested_amount, app.currency)} • {app.requested_tenure} months • Applied {fmtAppliedAt(app.applied_at, user?.timeZone ?? null, user?.dateFormat ?? null)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{app.reason}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={app.status} />
                    {app.status === "rejected" && app.rejection_reason && (
                      <p className="text-xs text-red-600 max-w-[200px] truncate" title={app.rejection_reason}>
                        Reason: {app.rejection_reason}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Apply Dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Apply for Loan / Advance</DialogTitle>
            <DialogDescription>Submit a loan request. HR will review and respond.</DialogDescription>
          </DialogHeader>

          {applySuccess ? (
            <div className="py-8 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <p className="font-semibold text-foreground">Application Submitted!</p>
              <p className="text-sm text-muted-foreground">Your loan request is pending HR review. You'll be notified once a decision is made.</p>
              <Button variant="outline" onClick={() => setApplyOpen(false)}>Close</Button>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Loan Type <span className="text-red-500">*</span></Label>
                  <Select value={form.loanType} onValueChange={v => setForm(f => ({ ...f, loanType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="salary_advance">Salary Advance</SelectItem>
                      <SelectItem value="personal_loan">Personal Loan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <LoanCurrencySelect
                  value={form.currency}
                  onChange={(currency) => setForm((f) => ({ ...f, currency }))}
                  required
                />

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Amount ({form.currency}) <span className="text-red-500">*</span></Label>
                    <Input
                      type="number" min="1" placeholder="50000"
                      value={form.requestedAmount}
                      onChange={e => setForm(f => ({ ...f, requestedAmount: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tenure (months) <span className="text-red-500">*</span></Label>
                    <Input
                      type="number" min="1" max="60" placeholder="12"
                      value={form.requestedTenure}
                      onChange={e => setForm(f => ({ ...f, requestedTenure: e.target.value }))}
                    />
                  </div>
                </div>

                {monthlyDeduction !== null && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
                    <span className="text-muted-foreground">Estimated monthly deduction: </span>
                    <span className="font-bold text-blue-700 dark:text-blue-400">{formatLoanAmount(monthlyDeduction, form.currency)}/month</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Reason / Purpose <span className="text-red-500">*</span></Label>
                  <Textarea
                    placeholder="Explain why you need this loan…"
                    rows={3}
                    value={form.reason}
                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Supporting Note <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Textarea
                    placeholder="Any additional context for HR…"
                    rows={2}
                    value={form.supportingNote}
                    onChange={e => setForm(f => ({ ...f, supportingNote: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
                <Button onClick={handleApply} disabled={applyMutation.isPending}>
                  {applyMutation.isPending ? "Submitting…" : "Submit Application"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── HR Approval Modal ────────────────────────────────────────────────────────

function ApprovalDialog({
  application, open, onClose,
}: {
  application: any;
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [decision, setDecision]       = useState<"approve" | "reject">("approve");
  const [approvedAmount, setApprovedAmount]   = useState("");
  const [approvedTenure, setApprovedTenure]   = useState("");
  const [effectiveDate, setEffectiveDate]     = useState("");
  const [disbursementDate, setDisbursementDate] = useState("");
  const [hrNotes, setHrNotes]                 = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [currency, setCurrency]               = useState(DEFAULT_LOAN_CURRENCY);

  useEffect(() => {
    if (application && open) {
      setCurrency(normalizeLoanCurrency(application.currency));
      setApprovedAmount("");
      setApprovedTenure("");
      setEffectiveDate("");
      setDisbursementDate("");
      setHrNotes("");
      setRejectionReason("");
      setDecision("approve");
    }
  }, [application?.id, open]);

  const monthlyDeduction = useMemo(() => {
    const amt = parseFloat(approvedAmount);
    const ten = parseInt(approvedTenure, 10);
    if (amt > 0 && ten > 0) return amt / ten;
    return null;
  }, [approvedAmount, approvedTenure]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (decision === "approve") {
        if (!approvedAmount || !approvedTenure || !effectiveDate) throw new Error("Fill all required fields");
        return apiRequest("PATCH", `/api/loans/applications/${application.id}/approve`, {
          approvedAmount:  parseFloat(approvedAmount),
          approvedTenure:  parseInt(approvedTenure, 10),
          currency,
          effectiveStartDate: effectiveDate,
          disbursementDate: disbursementDate || null,
          monthlyDeduction,
          hrNotes: hrNotes || null,
        });
      } else {
        if (!rejectionReason.trim()) throw new Error("Rejection reason is required");
        return apiRequest("PATCH", `/api/loans/applications/${application.id}/reject`, {
          rejectionReason: rejectionReason.trim(),
        });
      }
    },
    onSuccess: () => {
      toast.success(decision === "approve" ? "Loan approved and record created" : "Application rejected");
      void invalidateLoanQueries(qc);
      onClose();
    },
    onError: async (err: any) => {
      const msg = await err?.response?.json?.().catch?.(() => null);
      toast.error(msg?.error ?? err?.message ?? "Action failed");
    },
  });

  if (!application) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Loan Application</DialogTitle>
          <DialogDescription>
            {application.first_name} {application.last_name} — {LOAN_TYPE_LABEL[application.loan_type]}
          </DialogDescription>
        </DialogHeader>

        {/* Read-only applicant details */}
        <div className="bg-muted/40 rounded-lg p-4 space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <div><span className="text-muted-foreground">Employee ID:</span> <span className="font-medium">{application.emp_id}</span></div>
            <div><span className="text-muted-foreground">Department:</span> <span className="font-medium">{application.department ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Currency:</span> <span className="font-medium">{normalizeLoanCurrency(application.currency)}</span></div>
            <div><span className="text-muted-foreground">Requested Amount:</span> <span className="font-bold text-foreground">{formatLoanAmount(application.requested_amount, application.currency)}</span></div>
            <div><span className="text-muted-foreground">Requested Tenure:</span> <span className="font-medium">{application.requested_tenure} months</span></div>
            <div className="col-span-2"><span className="text-muted-foreground">Applied:</span> <span className="font-medium">{fmtAppliedAt(application.applied_at, user?.timeZone ?? null, user?.dateFormat ?? null)}</span></div>
          </div>
          <Separator className="my-2" />
          <div><span className="text-muted-foreground text-xs font-medium uppercase">Reason:</span>
            <p className="mt-0.5 text-foreground">{application.reason}</p>
          </div>
          {application.supporting_note && (
            <div><span className="text-muted-foreground text-xs font-medium uppercase">Note:</span>
              <p className="mt-0.5 text-foreground">{application.supporting_note}</p>
            </div>
          )}
        </div>

        {/* Decision */}
        <div className="space-y-4">
          <div className="flex gap-3">
            <Button
              variant={decision === "approve" ? "default" : "outline"}
              size="sm" className="flex-1"
              onClick={() => setDecision("approve")}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve
            </Button>
            <Button
              variant={decision === "reject" ? "destructive" : "outline"}
              size="sm" className="flex-1"
              onClick={() => setDecision("reject")}
            >
              <XCircle className="h-4 w-4 mr-1.5" /> Reject
            </Button>
          </div>

          {decision === "approve" && (
            <div className="space-y-3">
              <LoanCurrencySelect
                value={currency}
                onChange={setCurrency}
                label="Loan currency"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Approved Amount ({currency}) <span className="text-red-500">*</span></Label>
                  <Input
                    type="number" min="1"
                    value={approvedAmount}
                    placeholder={String(application.requested_amount)}
                    onChange={e => setApprovedAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Approved Tenure (months) <span className="text-red-500">*</span></Label>
                  <Input
                    type="number" min="1"
                    value={approvedTenure}
                    placeholder={String(application.requested_tenure)}
                    onChange={e => setApprovedTenure(e.target.value)}
                  />
                </div>
              </div>

              {monthlyDeduction !== null && (
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm">
                  <span className="text-muted-foreground">Monthly Deduction: </span>
                  <span className="font-bold text-green-700 dark:text-green-400">{formatLoanAmount(monthlyDeduction, currency)}/month</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Effective Start Date <span className="text-red-500">*</span></Label>
                  <Input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Disbursement Date</Label>
                  <Input type="date" value={disbursementDate} onChange={e => setDisbursementDate(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>HR Notes</Label>
                <Textarea rows={2} value={hrNotes} onChange={e => setHrNotes(e.target.value)} placeholder="Optional internal notes…" />
              </div>
            </div>
          )}

          {decision === "reject" && (
            <div className="space-y-1.5">
              <Label>Rejection Reason <span className="text-red-500">*</span></Label>
              <Textarea
                rows={3}
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Explain the reason for rejection…"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            variant={decision === "reject" ? "destructive" : "default"}
          >
            {mutation.isPending ? "Saving…" : decision === "approve" ? "Approve Loan" : "Reject Application"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add / Edit Loan Record (Manual) ─────────────────────────────────────────

function LoanRecordForm({
  record, open, onClose,
}: {
  record?: any;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!record;

  const [employeeId, setEmployeeId]         = useState(record?.employee_id ?? "");
  const [loanType, setLoanType]             = useState(record?.loan_type ?? "personal_loan");
  const [totalAmount, setTotalAmount]       = useState(record ? String(record.total_amount) : "");
  const [approvedTenure, setApprovedTenure] = useState(record ? String(record.approved_tenure) : "");
  const [manualDeduction, setManualDeduction] = useState(record ? String(record.monthly_deduction) : "");
  const [overrideDeduction, setOverrideDeduction] = useState(false);
  const [disbDate, setDisbDate]             = useState(record?.disbursement_date?.substring(0, 10) ?? "");
  const [effDate, setEffDate]               = useState(record?.effective_start_date?.substring(0, 10) ?? "");
  const [monthsPaid, setMonthsPaid]         = useState(record ? String(record.months_paid) : "0");
  const [status, setStatus]                 = useState(record?.status ?? "active");
  const [hrNotes, setHrNotes]               = useState(record?.hr_notes ?? "");
  const [currency, setCurrency]             = useState(normalizeLoanCurrency(record?.currency));

  useEffect(() => {
    if (!open) return;
    setCurrency(normalizeLoanCurrency(record?.currency));
    setEmployeeId(record?.employee_id ?? "");
    setLoanType(record?.loan_type ?? "personal_loan");
    setTotalAmount(record ? String(record.total_amount) : "");
    setApprovedTenure(record ? String(record.approved_tenure) : "");
    setManualDeduction(record ? String(record.monthly_deduction) : "");
    setOverrideDeduction(false);
    setDisbDate(record?.disbursement_date?.substring(0, 10) ?? "");
    setEffDate(record?.effective_start_date?.substring(0, 10) ?? "");
    setMonthsPaid(record ? String(record.months_paid) : "0");
    setStatus(record?.status ?? "active");
    setHrNotes(record?.hr_notes ?? "");
  }, [open, record?.id]);

  const autoDeduction = useMemo(() => {
    const amt = parseFloat(totalAmount);
    const ten = parseInt(approvedTenure, 10);
    if (amt > 0 && ten > 0) return amt / ten;
    return null;
  }, [totalAmount, approvedTenure]);

  const effectiveDeduction = overrideDeduction
    ? parseFloat(manualDeduction) || null
    : autoDeduction;

  const outstanding = useMemo(() => {
    const total = parseFloat(totalAmount);
    const ded   = effectiveDeduction ?? 0;
    const paid  = parseInt(monthsPaid, 10) || 0;
    if (total > 0) return Math.max(0, total - ded * paid);
    return null;
  }, [totalAmount, effectiveDeduction, monthsPaid]);

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        employeeId, loanType, currency, totalAmount: parseFloat(totalAmount),
        approvedTenure: parseInt(approvedTenure, 10),
        monthlyDeduction: effectiveDeduction,
        disbursementDate: disbDate || null,
        effectiveStartDate: effDate,
        monthsPaid: parseInt(monthsPaid, 10) || 0,
        status, hrNotes: hrNotes || null,
      };
      const res = isEdit
        ? await apiRequest("PATCH", `/api/loans/records/${record.id}`, body)
        : await apiRequest("POST", "/api/loans/records", body);
      return unwrapApiData<any>(await res.json());
    },
    onSuccess: (saved) => {
      toast.success(isEdit ? "Loan record updated" : "Loan record created");
      if (saved?.id && !isEdit) {
        qc.setQueryData<any[]>(["/api/loans/records", "active"], (old) => {
          const list = Array.isArray(old) ? old : [];
          if (list.some((r) => r.id === saved.id)) return list;
          return [saved, ...list];
        });
        qc.setQueryData<any[]>(["/api/loans/records", "all"], (old) => {
          const list = Array.isArray(old) ? old : [];
          if (list.some((r) => r.id === saved.id)) return list;
          return [saved, ...list];
        });
      }
      void invalidateLoanQueries(qc);
      onClose();
    },
    onError: async (err: any) => {
      const msg = await err?.response?.json?.().catch?.(() => null);
      toast.error(msg?.error ?? "Failed to save loan record");
    },
  });

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Loan Record" : "Add Loan Manually"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Update the loan record details." : "Add an existing/legacy loan for an employee."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Employee <span className="text-red-500">*</span></Label>
              <EmployeeSelect value={employeeId} onChange={setEmployeeId} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Loan Type <span className="text-red-500">*</span></Label>
            <Select value={loanType} onValueChange={setLoanType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="salary_advance">Salary Advance</SelectItem>
                <SelectItem value="personal_loan">Personal Loan</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <LoanCurrencySelect
            value={currency}
            onChange={setCurrency}
            label="Loan currency"
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Total Amount ({currency}) <span className="text-red-500">*</span></Label>
              <Input type="number" min="1" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} placeholder="100000" />
            </div>
            <div className="space-y-1.5">
              <Label>Tenure (months) <span className="text-red-500">*</span></Label>
              <Input type="number" min="1" value={approvedTenure} onChange={e => setApprovedTenure(e.target.value)} placeholder="12" />
            </div>
          </div>

          {/* Monthly deduction */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Monthly Deduction (PKR)</Label>
              <button
                type="button"
                className="text-xs text-primary underline"
                onClick={() => {
                  setOverrideDeduction(o => !o);
                  if (!overrideDeduction && autoDeduction) setManualDeduction(String(Math.round(autoDeduction)));
                }}
              >
                {overrideDeduction ? "Use auto-calculation" : "Override manually"}
              </button>
            </div>
            {overrideDeduction ? (
              <Input type="number" min="1" value={manualDeduction} onChange={e => setManualDeduction(e.target.value)} />
            ) : (
              <div className="bg-muted/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                {autoDeduction !== null ? formatLoanAmount(autoDeduction, currency) : "Enter amount and tenure above"}
              </div>
            )}
          </div>

          {outstanding !== null && (
            <div className="bg-muted/40 rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Months Already Paid:</span>
                <Input
                  type="number" min="0" className="w-20 h-6 text-xs"
                  value={monthsPaid} onChange={e => setMonthsPaid(e.target.value)}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Outstanding Balance:</span>
                <span className="font-bold text-foreground">{formatLoanAmount(outstanding, currency)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Disbursement Date</Label>
              <Input type="date" value={disbDate} onChange={e => setDisbDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Effective Start Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={effDate} onChange={e => setEffDate(e.target.value)} />
            </div>
          </div>

          {isEdit && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>HR Notes</Label>
            <Textarea rows={2} value={hrNotes} onChange={e => setHrNotes(e.target.value)} placeholder="Internal notes…" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : isEdit ? "Save Changes" : "Add Loan"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Loan Detail Drawer ───────────────────────────────────────────────────────

function LoanDetailDrawer({ record, open, onClose }: { record: any; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen]         = useState(false);
  const [paymentOpen, setPaymentOpen]   = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate]   = useState(new Date().toISOString().substring(0, 10));
  const [salaryMonth, setSalaryMonth]   = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const { data: payments = [] } = useQuery<any[]>({
    queryKey: ["/api/loans/records", record?.id, "payments"],
    queryFn: () => fetchLoanList(`/api/loans/records/${record.id}/payments`),
    enabled: !!record?.id && open,
  });

  const addPaymentMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/loans/records/${record.id}/payments`, {
      amount: parseFloat(paymentAmount), paymentDate,
      salaryMonth: salaryMonth || null, notes: paymentNotes || null,
    }),
    onSuccess: () => {
      toast.success("Payment recorded");
      void invalidateLoanQueries(qc);
      setPaymentOpen(false);
      setPaymentAmount(""); setPaymentNotes("");
    },
    onError: async (err: any) => {
      const msg = await err?.response?.json?.().catch?.(() => null);
      toast.error(msg?.error ?? "Failed to record payment");
    },
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) => apiRequest("PATCH", `/api/loans/records/${record.id}`, { status: newStatus }),
    onSuccess: () => {
      toast.success("Loan status updated");
      void invalidateLoanQueries(qc);
    },
    onError: () => toast.error("Failed to update status"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/loans/records/${record.id}`),
    onSuccess: () => {
      toast.success("Loan record deleted");
      void invalidateLoanQueries(qc);
      onClose();
    },
    onError: () => toast.error("Failed to delete loan record"),
  });

  if (!record) return null;
  const total = parseFloat(record.total_amount ?? 0);
  const paid  = total - parseFloat(record.outstanding_balance ?? 0);
  const pct   = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Loan Record</SheetTitle>
            <SheetDescription>
              {record.first_name} {record.last_name} — {LOAN_TYPE_LABEL[record.loan_type] ?? record.loan_type}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 mt-6">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total Amount",     value: formatLoanAmount(record.total_amount, record.currency) },
                { label: "Outstanding",      value: formatLoanAmount(record.outstanding_balance, record.currency) },
                { label: "Monthly Deduction",value: formatLoanAmount(record.monthly_deduction, record.currency) },
                { label: "Tenure",           value: `${record.approved_tenure} months` },
                { label: "Months Paid",      value: `${record.months_paid} / ${record.approved_tenure}` },
                { label: "Start Date",       value: fmtCalendarDate(record.effective_start_date) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-semibold text-sm text-foreground mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>Repayment progress</span><span>{pct}%</span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>

            <div className="flex items-center gap-2">
              <StatusBadge status={record.status} />
              {record.status === "active" && (
                <Button size="sm" variant="outline" onClick={() => statusMutation.mutate("paused")}>
                  <Pause className="h-3 w-3 mr-1" /> Pause
                </Button>
              )}
              {record.status === "paused" && (
                <Button size="sm" variant="outline" onClick={() => statusMutation.mutate("active")}>
                  <Play className="h-3 w-3 mr-1" /> Resume
                </Button>
              )}
              {record.status !== "completed" && (
                <Button size="sm" variant="outline" onClick={() => statusMutation.mutate("completed")}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Complete
                </Button>
              )}
            </div>

            <Separator />

            {/* Payment History */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-foreground">Payment History</h3>
                <Button size="sm" variant="outline" onClick={() => setPaymentOpen(o => !o)}>
                  <Plus className="h-3 w-3 mr-1" /> Add Payment
                </Button>
              </div>

              {paymentOpen && (
                <div className="bg-muted/40 border border-border rounded-lg p-3 space-y-3 mb-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Amount (PKR)</Label>
                      <Input type="number" className="h-8 text-sm" value={paymentAmount}
                        placeholder={String(record.monthly_deduction)}
                        onChange={e => setPaymentAmount(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Payment Date</Label>
                      <Input type="date" className="h-8 text-sm" value={paymentDate}
                        onChange={e => setPaymentDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Salary Month (e.g. 2025-06)</Label>
                    <Input className="h-8 text-sm" value={salaryMonth}
                      placeholder="2025-06" onChange={e => setSalaryMonth(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notes</Label>
                    <Input className="h-8 text-sm" value={paymentNotes}
                      onChange={e => setPaymentNotes(e.target.value)} />
                  </div>
                  <Button size="sm" className="w-full" onClick={() => addPaymentMutation.mutate()}
                    disabled={addPaymentMutation.isPending}>
                    {addPaymentMutation.isPending ? "Saving…" : "Record Payment"}
                  </Button>
                </div>
              )}

              {payments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {payments.map(p => (
                    <div key={p.id} className="flex justify-between text-sm border-b border-border pb-1.5 last:border-0">
                      <div>
                        <span className="font-medium text-foreground">{formatLoanAmount(p.amount, record.currency)}</span>
                        {p.salary_month && <span className="text-xs text-muted-foreground ml-2">({p.salary_month})</span>}
                      </div>
                      <span className="text-muted-foreground">{fmtCalendarDate(p.payment_date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Edit className="h-3.5 w-3.5 mr-1.5" /> Edit
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setDeleteConfirm(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <LoanRecordForm record={record} open={editOpen} onClose={() => setEditOpen(false)} />

      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Loan Record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the loan record and all associated payment history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── HR View ──────────────────────────────────────────────────────────────────

function HRView({
  onApplyForSelf,
  showApplyHint,
  selfEmployeeId,
}: {
  onApplyForSelf?: () => void;
  showApplyHint?: boolean;
  selfEmployeeId?: string | null;
}) {
  const { user } = useAuth();
  const ownEmployeeId = selfEmployeeId ?? user?.employeeId ?? null;
  const qc = useQueryClient();
  const [reviewApp, setReviewApp]         = useState<any>(null);
  const [appFilter, setAppFilter]         = useState("pending");
  const [recordFilter, setRecordFilter]   = useState("active");
  const [detailRecord, setDetailRecord]   = useState<any>(null);
  const [addRecordOpen, setAddRecordOpen] = useState(false);

  const { data: stats, isLoading: loadingStats } = useQuery<any>({
    queryKey: ["/api/loans/stats"],
    queryFn: async () => unwrapApiData(await (await apiRequest("GET", "/api/loans/stats")).json()),
  });

  const { data: applications = [], isLoading: loadingApps } = useQuery<any[]>({
    queryKey: ["/api/loans/applications", appFilter],
    queryFn: () => fetchLoanList(`/api/loans/applications?status=${appFilter}`),
  });

  const { data: records = [], isLoading: loadingRecords } = useQuery<any[]>({
    queryKey: ["/api/loans/records", recordFilter],
    queryFn: () => fetchLoanList(`/api/loans/records?status=${recordFilter}`),
  });

  const { data: activeRecordsForStats = [] } = useQuery<any[]>({
    queryKey: ["/api/loans/records", "active", "stats-summary"],
    queryFn: () => fetchLoanList("/api/loans/records?status=active"),
  });

  const outstandingSummary = formatAmountsByCurrency(
    sumAmountsByCurrency(activeRecordsForStats, (r) => r.outstanding_balance),
  );
  const monthlySummary = formatAmountsByCurrency(
    sumAmountsByCurrency(activeRecordsForStats, (r) => r.monthly_deduction),
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Loan Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Review applications, manage active loans, and track repayments.</p>
          {showApplyHint && (
            <p className="text-xs text-muted-foreground mt-2">
              To apply for a loan yourself, link your login to an employee record in Access Control.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {onApplyForSelf && (
            <Button variant="outline" onClick={onApplyForSelf}>
              <Plus className="h-4 w-4 mr-2" /> Apply for Loan
            </Button>
          )}
          <Button onClick={() => setAddRecordOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Loan Manually
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Active Loans",          value: stats?.activeCount ?? "—",                   icon: Activity,       color: "text-green-600"  },
          { label: "Pending Applications",  value: stats?.pendingApplications ?? "—",            icon: Clock,          color: "text-amber-600"  },
          { label: "Total Outstanding",     value: outstandingSummary, icon: DollarSign,     color: "text-blue-600"   },
          { label: "Monthly Deductions",    value: monthlySummary,     icon: TrendingDown,   color: "text-purple-600" },
          { label: "Completing This Month", value: stats?.completingThisMonth ?? "—",            icon: CheckCircle2,   color: "text-teal-600"   },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("p-2 rounded-lg bg-muted/60", color)}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className="font-bold text-foreground text-sm">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="applications">
        <TabsList className="mb-4">
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="active">Active Loans</TabsTrigger>
        </TabsList>

        {/* ── Applications Tab ── */}
        <TabsContent value="applications" className="space-y-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Filter:</Label>
            {(["pending", "approved", "rejected", "all"] as const).map(s => (
              <Button
                key={s} size="sm" variant={appFilter === s ? "default" : "outline"}
                onClick={() => setAppFilter(s)} className="capitalize"
              >
                {s === "all" ? "All" : s}
              </Button>
            ))}
          </div>

          {loadingApps ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : applications.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No {appFilter === "all" ? "" : appFilter} applications found.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Tenure</TableHead>
                    <TableHead>Applied</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.map(app => (
                    <TableRow key={app.id} className="hover:bg-muted/20">
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm text-foreground">{app.first_name} {app.last_name}</p>
                          <p className="text-xs text-muted-foreground">{app.emp_id}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{LOAN_TYPE_LABEL[app.loan_type] ?? app.loan_type}</TableCell>
                      <TableCell className="text-sm font-medium">{formatLoanAmount(app.requested_amount, app.currency)}</TableCell>
                      <TableCell className="text-sm">{app.requested_tenure} mo</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtAppliedAt(app.applied_at, user?.timeZone ?? null, user?.dateFormat ?? null)}</TableCell>
                      <TableCell><StatusBadge status={app.status} /></TableCell>
                      <TableCell>
                        {app.status === "pending" && (
                          app.employee_id === ownEmployeeId ? (
                            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                              Your application
                            </Badge>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setReviewApp(app)}>
                              Review <ChevronRight className="h-3 w-3 ml-1" />
                            </Button>
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Active Loans Tab ── */}
        <TabsContent value="active" className="space-y-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Filter:</Label>
            {(["active", "paused", "completed", "all"] as const).map(s => (
              <Button
                key={s} size="sm" variant={recordFilter === s ? "default" : "outline"}
                onClick={() => setRecordFilter(s)} className="capitalize"
              >
                {s}
              </Button>
            ))}
          </div>

          {loadingRecords ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : records.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Banknote className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No {recordFilter === "all" ? "" : recordFilter} loans found.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setAddRecordOpen(true)}>
                  Add a loan manually
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Monthly</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map(r => {
                    const total    = parseFloat(r.total_amount ?? 0);
                    const paid     = total - parseFloat(r.outstanding_balance ?? 0);
                    const pct      = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
                    return (
                      <TableRow key={r.id} className="hover:bg-muted/20">
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm text-foreground">{r.first_name} {r.last_name}</p>
                            <p className="text-xs text-muted-foreground">{r.emp_id}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{LOAN_TYPE_LABEL[r.loan_type] ?? r.loan_type}</TableCell>
                        <TableCell className="text-sm font-medium">{formatLoanAmount(r.total_amount, r.currency)}</TableCell>
                        <TableCell className="text-sm">{formatLoanAmount(r.monthly_deduction, r.currency)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtCalendarDate(r.effective_start_date, user?.dateFormat ?? null)}</TableCell>
                        <TableCell className="min-w-[120px]">
                          <div>
                            <Progress value={pct} className="h-1.5 mb-0.5" />
                            <p className="text-xs text-muted-foreground">{r.months_paid}/{r.approved_tenure} mo</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{formatLoanAmount(r.outstanding_balance, r.currency)}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => setDetailRecord(r)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Modals */}
      {reviewApp && (
        <ApprovalDialog
          application={reviewApp} open={!!reviewApp}
          onClose={() => setReviewApp(null)}
        />
      )}
      {detailRecord && (
        <LoanDetailDrawer
          record={detailRecord} open={!!detailRecord}
          onClose={() => setDetailRecord(null)}
        />
      )}
      <LoanRecordForm open={addRecordOpen} onClose={() => setAddRecordOpen(false)} />
    </div>
  );
}

// ── Page Entry Point ─────────────────────────────────────────────────────────

export default function Loans() {
  const { user } = useAuth();
  const roles    = new Set([user?.role, ...(user?.roles ?? [])].filter(Boolean));
  const isHRAdmin = roles.has("admin") || roles.has("hr");
  const linkedEmployee = !!user?.employeeId;
  const [pageTab, setPageTab] = useState<"manage" | "my">("manage");

  const { data: myRecords = [] } = useQuery<any[]>({
    queryKey: ["/api/loans/my-records"],
    queryFn: () => fetchLoanList("/api/loans/my-records"),
    enabled: isHRAdmin,
  });
  const { data: myApplications = [] } = useQuery<any[]>({
    queryKey: ["/api/loans/my-applications"],
    queryFn: () => fetchLoanList("/api/loans/my-applications"),
    enabled: isHRAdmin,
  });

  const hasPersonalLoans = myRecords.length > 0 || myApplications.length > 0;
  const showMyLoansTab = linkedEmployee || hasPersonalLoans;
  const resolvedSelfEmployeeId =
    user?.employeeId ?? myRecords[0]?.employee_id ?? myApplications[0]?.employee_id ?? null;

  if (isHRAdmin && showMyLoansTab) {
    return (
      <Layout>
        <Tabs value={pageTab} onValueChange={(v) => setPageTab(v as "manage" | "my")} className="space-y-6">
          <TabsList>
            <TabsTrigger value="manage">Team Loans</TabsTrigger>
            <TabsTrigger value="my">My Loans</TabsTrigger>
          </TabsList>
          <TabsContent value="manage" className="mt-0">
            <HRView
              onApplyForSelf={linkedEmployee || hasPersonalLoans ? () => setPageTab("my") : undefined}
              selfEmployeeId={resolvedSelfEmployeeId}
            />
          </TabsContent>
          <TabsContent value="my" className="mt-0">
            <EmployeeView />
          </TabsContent>
        </Tabs>
      </Layout>
    );
  }

  return (
    <Layout>
      {isHRAdmin ? (
        <HRView showApplyHint={!linkedEmployee && !hasPersonalLoans} selfEmployeeId={resolvedSelfEmployeeId} />
      ) : (
        <EmployeeView />
      )}
    </Layout>
  );
}

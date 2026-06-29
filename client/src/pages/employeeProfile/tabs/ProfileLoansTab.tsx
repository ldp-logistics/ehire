import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Banknote, FileText, Clock, CheckCircle2, XCircle,
  TrendingDown, ExternalLink, Loader2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatLoanAmount,
  formatAmountsByCurrency,
  sumAmountsByCurrency,
} from "@shared/loanCurrency";

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return d; }
};

const LOAN_TYPE_LABEL: Record<string, string> = {
  salary_advance: "Salary Advance",
  personal_loan:  "Personal Loan",
  other:          "Other",
};

const STATUS_BADGE: Record<string, string> = {
  pending:   "bg-amber-500/10  text-amber-700  border-amber-200",
  approved:  "bg-green-500/10  text-green-700  border-green-200",
  rejected:  "bg-red-500/10    text-red-700    border-red-200",
  active:    "bg-green-500/10  text-green-700  border-green-200",
  completed: "bg-slate-500/10  text-slate-600  border-slate-200",
  paused:    "bg-blue-500/10   text-blue-700   border-blue-200",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] ?? "";
  return (
    <Badge variant="outline" className={cn("capitalize text-[11px]", cls)}>
      {status}
    </Badge>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProfileLoansTabProps {
  employeeId: string;
  isOwnProfile: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProfileLoansTab({ employeeId, isOwnProfile }: ProfileLoansTabProps) {
  const { user } = useAuth();
  const roles    = new Set([user?.role, ...(user?.roles ?? [])].filter(Boolean));
  const isHRAdmin = roles.has("admin") || roles.has("hr");

  const { data, isLoading, isError } = useQuery<{ records: any[]; applications: any[] }>({
    queryKey: ["/api/loans/employee", employeeId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/loans/employee/${employeeId}`);
      const j = await r.json();
      return j?.data ?? j ?? { records: [], applications: [] };
    },
    enabled: !!employeeId,
  });

  const records      = data?.records      ?? [];
  const applications = data?.applications ?? [];

  const activeRecords     = records.filter(r => r.status === "active");
  const outstandingSummary = formatAmountsByCurrency(
    sumAmountsByCurrency(activeRecords, (r) => r.outstanding_balance),
  );
  const monthlySummary = formatAmountsByCurrency(
    sumAmountsByCurrency(activeRecords, (r) => r.monthly_deduction),
  );
  const pendingApps       = applications.filter(a => a.status === "pending");

  return (
    <Card className="border border-border shadow-sm bg-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-blue-500" />
            Loans & Advances
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {isOwnProfile
              ? "Your loan applications and active repayments."
              : "Loan records and applications for this employee."}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <Link href="/loans">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            {isHRAdmin ? "Loan Management" : "Open Loans"}
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading loans…
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <AlertCircle className="h-5 w-5 mr-2 text-red-500" /> Failed to load loan data.
          </div>
        ) : records.length === 0 && applications.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Banknote className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No loans on record</p>
            <p className="text-sm mt-1">
              {isOwnProfile
                ? "Apply for a loan from the Loans page."
                : "This employee has no loan applications or active records."}
            </p>
          </div>
        ) : (
          <>
            {/* Summary strip */}
            {(activeRecords.length > 0 || pendingApps.length > 0) && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Active Loans</p>
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{activeRecords.length}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Outstanding</p>
                  <p className="text-sm font-bold text-foreground">{outstandingSummary}</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Monthly Deduction</p>
                  <p className="text-sm font-bold text-foreground">{monthlySummary}</p>
                </div>
              </div>
            )}

            {/* Active loan records */}
            {activeRecords.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Active Loans</h3>
                <div className="space-y-3">
                  {activeRecords.map(r => {
                    const total = parseFloat(r.total_amount ?? 0);
                    const paid  = total - parseFloat(r.outstanding_balance ?? 0);
                    const pct   = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
                    return (
                      <div key={r.id} className="border border-border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">
                              {LOAN_TYPE_LABEL[r.loan_type] ?? r.loan_type}
                            </span>
                          </div>
                          <StatusBadge status={r.status} />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">Total</p>
                            <p className="font-semibold">{formatLoanAmount(r.total_amount, r.currency)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Outstanding</p>
                            <p className="font-semibold">{formatLoanAmount(r.outstanding_balance, r.currency)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Monthly</p>
                            <p className="font-semibold">{formatLoanAmount(r.monthly_deduction, r.currency)}</p>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                            <span>{r.months_paid} / {r.approved_tenure} months paid</span>
                            <span>{pct}%</span>
                          </div>
                          <Progress value={pct} className="h-1.5" />
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Started {fmtDate(r.effective_start_date)}
                          {r.hr_notes && <span className="ml-2">· {r.hr_notes}</span>}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Completed / paused records */}
            {records.filter(r => r.status !== "active").length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Past Loans</h3>
                <div className="space-y-2">
                  {records.filter(r => r.status !== "active").map(r => (
                    <div key={r.id} className="flex items-center justify-between border border-border rounded-lg p-2.5">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {LOAN_TYPE_LABEL[r.loan_type] ?? r.loan_type} — {formatLoanAmount(r.total_amount, r.currency)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {r.months_paid}/{r.approved_tenure} months · {fmtDate(r.effective_start_date)}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {applications.length > 0 && <Separator />}

            {/* Applications history */}
            {applications.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Loan Applications</h3>
                <div className="space-y-2">
                  {applications.map(app => (
                    <div key={app.id} className="flex items-start justify-between border border-border rounded-lg p-2.5 gap-2">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 shrink-0">
                          {app.status === "pending"  && <Clock        className="h-3.5 w-3.5 text-amber-500" />}
                          {app.status === "approved" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                          {app.status === "rejected" && <XCircle      className="h-3.5 w-3.5 text-red-500"   />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {LOAN_TYPE_LABEL[app.loan_type] ?? app.loan_type} — {formatLoanAmount(app.requested_amount, app.currency)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {app.requested_tenure} months · Applied {fmtDate(app.applied_at)}
                          </p>
                          {app.rejection_reason && (
                            <p className="text-[11px] text-red-600 mt-0.5">
                              Rejected: {app.rejection_reason}
                            </p>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={app.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

import {
  notifyEmail,
  getEmployeeEmail,
  getEmailsByRolesForRegion,
  dedupeRecipientsByEmail,
} from "../../lib/emailNotifications.js";
import type { Recipient } from "../../lib/emailNotifications.js";
import { getEmployeeRegion } from "../../lib/regionAccess.js";
import { formatLoanAmount, normalizeLoanCurrency } from "../../../shared/loanCurrency.js";

const LOAN_TYPE_LABEL: Record<string, string> = {
  salary_advance: "Salary Advance",
  personal_loan: "Personal Loan",
  other: "Other",
};

function loanTypeLabel(loanType: string | null | undefined): string {
  if (!loanType) return "Loan";
  return LOAN_TYPE_LABEL[loanType] ?? loanType;
}

function employeeDisplayName(row: {
  first_name?: string | null;
  last_name?: string | null;
}): string {
  return `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Employee";
}

function buildLoanEmailContext(
  app: Record<string, unknown>,
  extra: Record<string, string> = {},
): Record<string, string> {
  const currency = normalizeLoanCurrency(app.currency as string | null | undefined);
  return {
    employee_name: employeeDisplayName(app as { first_name?: string; last_name?: string }),
    employee_id: String(app.emp_id ?? app.employee_id ?? "—"),
    loan_type: loanTypeLabel(String(app.loan_type ?? "")),
    currency,
    requested_amount: formatLoanAmount(app.requested_amount as string | number, currency),
    requested_tenure: String(app.requested_tenure ?? ""),
    reason: String(app.reason ?? "—"),
    supporting_note: String(app.supporting_note ?? "—"),
    rejection_reason: String(app.rejection_reason ?? "—"),
    application_id: String(app.id ?? ""),
    ...extra,
  };
}

/** Notify HR/admin that a new loan application was submitted. */
export async function notifyLoanApplicationSubmitted(app: Record<string, unknown>): Promise<void> {
  try {
    const employeeId = String(app.employee_id ?? "");
    const empRegion = employeeId ? await getEmployeeRegion(employeeId) : null;
    const recipients = await getEmailsByRolesForRegion(["hr", "admin"], empRegion);
    if (!recipients.length) return;

    const ctx = buildLoanEmailContext(app);
    await notifyEmail("loan.application_submitted", ctx, recipients);
  } catch (e) {
    console.error("[loan-notify] application_submitted", (e as Error)?.message);
  }
}

/** Notify employee that their loan was approved. */
export async function notifyLoanApplicationApproved(
  app: Record<string, unknown>,
  details: {
    approvedAmount: number;
    approvedTenure: number;
    monthlyDeduction: number;
    effectiveStartDate: string;
    currency: string;
  },
): Promise<void> {
  try {
    const employeeId = String(app.employee_id ?? "");
    if (!employeeId) return;
    const recipient = await getEmployeeEmail(employeeId);
    if (!recipient) return;

    const currency = normalizeLoanCurrency(details.currency ?? (app.currency as string));
    const ctx = buildLoanEmailContext(app, {
      approved_amount: formatLoanAmount(details.approvedAmount, currency),
      approved_tenure: String(details.approvedTenure),
      monthly_deduction: formatLoanAmount(details.monthlyDeduction, currency),
      effective_start_date: String(details.effectiveStartDate).slice(0, 10),
    });

    await notifyEmail("loan.application_approved", ctx, [recipient]);
  } catch (e) {
    console.error("[loan-notify] application_approved", (e as Error)?.message);
  }
}

/** Notify employee that their loan was rejected. */
export async function notifyLoanApplicationRejected(app: Record<string, unknown>): Promise<void> {
  try {
    const employeeId = String(app.employee_id ?? "");
    if (!employeeId) return;
    const recipient = await getEmployeeEmail(employeeId);
    if (!recipient) return;

    const ctx = buildLoanEmailContext(app);
    await notifyEmail("loan.application_rejected", ctx, [recipient]);
  } catch (e) {
    console.error("[loan-notify] application_rejected", (e as Error)?.message);
  }
}

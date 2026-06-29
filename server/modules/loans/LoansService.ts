import { LoansRepository } from "./LoansRepository.js";
import { ValidationError, NotFoundError, ForbiddenError } from "../../core/types/index.js";
import { normalizeLoanCurrency } from "../../../shared/loanCurrency.js";
import { effectiveRegionsFor, getEmployeeRegion } from "../../lib/regionAccess.js";
import type { ModuleRegionCtx } from "../../lib/moduleRegionCtx.js";
import {
  notifyLoanApplicationSubmitted,
  notifyLoanApplicationApproved,
  notifyLoanApplicationRejected,
} from "./loanNotifications.js";

const VALID_LOAN_TYPES_EMPLOYEE = ["salary_advance", "personal_loan"] as const;
const VALID_LOAN_TYPES_ALL      = ["salary_advance", "personal_loan", "other"] as const;
const VALID_STATUSES            = ["active", "completed", "paused"] as const;

export class LoansService {
  private readonly repo = new LoansRepository();

  private regionsFor(ctx?: ModuleRegionCtx): string[] | null {
    return ctx ? effectiveRegionsFor(ctx, ctx.requestedRegion) : null;
  }

  private async assertEmployeeInScope(ctx: ModuleRegionCtx | undefined, employeeId: string): Promise<void> {
    if (!ctx) return;
    const regions = this.regionsFor(ctx);
    if (regions === null) return;
    const empRegion = await getEmployeeRegion(employeeId);
    if (regions.length === 0 || !empRegion || !regions.includes(empRegion)) {
      throw new ForbiddenError("This employee belongs to a different region.");
    }
  }

  private async assertApplicationInScope(ctx: ModuleRegionCtx | undefined, applicationId: string): Promise<void> {
    const app = await this.repo.getApplicationById(applicationId);
    if (!app?.employee_id) throw new NotFoundError("Loan application", applicationId);
    await this.assertEmployeeInScope(ctx, app.employee_id);
  }

  private async assertRecordInScope(ctx: ModuleRegionCtx | undefined, recordId: string): Promise<void> {
    const record = await this.repo.getRecordById(recordId);
    if (!record?.employee_id) throw new NotFoundError("Loan record", recordId);
    await this.assertEmployeeInScope(ctx, record.employee_id);
  }

  // ── Applications ────────────────────────────────────────────────────────────

  async getAllApplications(status?: string, ctx?: ModuleRegionCtx) {
    return this.repo.getAllApplications(status, this.regionsFor(ctx));
  }

  async getApplicationById(id: string, ctx?: ModuleRegionCtx) {
    const app = await this.repo.getApplicationById(id);
    if (!app) throw new NotFoundError("Loan application", id);
    await this.assertEmployeeInScope(ctx, app.employee_id);
    return app;
  }

  async getMyApplications(employeeId: string) {
    return this.repo.getMyApplications(employeeId);
  }

  async createApplication(employeeId: string, body: any) {
    const { loanType, requestedAmount, requestedTenure, reason, supportingNote } = body;

    if (!loanType || !(VALID_LOAN_TYPES_EMPLOYEE as readonly string[]).includes(loanType)) {
      throw new ValidationError("loan_type must be 'salary_advance' or 'personal_loan'");
    }
    const amount = parseFloat(String(requestedAmount));
    if (!amount || amount <= 0) throw new ValidationError("requestedAmount must be a positive number");
    const tenure = parseInt(String(requestedTenure), 10);
    if (!tenure || tenure <= 0) throw new ValidationError("requestedTenure must be a positive integer (months)");
    if (!reason?.trim()) throw new ValidationError("reason is required");

    const created = await this.repo.createApplication(employeeId, {
      loanType,
      requestedAmount: amount,
      currency: normalizeLoanCurrency(body.currency),
      requestedTenure: tenure,
      reason: reason.trim(),
      supportingNote: supportingNote?.trim() || null,
    });

    (async () => {
      const full = await this.repo.getApplicationById(created.id);
      if (full) await notifyLoanApplicationSubmitted(full);
    })().catch(() => {});

    return created;
  }

  async approveApplication(id: string, reviewedBy: string, body: any, ctx?: ModuleRegionCtx, reviewerEmployeeId?: string | null) {
    await this.assertApplicationInScope(ctx, id);
    const existing = await this.repo.getApplicationById(id);
    if (!existing) throw new NotFoundError("Loan application", id);
    if (existing.status !== "pending") {
      throw new ValidationError(`Application is already ${existing.status} — cannot approve again`);
    }
    if (reviewerEmployeeId && existing.employee_id === reviewerEmployeeId) {
      throw new ForbiddenError("You cannot approve your own loan application. Another HR or admin must review it.");
    }

    const approvedAmount  = parseFloat(String(body.approvedAmount));
    const approvedTenure  = parseInt(String(body.approvedTenure), 10);
    const monthlyDeduction = parseFloat(String(body.monthlyDeduction ?? approvedAmount / approvedTenure));
    const effectiveStartDate = body.effectiveStartDate;

    if (!approvedAmount || approvedAmount <= 0)  throw new ValidationError("approvedAmount is required");
    if (!approvedTenure || approvedTenure <= 0)  throw new ValidationError("approvedTenure is required");
    if (!effectiveStartDate)                     throw new ValidationError("effectiveStartDate is required");

    const monthsPaid = Math.max(0, parseInt(String(body.monthsPaid ?? 0), 10) || 0);
    const outstanding = Math.max(0, approvedAmount - monthlyDeduction * monthsPaid);
    const currency = normalizeLoanCurrency(body.currency ?? existing.currency);

    // Mark application approved
    await this.repo.approveApplication(id, reviewedBy, {
      approvedAmount,
      approvedTenure,
      currency,
      effectiveStartDate,
      monthlyDeduction,
      disbursementDate: body.disbursementDate || null,
      hrNotes: body.hrNotes || null,
    });

    // Create the loan record
    const record = await this.repo.createRecord({
      applicationId:     id,
      employeeId:        existing.employee_id,
      loanType:          existing.loan_type,
      totalAmount:       approvedAmount,
      currency,
      approvedTenure,
      monthlyDeduction,
      disbursementDate:  body.disbursementDate || null,
      effectiveStartDate,
      monthsPaid,
      outstandingBalance: outstanding,
      hrNotes:           body.hrNotes || null,
      createdBy:         reviewedBy,
    });

    (async () => {
      const full = await this.repo.getApplicationById(id);
      if (full) {
        await notifyLoanApplicationApproved(full, {
          approvedAmount,
          approvedTenure,
          monthlyDeduction,
          effectiveStartDate,
          currency,
        });
      }
    })().catch(() => {});

    return { application: existing, record };
  }

  async rejectApplication(id: string, reviewedBy: string, body: any, ctx?: ModuleRegionCtx) {
    await this.assertApplicationInScope(ctx, id);
    const existing = await this.repo.getApplicationById(id);
    if (!existing) throw new NotFoundError("Loan application", id);
    if (existing.status !== "pending") {
      throw new ValidationError(`Application is already ${existing.status}`);
    }
    if (!body.rejectionReason?.trim()) throw new ValidationError("rejectionReason is required");

    const rejected = await this.repo.rejectApplication(id, reviewedBy, body.rejectionReason.trim());

    (async () => {
      const full = await this.repo.getApplicationById(id);
      if (full) await notifyLoanApplicationRejected(full);
    })().catch(() => {});

    return rejected;
  }

  // ── Loan Records ────────────────────────────────────────────────────────────

  async getAllRecords(status?: string, ctx?: ModuleRegionCtx) {
    return this.repo.getAllRecords(status, this.regionsFor(ctx));
  }

  async getRecordById(id: string, ctx?: ModuleRegionCtx) {
    const r = await this.repo.getRecordById(id);
    if (!r) throw new NotFoundError("Loan record", id);
    await this.assertEmployeeInScope(ctx, r.employee_id);
    return r;
  }

  async getMyRecords(employeeId: string) {
    return this.repo.getMyRecords(employeeId);
  }

  async createRecord(body: any, createdBy: string, ctx?: ModuleRegionCtx) {
    const { employeeId, loanType, totalAmount, approvedTenure,
            monthlyDeduction, effectiveStartDate } = body;

    if (!employeeId)   throw new ValidationError("employeeId is required");
    await this.assertEmployeeInScope(ctx, employeeId);
    if (!loanType || !(VALID_LOAN_TYPES_ALL as readonly string[]).includes(loanType)) {
      throw new ValidationError("loanType must be salary_advance, personal_loan, or other");
    }
    const total   = parseFloat(String(totalAmount));
    if (!total || total <= 0)         throw new ValidationError("totalAmount must be positive");
    const tenure  = parseInt(String(approvedTenure), 10);
    if (!tenure || tenure <= 0)       throw new ValidationError("approvedTenure must be positive");
    if (!effectiveStartDate)          throw new ValidationError("effectiveStartDate is required");

    const deduction  = parseFloat(String(monthlyDeduction ?? total / tenure));
    const monthsPaid = Math.max(0, parseInt(String(body.monthsPaid ?? 0), 10) || 0);
    const outstanding = Math.max(0, total - deduction * monthsPaid);

    return this.repo.createRecord({
      applicationId:     null,
      employeeId,
      loanType,
      totalAmount:       total,
      currency:          normalizeLoanCurrency(body.currency),
      approvedTenure:    tenure,
      monthlyDeduction:  deduction,
      disbursementDate:  body.disbursementDate || null,
      effectiveStartDate,
      monthsPaid,
      outstandingBalance: outstanding,
      hrNotes:           body.hrNotes || null,
      createdBy,
    });
  }

  async updateRecord(id: string, body: any, ctx?: ModuleRegionCtx) {
    await this.assertRecordInScope(ctx, id);
    const existing = await this.repo.getRecordById(id);
    if (!existing) throw new NotFoundError("Loan record", id);

    if (body.status && !(VALID_STATUSES as readonly string[]).includes(body.status)) {
      throw new ValidationError("status must be active, completed, or paused");
    }

    const monthlyDeduction = body.monthlyDeduction != null ? parseFloat(String(body.monthlyDeduction)) : undefined;
    const approvedTenure   = body.approvedTenure   != null ? parseInt(String(body.approvedTenure), 10) : undefined;
    const monthsPaid       = body.monthsPaid       != null ? Math.max(0, parseInt(String(body.monthsPaid), 10)) : undefined;

    // Recalculate outstanding if relevant fields change
    const newTotal   = parseFloat(String(existing.total_amount));
    const newDed     = monthlyDeduction ?? parseFloat(String(existing.monthly_deduction));
    const newMonths  = monthsPaid ?? parseInt(String(existing.months_paid), 10);
    const outstanding = Math.max(0, newTotal - newDed * newMonths);

    return this.repo.updateRecord(id, {
      monthlyDeduction,
      approvedTenure,
      monthsPaid,
      outstandingBalance: outstanding,
      status:             body.status,
      currency:           body.currency !== undefined ? normalizeLoanCurrency(body.currency) : undefined,
      hrNotes:            body.hrNotes !== undefined ? (body.hrNotes || null) : undefined,
      effectiveStartDate: body.effectiveStartDate,
      disbursementDate:   body.disbursementDate !== undefined ? (body.disbursementDate || null) : undefined,
    });
  }

  async deleteRecord(id: string, ctx?: ModuleRegionCtx) {
    await this.assertRecordInScope(ctx, id);
    const existing = await this.repo.getRecordById(id);
    if (!existing) throw new NotFoundError("Loan record", id);
    const ok = await this.repo.deleteRecord(id);
    if (!ok) throw new NotFoundError("Loan record", id);
  }

  // ── Payments ────────────────────────────────────────────────────────────────

  async getPayments(loanRecordId: string, ctx?: ModuleRegionCtx) {
    await this.assertRecordInScope(ctx, loanRecordId);
    return this.repo.getPayments(loanRecordId);
  }

  async addPayment(loanRecordId: string, body: any, addedBy: string, ctx?: ModuleRegionCtx) {
    const record = await this.repo.getRecordById(loanRecordId);
    if (!record) throw new NotFoundError("Loan record", loanRecordId);
    await this.assertEmployeeInScope(ctx, record.employee_id);
    if (record.status === "completed") throw new ValidationError("Loan is already completed");

    const amount = parseFloat(String(body.amount));
    if (!amount || amount <= 0) throw new ValidationError("amount must be positive");
    if (!body.paymentDate)      throw new ValidationError("paymentDate is required");

    return this.repo.addPayment(loanRecordId, {
      amount,
      paymentDate:  body.paymentDate,
      salaryMonth:  body.salaryMonth || null,
      notes:        body.notes?.trim() || null,
      addedBy,
    });
  }

  // ── Per-employee (profile tab) ───────────────────────────────────────────────

  async getEmployeeLoans(
    targetEmployeeId: string,
    user: { employeeId?: string | null; role?: string; roles?: string[] },
    ctx?: ModuleRegionCtx,
  ) {
    const roles = new Set([user.role, ...(user.roles ?? [])].filter(Boolean));
    const isHrOrAdmin = roles.has("admin") || roles.has("hr");
    if (!isHrOrAdmin && user.employeeId !== targetEmployeeId) {
      throw new ForbiddenError("Not allowed to view this employee's loans");
    }
    if (isHrOrAdmin && user.employeeId !== targetEmployeeId) {
      await this.assertEmployeeInScope(ctx, targetEmployeeId);
    }
    const [records, applications] = await Promise.all([
      this.repo.getEmployeeRecords(targetEmployeeId),
      this.repo.getEmployeeApplications(targetEmployeeId),
    ]);
    return { records, applications };
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  async getStats(ctx?: ModuleRegionCtx) {
    return this.repo.getStats(this.regionsFor(ctx));
  }

  // ── Employee self-access guard ───────────────────────────────────────────────

  async assertEmployeeRecordAccess(
    recordId: string,
    user: { employeeId?: string | null; role?: string; roles?: string[] },
    ctx?: ModuleRegionCtx,
  ) {
    const record = await this.repo.getRecordById(recordId);
    if (!record) throw new NotFoundError("Loan record", recordId);
    const roles = new Set([user.role, ...(user.roles ?? [])].filter(Boolean));
    if (!roles.has("admin") && !roles.has("hr") && record.employee_id !== user.employeeId) {
      throw new ForbiddenError("Not allowed to access this loan record");
    }
    if (roles.has("admin") || roles.has("hr")) {
      await this.assertEmployeeInScope(ctx, record.employee_id);
    }
    return record;
  }
}

import { BaseRepository } from "../../core/base/BaseRepository.js";
import { appendEffectiveRegionFilter } from "../../lib/employeeRegionSql.js";

export class LoansRepository extends BaseRepository {

  // ── Applications ────────────────────────────────────────────────────────────

  async getAllApplications(status?: string, regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const conds: string[] = [];
    const params: unknown[] = [];
    if (status && status !== "all") {
      params.push(status);
      conds.push(`la.status = $${params.length}`);
    }
    appendEffectiveRegionFilter(regions, "e", "b", conds, params);
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    return this.sql(`
      SELECT la.*,
             e.first_name, e.last_name, e.employee_id AS emp_id, e.department, e.job_title
      FROM loan_applications la
      JOIN employees e ON e.id = la.employee_id
      LEFT JOIN branches b ON b.id = e.branch_id
      ${where}
      ORDER BY la.applied_at DESC
    `, params) as Promise<any[]>;
  }

  async getApplicationById(id: string) {
    const rows = await this.sql`
      SELECT la.*,
             e.first_name, e.last_name, e.employee_id AS emp_id, e.department, e.job_title,
             u.email AS reviewed_by_email
      FROM loan_applications la
      JOIN employees e ON e.id = la.employee_id
      LEFT JOIN users u ON u.id = la.reviewed_by
      WHERE la.id = ${id}
      LIMIT 1
    ` as any[];
    return rows[0] ?? null;
  }

  async getMyApplications(employeeId: string) {
    return this.sql`
      SELECT * FROM loan_applications
      WHERE employee_id = ${employeeId}
      ORDER BY applied_at DESC
    ` as Promise<any[]>;
  }

  async createApplication(employeeId: string, data: {
    loanType: string;
    requestedAmount: number;
    currency: string;
    requestedTenure: number;
    reason: string;
    supportingNote?: string | null;
  }) {
    const rows = await this.sql`
      INSERT INTO loan_applications
        (employee_id, loan_type, requested_amount, currency, requested_tenure, reason, supporting_note)
      VALUES
        (${employeeId}, ${data.loanType}, ${data.requestedAmount}, ${data.currency},
         ${data.requestedTenure}, ${data.reason}, ${data.supportingNote ?? null})
      RETURNING *
    ` as any[];
    return rows[0];
  }

  async approveApplication(id: string, reviewedBy: string, data: {
    approvedAmount: number;
    approvedTenure: number;
    currency: string;
    effectiveStartDate: string;
    monthlyDeduction: number;
    disbursementDate?: string | null;
    hrNotes?: string | null;
  }) {
    const rows = await this.sql`
      UPDATE loan_applications
      SET status = 'approved', reviewed_by = ${reviewedBy},
          currency = ${data.currency},
          reviewed_at = NOW(), updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    ` as any[];
    return rows[0] ?? null;
  }

  async rejectApplication(id: string, reviewedBy: string, rejectionReason: string) {
    const rows = await this.sql`
      UPDATE loan_applications
      SET status = 'rejected', reviewed_by = ${reviewedBy}, reviewed_at = NOW(),
          rejection_reason = ${rejectionReason}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    ` as any[];
    return rows[0] ?? null;
  }

  // ── Loan Records ────────────────────────────────────────────────────────────

  async getAllRecords(status?: string, regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const conds: string[] = [];
    const params: unknown[] = [];
    if (status && status !== "all") {
      params.push(status);
      conds.push(`lr.status = $${params.length}`);
    }
    appendEffectiveRegionFilter(regions, "e", "b", conds, params);
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    return this.sql(`
      SELECT lr.*,
             e.first_name, e.last_name, e.employee_id AS emp_id, e.department, e.job_title
      FROM loan_records lr
      JOIN employees e ON e.id = lr.employee_id
      LEFT JOIN branches b ON b.id = e.branch_id
      ${where}
      ORDER BY lr.effective_start_date DESC, lr.created_at DESC
    `, params) as Promise<any[]>;
  }

  async getRecordById(id: string) {
    const rows = await this.sql`
      SELECT lr.*,
             e.first_name, e.last_name, e.employee_id AS emp_id, e.department, e.job_title
      FROM loan_records lr
      JOIN employees e ON e.id = lr.employee_id
      WHERE lr.id = ${id}
      LIMIT 1
    ` as any[];
    return rows[0] ?? null;
  }

  async getMyRecords(employeeId: string) {
    return this.sql`
      SELECT * FROM loan_records
      WHERE employee_id = ${employeeId}
      ORDER BY effective_start_date DESC, created_at DESC
    ` as Promise<any[]>;
  }

  async createRecord(data: {
    applicationId?: string | null;
    employeeId: string;
    loanType: string;
    totalAmount: number;
    currency: string;
    approvedTenure: number;
    monthlyDeduction: number;
    disbursementDate?: string | null;
    effectiveStartDate: string;
    monthsPaid?: number;
    outstandingBalance: number;
    hrNotes?: string | null;
    createdBy: string;
  }) {
    const rows = await this.sql`
      INSERT INTO loan_records
        (application_id, employee_id, loan_type, total_amount, currency, approved_tenure,
         monthly_deduction, disbursement_date, effective_start_date, months_paid,
         outstanding_balance, hr_notes, created_by)
      VALUES
        (${data.applicationId ?? null}, ${data.employeeId}, ${data.loanType},
         ${data.totalAmount}, ${data.currency}, ${data.approvedTenure}, ${data.monthlyDeduction},
         ${data.disbursementDate ?? null}, ${data.effectiveStartDate},
         ${data.monthsPaid ?? 0}, ${data.outstandingBalance},
         ${data.hrNotes ?? null}, ${data.createdBy})
      RETURNING *
    ` as any[];
    return rows[0];
  }

  async updateRecord(id: string, data: {
    monthlyDeduction?: number;
    approvedTenure?: number;
    monthsPaid?: number;
    outstandingBalance?: number;
    status?: string;
    currency?: string;
    hrNotes?: string | null;
    effectiveStartDate?: string;
    disbursementDate?: string | null;
  }) {
    const rows = await this.sql`
      UPDATE loan_records SET
        monthly_deduction  = COALESCE(${data.monthlyDeduction ?? null}, monthly_deduction),
        approved_tenure    = COALESCE(${data.approvedTenure ?? null}, approved_tenure),
        months_paid        = COALESCE(${data.monthsPaid ?? null}, months_paid),
        outstanding_balance = COALESCE(${data.outstandingBalance ?? null}, outstanding_balance),
        status             = COALESCE(${data.status ?? null}, status),
        currency           = COALESCE(${data.currency ?? null}, currency),
        hr_notes           = COALESCE(${data.hrNotes !== undefined ? data.hrNotes : null}, hr_notes),
        effective_start_date = COALESCE(${data.effectiveStartDate ?? null}::date, effective_start_date),
        disbursement_date  = COALESCE(${data.disbursementDate !== undefined ? data.disbursementDate : null}::date, disbursement_date),
        updated_at         = NOW()
      WHERE id = ${id}
      RETURNING *
    ` as any[];
    return rows[0] ?? null;
  }

  async deleteRecord(id: string) {
    const rows = await this.sql`DELETE FROM loan_records WHERE id = ${id} RETURNING id` as any[];
    return rows.length > 0;
  }

  // ── Payments ────────────────────────────────────────────────────────────────

  async getPayments(loanRecordId: string) {
    return this.sql`
      SELECT lp.*, u.email AS added_by_email
      FROM loan_payments lp
      LEFT JOIN users u ON u.id = lp.added_by
      WHERE lp.loan_record_id = ${loanRecordId}
      ORDER BY lp.payment_date DESC
    ` as Promise<any[]>;
  }

  async addPayment(loanRecordId: string, data: {
    amount: number;
    paymentDate: string;
    salaryMonth?: string | null;
    notes?: string | null;
    addedBy: string;
  }) {
    const rows = await this.sql`
      INSERT INTO loan_payments (loan_record_id, amount, payment_date, salary_month, notes, added_by)
      VALUES (${loanRecordId}, ${data.amount}, ${data.paymentDate},
              ${data.salaryMonth ?? null}, ${data.notes ?? null}, ${data.addedBy})
      RETURNING *
    ` as any[];
    // Recalculate outstanding balance and months_paid on the record
    await this.sql`
      UPDATE loan_records
      SET months_paid        = months_paid + 1,
          outstanding_balance = GREATEST(0, outstanding_balance - ${data.amount}),
          status = CASE
            WHEN months_paid + 1 >= approved_tenure THEN 'completed'
            ELSE status
          END,
          updated_at = NOW()
      WHERE id = ${loanRecordId}
    `;
    return rows[0];
  }

  // ── Per-employee access (for employee profile tab) ───────────────────────────

  async getEmployeeRecords(employeeId: string) {
    return this.sql`
      SELECT * FROM loan_records WHERE employee_id = ${employeeId}
      ORDER BY effective_start_date DESC, created_at DESC
    ` as Promise<any[]>;
  }

  async getEmployeeApplications(employeeId: string) {
    return this.sql`
      SELECT * FROM loan_applications WHERE employee_id = ${employeeId}
      ORDER BY applied_at DESC
    ` as Promise<any[]>;
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  async getStats(regions?: string[] | null) {
    if (regions != null && regions.length === 0) {
      return {
        activeCount: 0,
        totalOutstanding: 0,
        monthlyDeductions: 0,
        completingThisMonth: 0,
        pendingApplications: 0,
      };
    }

    const recordConds: string[] = [];
    const recordParams: unknown[] = [];
    appendEffectiveRegionFilter(regions, "e", "b", recordConds, recordParams);
    const recordWhere = recordConds.length ? `WHERE ${recordConds.join(" AND ")}` : "";

    const rows = await this.sql(`
      SELECT
        COUNT(*) FILTER (WHERE lr.status = 'active')                       AS active_count,
        COALESCE(SUM(lr.outstanding_balance) FILTER (WHERE lr.status = 'active'), 0) AS total_outstanding,
        COALESCE(SUM(lr.monthly_deduction)   FILTER (WHERE lr.status = 'active'), 0) AS monthly_deductions,
        COUNT(*) FILTER (WHERE lr.status = 'active' AND lr.months_paid + 1 >= lr.approved_tenure) AS completing_this_month
      FROM loan_records lr
      JOIN employees e ON e.id = lr.employee_id
      LEFT JOIN branches b ON b.id = e.branch_id
      ${recordWhere}
    `, recordParams) as any[];

    const pendingConds = ["la.status = 'pending'"];
    const pendingParams: unknown[] = [];
    appendEffectiveRegionFilter(regions, "e", "b", pendingConds, pendingParams);
    const pending = await this.sql(
      `SELECT COUNT(*)::int AS pending_count
       FROM loan_applications la
       JOIN employees e ON e.id = la.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE ${pendingConds.join(" AND ")}`,
      pendingParams,
    ) as any[];

    return {
      activeCount:         parseInt(rows[0]?.active_count ?? "0"),
      totalOutstanding:    parseFloat(rows[0]?.total_outstanding ?? "0"),
      monthlyDeductions:   parseFloat(rows[0]?.monthly_deductions ?? "0"),
      completingThisMonth: parseInt(rows[0]?.completing_this_month ?? "0"),
      pendingApplications: parseInt(pending[0]?.pending_count ?? "0"),
    };
  }
}

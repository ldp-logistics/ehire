import { BaseRepository } from "../../core/base/BaseRepository.js";

export class CompensationRepository extends BaseRepository {
  // ── Emergency Contacts ──────────────────────────────────────────────────────
  async getAllEmergencyContacts() {
    return this.sql`
      SELECT ec.id, ec.employee_id, ec.full_name, ec.relationship, ec.phone, ec.email, ec.address,
             e.first_name, e.last_name, e.work_email
      FROM emergency_contacts ec INNER JOIN employees e ON e.id = ec.employee_id
      ORDER BY e.first_name, e.last_name, ec.full_name
    ` as Promise<any[]>;
  }

  // ── Salary ──────────────────────────────────────────────────────────────────
  async getSalary(employeeId: string) { return this.sql`SELECT * FROM salary_details WHERE employee_id = ${employeeId} ORDER BY start_date DESC, created_at DESC` as Promise<any[]>; }

  async getSalaryById(id: string) {
    const rows = await this.sql`SELECT * FROM salary_details WHERE id = ${id} LIMIT 1` as any[];
    return rows[0] ?? null;
  }

  async createSalary(employeeId: string, data: any, updatedBy: string) {
    await this.sql`UPDATE salary_details SET is_current = false, updated_at = NOW() WHERE employee_id = ${employeeId} AND is_current = true`;
    const additionalJson = JSON.stringify(data.additionalAllowances ?? []);
    const rows = await this.sql`
      INSERT INTO salary_details (employee_id, annual_salary, base_salary_monthly, allowances_monthly, additional_allowances,
        currency, start_date, is_current, reason, pay_rate, pay_rate_period, payout_frequency, pay_group, pay_method,
        eligible_work_hours, additional_details, notes, updated_by)
      VALUES (${employeeId}, ${String(data.annualSalary)}, ${data.baseSalaryMonthly != null ? String(data.baseSalaryMonthly) : null},
              ${data.allowancesMonthly != null ? String(data.allowancesMonthly) : null}, ${additionalJson}::jsonb,
              ${data.currency || "PKR"}, ${new Date(data.startDate).toISOString()}, true, ${data.reason || null},
              ${data.payRate ? String(data.payRate) : null}, ${data.payRatePeriod || "Monthly"},
              ${data.payoutFrequency || "Monthly"}, ${data.payGroup || null}, ${data.payMethod || "Direct Deposit"},
              ${data.eligibleWorkHours || null}, ${data.additionalDetails || null}, ${data.notes || null}, ${updatedBy})
      RETURNING *
    ` as any[];
    return rows[0];
  }

  async updateSalary(id: string, data: any, updatedBy: string) {
    const existing = await this.sql`SELECT employee_id FROM salary_details WHERE id = ${id}` as any[];
    if (!existing[0]) return null;
    const isCurrent = data.isCurrent === true || data.isCurrent === "true";
    if (isCurrent) await this.sql`UPDATE salary_details SET is_current = false, updated_at = NOW() WHERE employee_id = ${existing[0].employee_id} AND id != ${id}`;
    const additionalJson = JSON.stringify(data.additionalAllowances ?? []);
    const rows = await this.sql`
      UPDATE salary_details SET annual_salary=${String(data.annualSalary)}, currency=${data.currency||"PKR"},
        base_salary_monthly=${data.baseSalaryMonthly != null ? String(data.baseSalaryMonthly) : null},
        allowances_monthly=${data.allowancesMonthly != null ? String(data.allowancesMonthly) : null},
        additional_allowances=${additionalJson}::jsonb,
        start_date=${new Date(data.startDate).toISOString()}, is_current=${isCurrent}, reason=${data.reason||null},
        pay_rate=${data.payRate!=null?String(data.payRate):null}, pay_rate_period=${data.payRatePeriod||"Monthly"},
        payout_frequency=${data.payoutFrequency||"Monthly"}, pay_group=${data.payGroup||null},
        pay_method=${data.payMethod||"Direct Deposit"}, eligible_work_hours=${data.eligibleWorkHours||null},
        additional_details=${data.additionalDetails||null}, notes=${data.notes||null},
        updated_by=${updatedBy}, updated_at=NOW()
      WHERE id=${id} RETURNING *
    ` as any[];
    return rows[0] ?? null;
  }

  async deleteSalary(id: string) {
    const rows = await this.sql`DELETE FROM salary_details WHERE id = ${id} RETURNING employee_id, is_current` as any[];
    if (rows[0] && (rows[0].is_current === true || rows[0].is_current === "true")) {
      await this.sql`UPDATE salary_details SET is_current=true,updated_at=NOW() WHERE employee_id=${rows[0].employee_id} AND id=(SELECT id FROM salary_details WHERE employee_id=${rows[0].employee_id} ORDER BY start_date DESC LIMIT 1)`;
    }
    return rows.length > 0;
  }

  // ── Banking ─────────────────────────────────────────────────────────────────
  async getBanking(employeeId: string) { return this.sql`SELECT * FROM banking_details WHERE employee_id = ${employeeId} ORDER BY is_primary DESC, created_at DESC` as Promise<any[]>; }

  async createBanking(employeeId: string, data: any, updatedBy: string) {
    const isPrimary = data.isPrimary !== false && data.isPrimary !== "false";
    if (isPrimary) await this.sql`UPDATE banking_details SET is_primary = false, updated_at = NOW() WHERE employee_id = ${employeeId}`;
    const rows = await this.sql`
      INSERT INTO banking_details (employee_id, bank_name, name_on_account, bank_code, account_number, iban, is_primary, updated_by)
      VALUES (${employeeId},${data.bankName},${data.nameOnAccount},${data.bankCode||null},${data.accountNumber},${data.iban||null},${isPrimary},${updatedBy}) RETURNING *
    ` as any[];
    return rows[0];
  }

  async updateBanking(id: string, data: any, updatedBy: string) {
    const existing = await this.sql`SELECT employee_id FROM banking_details WHERE id=${id}` as any[];
    if (!existing[0]) return null;
    const isPrimary = data.isPrimary !== false && data.isPrimary !== "false";
    if (isPrimary) await this.sql`UPDATE banking_details SET is_primary = false, updated_at = NOW() WHERE employee_id = ${existing[0].employee_id}`;
    const rows = await this.sql`
      UPDATE banking_details SET bank_name=${data.bankName},name_on_account=${data.nameOnAccount},bank_code=${data.bankCode||null},
        account_number=${data.accountNumber},iban=${data.iban||null},is_primary=${isPrimary},updated_by=${updatedBy},updated_at=NOW()
      WHERE id=${id} RETURNING *
    ` as any[];
    return rows[0] ?? null;
  }

  async deleteBanking(id: string) { const r = await this.sql`DELETE FROM banking_details WHERE id=${id} RETURNING id` as any[]; return r.length > 0; }

  // ── Bonuses ─────────────────────────────────────────────────────────────────
  async getBonuses(employeeId: string) { return this.sql`SELECT * FROM bonuses WHERE employee_id = ${employeeId} ORDER BY bonus_date DESC` as Promise<any[]>; }

  async createBonus(employeeId: string, data: any, updatedBy: string) {
    const rows = await this.sql`INSERT INTO bonuses(employee_id,bonus_type,amount,currency,bonus_date,notes,updated_by) VALUES(${employeeId},${data.bonusType},${String(data.amount)},${data.currency||"PKR"},${new Date(data.bonusDate).toISOString()},${data.notes||null},${updatedBy}) RETURNING *` as any[];
    return rows[0];
  }

  async updateBonus(id: string, data: any, updatedBy: string) {
    const rows = await this.sql`UPDATE bonuses SET bonus_type=${data.bonusType},amount=${String(data.amount)},currency=${data.currency||"PKR"},bonus_date=${new Date(data.bonusDate).toISOString()},notes=${data.notes||null},updated_by=${updatedBy} WHERE id=${id} RETURNING *` as any[];
    return rows[0] ?? null;
  }

  async deleteBonus(id: string) { const r = await this.sql`DELETE FROM bonuses WHERE id=${id} RETURNING id` as any[]; return r.length > 0; }

  // ── Stock Grants ─────────────────────────────────────────────────────────────
  async getStockGrants(employeeId: string) { return this.sql`SELECT * FROM stock_grants WHERE employee_id = ${employeeId} ORDER BY grant_date DESC` as Promise<any[]>; }

  async createStockGrant(employeeId: string, data: any, updatedBy: string) {
    const rows = await this.sql`INSERT INTO stock_grants(employee_id,units,grant_date,vesting_schedule,notes,updated_by) VALUES(${employeeId},${data.units},${new Date(data.grantDate).toISOString()},${data.vestingSchedule||null},${data.notes||null},${updatedBy}) RETURNING *` as any[];
    return rows[0];
  }

  async updateStockGrant(id: string, data: any, updatedBy: string) {
    const rows = await this.sql`UPDATE stock_grants SET units=${data.units},grant_date=${new Date(data.grantDate).toISOString()},vesting_schedule=${data.vestingSchedule||null},notes=${data.notes||null},updated_by=${updatedBy} WHERE id=${id} RETURNING *` as any[];
    return rows[0] ?? null;
  }

  async deleteStockGrant(id: string) { const r = await this.sql`DELETE FROM stock_grants WHERE id=${id} RETURNING id` as any[]; return r.length > 0; }
}

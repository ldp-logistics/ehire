import { BaseRepository } from "../../core/base/BaseRepository.js";
import { appendEffectiveRegionFilter } from "../../lib/employeeRegionSql.js";

export class LeaveRepository extends BaseRepository {
  private static readonly APPROVALS_SELECT =
    "la.*,lr.employee_id,lr.leave_type_id,lr.start_date,lr.end_date,lr.day_type,lr.total_days,lr.reason,lr.status as request_status,lr.applied_at,lt.name as type_name,lt.color,lt.paid,e.first_name,e.last_name,e.nickname,e.employee_id as emp_code,e.department,e.avatar,b.time_zone as employee_branch_tz,b.date_format as employee_branch_df,EXISTS (SELECT 1 FROM leave_approvals la2 WHERE la2.leave_request_id=la.leave_request_id AND la2.status='pending' AND la2.step_order < la.step_order) AS has_prior_pending,(SELECT COUNT(*)::int FROM leave_approvals la3 WHERE la3.leave_request_id=la.leave_request_id) AS total_steps";

  private static readonly APPROVALS_FROM =
    "FROM leave_approvals la INNER JOIN leave_requests lr ON lr.id=la.leave_request_id INNER JOIN leave_types lt ON lt.id=lr.leave_type_id INNER JOIN employees e ON e.id=lr.employee_id LEFT JOIN branches b ON b.id=e.branch_id";
  // ── Audit ─────────────────────────────────────────────────────────────────────
  async audit(entityType: string, entityId: string, action: string, performedBy: string|null, metadata?: any) {
    return this.sql`INSERT INTO leave_audit_log(entity_type,entity_id,action,performed_by,metadata) VALUES(${entityType},${entityId},${action},${performedBy},${metadata?JSON.stringify(metadata):null})`;
  }

  // ── Policies ──────────────────────────────────────────────────────────────────
  async listPolicies() { return this.sql`SELECT p.*,(SELECT COUNT(*)::int FROM leave_types lt WHERE lt.policy_id=p.id) as type_count FROM leave_policies p ORDER BY p.created_at DESC` as Promise<any[]>; }
  async getPolicyById(id: string) { const r = await this.sql`SELECT * FROM leave_policies WHERE id=${id}` as any[]; return r[0]??null; }
  async getPolicyTypes(policyId: string) { return this.sql`SELECT * FROM leave_types WHERE policy_id=${policyId} ORDER BY name` as Promise<any[]>; }
  async insertPolicy(p: any) {
    const workweek = p.workweek ? JSON.stringify(p.workweek) : '[1,2,3,4,5]';
    const r = await this.sql`INSERT INTO leave_policies(name,applicable_departments,applicable_employment_types,applicable_roles,effective_from,effective_to,policy_year,is_active,is_default,unit,workweek,holiday_calendar_name,period_start_month,created_by) VALUES(${p.name},${JSON.stringify(p.applicableDepartments||[])},${JSON.stringify(p.applicableEmploymentTypes||[])},${JSON.stringify(p.applicableRoles||[])},${p.effectiveFrom},${p.effectiveTo||null},${p.policyYear||null},${p.isActive!==false},${!!p.isDefault},${p.unit||'days'},${workweek}::jsonb,${p.holidayCalendarName||null},${p.periodStartMonth||1},${p.createdBy||null}) RETURNING *` as any[];
    return r[0];
  }
  async updatePolicy(id: string, u: any) {
    const parts: string[] = [];
    const ps: any[] = [];
    const p = (col: string, val: any) => { if (val !== undefined) { ps.push(val); parts.push(`${col}=$${ps.length}`); } };
    if (u.name != null)                       p("name", u.name);
    if (u.applicableDepartments != null)      p("applicable_departments", JSON.stringify(u.applicableDepartments));
    if (u.applicableEmploymentTypes != null)  p("applicable_employment_types", JSON.stringify(u.applicableEmploymentTypes));
    if (u.applicableRoles != null)            p("applicable_roles", JSON.stringify(u.applicableRoles));
    if (u.effectiveFrom != null)              p("effective_from", u.effectiveFrom);
    if ("effectiveTo" in u)                   p("effective_to", u.effectiveTo ?? null);
    if (u.policyYear != null)                 p("policy_year", u.policyYear);
    if (u.isActive != null)                   p("is_active", u.isActive);
    if (u.isDefault != null)                  p("is_default", u.isDefault);
    if (u.unit != null)                       p("unit", u.unit);
    if (u.workweek != null)                   p("workweek", JSON.stringify(u.workweek));
    if ("holidayCalendarName" in u)           p("holiday_calendar_name", u.holidayCalendarName ?? null);
    if (u.periodStartMonth != null)           p("period_start_month", u.periodStartMonth);
    if (!parts.length) return this.getPolicyById(id);
    ps.push(id);
    const r = await this.sql(`UPDATE leave_policies SET ${parts.join(",")},updated_at=NOW() WHERE id=$${ps.length} RETURNING *`, ps) as any[];
    return r[0] ?? null;
  }
  async deletePolicy(id: string) { await this.sql`DELETE FROM leave_policies WHERE id=${id}`; }
  async policyHasRequests(id: string) { const r = await this.sql`SELECT 1 FROM leave_requests lr INNER JOIN leave_types lt ON lt.id=lr.leave_type_id WHERE lt.policy_id=${id} LIMIT 1` as any[]; return r.length>0; }
  async getAllActivePolicies(today: string) { return this.sql`SELECT * FROM leave_policies WHERE is_active=true AND effective_from<=${today} AND (effective_to IS NULL OR effective_to>=${today}) ORDER BY created_at DESC` as Promise<any[]>; }

  // ── Leave Types ───────────────────────────────────────────────────────────────
  async getTypeById(id: string) { const r = await this.sql`SELECT * FROM leave_types WHERE id=${id}` as any[]; return r[0]??null; }
  async insertType(t: any) {
    const r = await this.sql`INSERT INTO leave_types(
      policy_id,name,paid,accrual_type,accrual_rate,max_balance,
      carry_forward_allowed,max_carry_forward,requires_document,requires_approval,
      auto_approve_rules,hr_approval_required,min_days,max_days_per_request,blocked_during_notice,
      proration_required,allow_negative_balance,carryover_expiry_days,
      backdating_limit_days,min_notice_days,mandatory_attachment_above_days,
      mandatory_attachment_on_behalf,waiting_period_days,is_compensation_leave,color
    ) VALUES(
      ${t.policyId},${t.name},${t.paid!==false},${t.accrualType||"none"},
      ${t.accrualRate!=null?String(t.accrualRate):null},
      ${t.maxBalance!=null?parseInt(String(t.maxBalance),10):21},
      ${!!t.carryForwardAllowed},
      ${t.maxCarryForward!=null?parseInt(String(t.maxCarryForward),10):null},
      ${!!t.requiresDocument},${t.requiresApproval!==false},
      ${t.autoApproveRules?JSON.stringify(t.autoApproveRules):null}::jsonb,
      ${!!t.hrApprovalRequired},
      ${t.minDays!=null?parseInt(String(t.minDays),10):null},
      ${t.maxDaysPerRequest!=null?parseInt(String(t.maxDaysPerRequest),10):null},
      ${!!t.blockedDuringNotice},
      ${!!t.prorationRequired},${!!t.allowNegativeBalance},
      ${t.carryoverExpiryDays!=null?parseInt(String(t.carryoverExpiryDays),10):null},
      ${t.backdatingLimitDays!=null?parseInt(String(t.backdatingLimitDays),10):null},
      ${t.minNoticeDays!=null?parseInt(String(t.minNoticeDays),10):null},
      ${t.mandatoryAttachmentAboveDays!=null?parseInt(String(t.mandatoryAttachmentAboveDays),10):null},
      ${!!t.mandatoryAttachmentOnBehalf},
      ${t.waitingPeriodDays!=null?parseInt(String(t.waitingPeriodDays),10):null},
      ${!!t.isCompensationLeave},
      ${t.color||"#3b82f6"}
    ) RETURNING *` as any[];
    return r[0];
  }
  async updateType(id: string, t: any) {
    const parts: string[] = [];
    const ps: any[] = [];
    const p = (col: string, val: any) => { if (val !== undefined) { ps.push(val); parts.push(`${col}=$${ps.length}`); } };
    if (t.name != null)          p("name", t.name);
    if (t.paid != null)          p("paid", t.paid);
    if (t.accrualType != null)   p("accrual_type", t.accrualType);
    if ("accrualRate" in t)      p("accrual_rate", t.accrualRate ?? null);
    if (t.maxBalance != null)    p("max_balance", t.maxBalance);
    if (t.carryForwardAllowed != null) p("carry_forward_allowed", t.carryForwardAllowed);
    if ("maxCarryForward" in t)  p("max_carry_forward", t.maxCarryForward ?? null);
    if (t.requiresDocument != null)    p("requires_document", t.requiresDocument);
    if (t.requiresApproval != null)    p("requires_approval", t.requiresApproval);
    if ("autoApproveRules" in t)       p("auto_approve_rules", t.autoApproveRules ? JSON.stringify(t.autoApproveRules) : null);
    if (t.hrApprovalRequired != null)  p("hr_approval_required", t.hrApprovalRequired);
    if ("minDays" in t)                p("min_days", t.minDays ?? null);
    if ("maxDaysPerRequest" in t)      p("max_days_per_request", t.maxDaysPerRequest ?? null);
    if (t.blockedDuringNotice != null) p("blocked_during_notice", t.blockedDuringNotice);
    if (t.prorationRequired != null)   p("proration_required", t.prorationRequired);
    if (t.allowNegativeBalance != null) p("allow_negative_balance", t.allowNegativeBalance);
    if ("carryoverExpiryDays" in t)    p("carryover_expiry_days", t.carryoverExpiryDays ?? null);
    if ("backdatingLimitDays" in t)    p("backdating_limit_days", t.backdatingLimitDays ?? null);
    if ("minNoticeDays" in t)          p("min_notice_days", t.minNoticeDays ?? null);
    if ("mandatoryAttachmentAboveDays" in t) p("mandatory_attachment_above_days", t.mandatoryAttachmentAboveDays ?? null);
    if (t.mandatoryAttachmentOnBehalf != null) p("mandatory_attachment_on_behalf", t.mandatoryAttachmentOnBehalf);
    if ("waitingPeriodDays" in t)      p("waiting_period_days", t.waitingPeriodDays ?? null);
    if (t.isCompensationLeave != null) p("is_compensation_leave", t.isCompensationLeave);
    if (t.color != null)               p("color", t.color);
    if (!parts.length) return this.getTypeById(id);
    ps.push(id);
    const r = await this.sql(`UPDATE leave_types SET ${parts.join(",")},updated_at=NOW() WHERE id=$${ps.length} RETURNING *`, ps) as any[];
    return r[0] ?? null;
  }
  async deleteType(id: string) { await this.sql`DELETE FROM leave_types WHERE id=${id}`; }
  async typeHasRequests(id: string) { const r = await this.sql`SELECT 1 FROM leave_requests WHERE leave_type_id=${id} LIMIT 1` as any[]; return r.length>0; }
  async typeBalancesAbove(id: string, max: number) { const r = await this.sql`SELECT 1 FROM employee_leave_balances WHERE leave_type_id=${id} AND balance::numeric>${max} LIMIT 1` as any[]; return r.length>0; }
  async getTypesByPolicyIds(policyIds: string[]) { return this.sql`SELECT * FROM leave_types WHERE policy_id=ANY(${policyIds}) ORDER BY name` as Promise<any[]>; }
  async getTypeByPolicyId(policyId: string) { return this.sql`SELECT id FROM leave_types WHERE policy_id=${policyId} LIMIT 1` as Promise<any[]>; }
  /**
   * Earned / Annual EL must match the same policy the UI uses (`getBalances` primary_policy).
   * A global `LIMIT 1` without policy often picked the wrong leave_types row when multiple policies exist → zero accrual rows.
   */
  async findEarnedLeaveTypeId(policyId?: string | null) {
    if (policyId) {
      const r = await this.sql`
        SELECT id FROM leave_types
        WHERE policy_id=${policyId}
          AND (LOWER(name) LIKE ANY(ARRAY['%earned%','%annual%']) OR LOWER(TRIM(name))='el')
        ORDER BY created_at ASC
        LIMIT 1
      ` as any[];
      return r[0]?.id ?? null;
    }
    const r = await this.sql`
      WITH primary_policy AS (
        SELECT p.id
        FROM leave_policies p
        WHERE COALESCE(p.is_active, true) = true
          AND EXISTS (SELECT 1 FROM leave_types t WHERE t.policy_id = p.id)
        ORDER BY
          p.is_default DESC,
          CASE WHEN lower(trim(p.name)) = 'standard leave policy' THEN 0 ELSE 1 END,
          (SELECT COUNT(*)::int FROM leave_types t2 WHERE t2.policy_id = p.id) DESC,
          p.created_at ASC
        LIMIT 1
      )
      SELECT lt.id
      FROM leave_types lt
      INNER JOIN primary_policy pp ON lt.policy_id = pp.id
      WHERE LOWER(lt.name) LIKE ANY(ARRAY['%earned%','%annual%']) OR LOWER(TRIM(lt.name))='el'
      ORDER BY lt.created_at ASC
      LIMIT 1
    ` as any[];
    return r[0]?.id ?? null;
  }
  /** Matches "Bereavement Leave", "B L", "BL", and similar (so sync from FreshTeam finds our type). Same primary_policy as balances UI. */
  async findBereavementLeaveTypeId(policyId?: string | null) {
    if (policyId) {
      const r = await this.sql`
        SELECT id FROM leave_types
        WHERE policy_id=${policyId}
          AND (LOWER(name) LIKE '%bereavement%' OR LOWER(TRIM(name)) IN ('b l','bl'))
        ORDER BY created_at ASC
        LIMIT 1
      ` as any[];
      return r[0]?.id ?? null;
    }
    const r = await this.sql`
      WITH primary_policy AS (
        SELECT p.id
        FROM leave_policies p
        WHERE COALESCE(p.is_active, true) = true
          AND EXISTS (SELECT 1 FROM leave_types t WHERE t.policy_id = p.id)
        ORDER BY
          p.is_default DESC,
          CASE WHEN lower(trim(p.name)) = 'standard leave policy' THEN 0 ELSE 1 END,
          (SELECT COUNT(*)::int FROM leave_types t2 WHERE t2.policy_id = p.id) DESC,
          p.created_at ASC
        LIMIT 1
      )
      SELECT lt.id
      FROM leave_types lt
      INNER JOIN primary_policy pp ON lt.policy_id = pp.id
      WHERE LOWER(lt.name) LIKE '%bereavement%' OR LOWER(TRIM(lt.name)) IN ('b l','bl')
      ORDER BY lt.created_at ASC
      LIMIT 1
    ` as any[];
    return r[0]?.id ?? null;
  }
  /** All compensation-leave types for a policy (or primary policy when policyId omitted). */
  async findCompensationLeaveTypes(policyId?: string | null) {
    if (policyId) {
      return this.sql`
        SELECT id, name, max_balance FROM leave_types
        WHERE policy_id=${policyId} AND is_compensation_leave=true
        ORDER BY created_at ASC
      ` as Promise<any[]>;
    }
    return this.sql`
      WITH primary_policy AS (
        SELECT p.id
        FROM leave_policies p
        WHERE COALESCE(p.is_active, true) = true
          AND EXISTS (SELECT 1 FROM leave_types t WHERE t.policy_id = p.id)
        ORDER BY
          p.is_default DESC,
          CASE WHEN lower(trim(p.name)) = 'standard leave policy' THEN 0 ELSE 1 END,
          (SELECT COUNT(*)::int FROM leave_types t2 WHERE t2.policy_id = p.id) DESC,
          p.created_at ASC
        LIMIT 1
      )
      SELECT lt.id, lt.name, lt.max_balance
      FROM leave_types lt
      INNER JOIN primary_policy pp ON lt.policy_id = pp.id
      WHERE lt.is_compensation_leave=true
      ORDER BY lt.created_at ASC
    ` as Promise<any[]>;
  }
  async resolveLeaveTypeByName(name: string) {
    const n = name.trim().toLowerCase(); if (!n) return null;
    // FreshTeam may call bereavement "Compassionate Leave", "Condolence", "B L", "BL", etc. — map to our Bereavement type
    const isBereavementName = n.includes("bereavement") || n.includes("compassionate") || n.includes("condolence") || n === "b l" || n === "bl";
    if (isBereavementName) {
      const bereavementId = await this.findBereavementLeaveTypeId();
      if (bereavementId) return bereavementId;
    }
    const rows = await this.sql`SELECT id,name FROM leave_types WHERE LOWER(TRIM(name)) LIKE ${n+"%"} OR LOWER(TRIM(name))=${n} ORDER BY LENGTH(name) ASC LIMIT 5` as any[];
    if (!rows.length) return null;
    const exact = rows.find((r:any)=>r.name.trim().toLowerCase()===n); if (exact) return exact.id;
    if (n.includes("earned")||n==="el"||n==="annual") { const r=rows.find((r:any)=>/earned|annual|^el$/i.test(String(r.name))); if (r) return r.id; }
    if (n.includes("lwop")||n.includes("unpaid")||n.includes("sick")||n.includes("casual")) { const r=rows.find((r:any)=>/lwop|unpaid|sick|casual/i.test(String(r.name))); if (r) return r.id; }
    if (n.includes("bereavement")) { const r=rows.find((r:any)=>/bereavement/i.test(String(r.name))); if (r) return r.id; }
    return rows[0]?.id??null;
  }

  // ── Holidays ──────────────────────────────────────────────────────────────────
  async listHolidays() { return this.sql`SELECT id,date,name FROM leave_holidays ORDER BY date` as Promise<any[]>; }
  async createHoliday(date: string, name: string|null) { const r = await this.sql`INSERT INTO leave_holidays(date,name) VALUES(${date},${name}) RETURNING id,date,name,created_at` as any[]; return r[0]; }
  async deleteHoliday(id: string) { const r = await this.sql`DELETE FROM leave_holidays WHERE id=${id} RETURNING id` as any[]; return r.length>0; }
  async getHolidaysBetween(start: string, end: string) { return this.sql`SELECT date FROM leave_holidays WHERE date>=${start} AND date<=${end}` as unknown as Promise<{date:string}[]>; }

  // ── Balances ──────────────────────────────────────────────────────────────────
  async getBalances(employeeId: string) {
    return this.sql`
      WITH primary_policy AS (
        SELECT p.id
        FROM leave_policies p
        WHERE COALESCE(p.is_active, true) = true
          AND EXISTS (SELECT 1 FROM leave_types t WHERE t.policy_id = p.id)
        ORDER BY
          p.is_default DESC,
          CASE WHEN lower(trim(p.name)) = 'standard leave policy' THEN 0 ELSE 1 END,
          (SELECT COUNT(*)::int FROM leave_types t2 WHERE t2.policy_id = p.id) DESC,
          p.created_at ASC
        LIMIT 1
      )
      SELECT DISTINCT ON(lt.id) elb.id, elb.employee_id, lt.id as leave_type_id,
        COALESCE(elb.balance,0)::text as balance, COALESCE(elb.used,0)::text as used,
        lt.name as type_name, lt.paid, lt.max_balance, lt.color, lt.accrual_type, lt.accrual_rate, lt.requires_document,
        lt.is_compensation_leave,
        lp.name as policy_name
      FROM leave_types lt
      INNER JOIN primary_policy pp ON lt.policy_id = pp.id
      INNER JOIN leave_policies lp ON lp.id = pp.id
      LEFT JOIN employee_leave_balances elb ON elb.leave_type_id = lt.id AND elb.employee_id = ${employeeId}
      ORDER BY lt.id, elb.updated_at DESC NULLS LAST
    ` as Promise<any[]>;
  }
  async getAllBalances(regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const conds = ["e.employment_status = 'active'"];
    const ps: unknown[] = [];
    appendEffectiveRegionFilter(regions, "e", "b", conds, ps);
    const where = `WHERE ${conds.join(" AND ")}`;
    return this.sql(
      `WITH primary_policy AS (
        SELECT p.id
        FROM leave_policies p
        WHERE COALESCE(p.is_active, true) = true
          AND EXISTS (SELECT 1 FROM leave_types t WHERE t.policy_id = p.id)
        ORDER BY
          p.is_default DESC,
          CASE WHEN lower(trim(p.name)) = 'standard leave policy' THEN 0 ELSE 1 END,
          (SELECT COUNT(*)::int FROM leave_types t2 WHERE t2.policy_id = p.id) DESC,
          p.created_at ASC
        LIMIT 1
      )
      SELECT e.id as employee_id, e.first_name, e.last_name, e.employee_id as emp_code, e.department,
        lt.id as leave_type_id, lt.name as type_name, lt.paid, lt.color, lt.is_compensation_leave,
        elb.id as id, COALESCE(elb.balance,0)::text as balance, COALESCE(elb.used,0)::text as used
      FROM employees e
      LEFT JOIN branches b ON b.id = e.branch_id
      CROSS JOIN leave_types lt
      INNER JOIN primary_policy pp ON lt.policy_id = pp.id
      LEFT JOIN LATERAL (
        SELECT id, balance, used FROM employee_leave_balances
        WHERE employee_id = e.id AND leave_type_id = lt.id
        ORDER BY updated_at DESC NULLS LAST LIMIT 1
      ) elb ON true
      ${where}
      ORDER BY e.last_name, e.first_name, lt.name`,
      ps,
    ) as Promise<any[]>;
  }
  async getBalance(employeeId: string, leaveTypeId: string) { return this.sql`SELECT id,balance,used FROM employee_leave_balances WHERE employee_id=${employeeId} AND leave_type_id=${leaveTypeId}` as Promise<any[]>; }
  async getBalancesForEmployee(employeeId: string, typeIds: string[]) { return this.sql`SELECT leave_type_id,balance,used FROM employee_leave_balances WHERE employee_id=${employeeId} AND leave_type_id=ANY(${typeIds})` as Promise<any[]>; }
  async insertBalance(employeeId: string, leaveTypeId: string, balance: number) { await this.sql`INSERT INTO employee_leave_balances(employee_id,leave_type_id,balance,used,last_accrual_at) VALUES(${employeeId},${leaveTypeId},${balance},0,NOW()) ON CONFLICT (employee_id, leave_type_id) DO NOTHING`; }
  async insertBalanceWithNullAccrual(employeeId: string, leaveTypeId: string) { await this.sql`INSERT INTO employee_leave_balances(employee_id,leave_type_id,balance,used,last_accrual_at) VALUES(${employeeId},${leaveTypeId},0,0,NULL) ON CONFLICT (employee_id, leave_type_id) DO NOTHING`; }
  async deductBalance(employeeId: string, leaveTypeId: string, days: number) { return this.sql`UPDATE employee_leave_balances SET balance=balance::numeric-${days},used=used::numeric+${days},updated_at=NOW() WHERE employee_id=${employeeId} AND leave_type_id=${leaveTypeId} AND balance::numeric>=${days} RETURNING id` as Promise<any[]>; }
  async restoreBalance(employeeId: string, leaveTypeId: string, days: number) { await this.sql`UPDATE employee_leave_balances SET balance=balance::numeric+${days},used=used::numeric-${days},updated_at=NOW() WHERE employee_id=${employeeId} AND leave_type_id=${leaveTypeId}`; }
  async adjustBalance(id: string, newBalance: number) { await this.sql`UPDATE employee_leave_balances SET balance=${newBalance},updated_at=NOW() WHERE id=${id}`; }
  async addToBalance(id: string, newBalance: number) { await this.sql`UPDATE employee_leave_balances SET balance=${newBalance},updated_at=NOW() WHERE id=${id}`; }
  async getBalanceById(id: string) { const r = await this.sql`SELECT elb.*,lt.name as type_name,lt.is_compensation_leave,lt.max_balance as type_max_balance FROM employee_leave_balances elb INNER JOIN leave_types lt ON lt.id=elb.leave_type_id WHERE elb.id=${id}` as any[]; return r[0]??null; }
  async getMonthlyAccrualBalances(currentMonth: string) {
    return this.sql`
      SELECT elb.*, lt.accrual_rate, lt.max_balance, lt.name AS type_name, e.join_date
      FROM employee_leave_balances elb
      INNER JOIN leave_types lt ON lt.id = elb.leave_type_id
      INNER JOIN employees e ON e.id = elb.employee_id
      WHERE lt.accrual_type = 'monthly'
        AND lt.accrual_rate IS NOT NULL
        AND COALESCE(lt.is_compensation_leave, false) = false
        AND e.employment_status = 'active'
        AND (
          elb.last_accrual_at IS NULL
          OR TO_CHAR(elb.last_accrual_at, 'YYYY-MM') < ${currentMonth}
        )
    ` as Promise<any[]>;
  }
  async updateAccrual(id: string, nb: number) { await this.sql`UPDATE employee_leave_balances SET balance=${nb},last_accrual_at=NOW(),updated_at=NOW() WHERE id=${id}`; }
  async updateEarnedLeaveAccrual(id: string, nb: number, lastAccrualAt: string) { await this.sql`UPDATE employee_leave_balances SET balance=${nb},last_accrual_at=${lastAccrualAt}::timestamptz,updated_at=NOW() WHERE id=${id}`; }
  async getEarnedLeaveBalances(elTypeId: string) { return this.sql`SELECT elb.id,elb.employee_id,elb.balance,elb.last_accrual_at,elb.leave_type_id,e.join_date,lt.accrual_rate,lt.max_balance as type_max_balance FROM employee_leave_balances elb INNER JOIN employees e ON e.id=elb.employee_id INNER JOIN leave_types lt ON lt.id=elb.leave_type_id WHERE elb.leave_type_id=${elTypeId} AND e.employment_status='active'` as Promise<any[]>; }
  /** Seed EL balance rows so accrual can UPDATE (UI already shows types from primary policy via LEFT JOIN). */
  async ensureEarnedLeaveBalanceRowsForActive(elTypeId: string): Promise<void> {
    await this.sql`
      INSERT INTO employee_leave_balances(employee_id, leave_type_id, balance, used, last_accrual_at)
      SELECT e.id, ${elTypeId}, 0, 0, NULL
      FROM employees e
      WHERE e.employment_status = 'active'
      ON CONFLICT (employee_id, leave_type_id) DO NOTHING
    `;
  }
  async getActiveEmployees() { return this.sql`SELECT e.id,e.department,e.employee_type FROM employees e WHERE e.employment_status='active'` as Promise<any[]>; }
  async getExistingELBalanceEmployeeIds(elTypeId: string) { return this.sql`SELECT employee_id FROM employee_leave_balances WHERE leave_type_id=${elTypeId}` as Promise<any[]>; }

  // ── Requests ──────────────────────────────────────────────────────────────────
  async getRequestById(id: string) { const r = await this.sql`SELECT lr.*,lt.paid FROM leave_requests lr INNER JOIN leave_types lt ON lt.id=lr.leave_type_id WHERE lr.id=${id}` as any[]; return r[0]??null; }
  async getRequestWithType(id: string) { const r = await this.sql`SELECT lr.*,lt.name as type_name,lt.color,lt.paid,lt.requires_document,e.first_name,e.last_name,e.employee_id as emp_code,e.department,b.time_zone as employee_branch_tz,b.date_format as employee_branch_df FROM leave_requests lr INNER JOIN leave_types lt ON lt.id=lr.leave_type_id INNER JOIN employees e ON e.id=lr.employee_id LEFT JOIN branches b ON b.id=e.branch_id WHERE lr.id=${id}` as any[]; return r[0]??null; }
  async getRequestWithTypeAndDecider(id: string) {
    const r = await this.sql`SELECT lr.*,lt.name as type_name,lt.color,lt.paid,lt.requires_document,e.first_name,e.last_name,e.employee_id as emp_code,e.department,decider.first_name as decided_by_first_name,decider.last_name as decided_by_last_name FROM leave_requests lr INNER JOIN leave_types lt ON lt.id=lr.leave_type_id INNER JOIN employees e ON e.id=lr.employee_id LEFT JOIN employees decider ON decider.id::text = lr.decided_by WHERE lr.id=${id}` as any[];
    return r[0] ?? null;
  }
  async getMyRequests(employeeId: string, limit: number, offset: number) { return this.sql`SELECT lr.id,lr.leave_type_id,lr.start_date,lr.end_date,lr.day_type,lr.total_days,lr.reason,lr.status,lr.applied_at,lr.decided_at,lr.decided_by,lr.rejection_reason,lt.name as type_name,lt.color,lt.paid,decider.first_name as decided_by_first_name,decider.last_name as decided_by_last_name FROM leave_requests lr INNER JOIN leave_types lt ON lt.id=lr.leave_type_id LEFT JOIN employees decider ON decider.id::text = lr.decided_by WHERE lr.employee_id=${employeeId} ORDER BY lr.applied_at DESC LIMIT ${limit} OFFSET ${offset}` as Promise<any[]>; }
  async getEmployeeRequests(employeeId: string) { return this.sql`SELECT lr.id,lr.leave_type_id,lr.start_date,lr.end_date,lr.day_type,lr.total_days,lr.reason,lr.status,lr.applied_at,lr.decided_at,lr.rejection_reason,lt.name as type_name,lt.color,lt.paid,b.time_zone as employee_branch_tz,b.date_format as employee_branch_df FROM leave_requests lr INNER JOIN leave_types lt ON lt.id=lr.leave_type_id INNER JOIN employees e ON e.id=lr.employee_id LEFT JOIN branches b ON b.id=e.branch_id WHERE lr.employee_id=${employeeId} ORDER BY lr.applied_at DESC` as Promise<any[]>; }
  async listRequests(params: {
    role: string;
    employeeId?: string | null;
    status?: string;
    from?: string;
    to?: string;
    q?: string;
    limit: number;
    offset: number;
    scopedDepts?: string[];
    scopedOffices?: string[];
    regions?: string[] | null;
  }): Promise<{ rows: any[]; total: number }> {
    if (params.regions != null && params.regions.length === 0) return { rows: [], total: 0 };
    const fromJoin = `FROM leave_requests lr INNER JOIN leave_types lt ON lt.id=lr.leave_type_id INNER JOIN employees e ON e.id=lr.employee_id LEFT JOIN branches b ON b.id=e.branch_id`;
    const conds: string[] = [];
    const ps: any[] = [];
    if (params.role === "manager" && params.employeeId) {
      ps.push(params.employeeId);
      conds.push(`e.manager_id=$${ps.length}`);
    }
    // limited_hr: only see employees in their scoped depts/offices
    if (params.scopedDepts !== undefined || params.scopedOffices !== undefined) {
      const scopeParts: string[] = [];
      if (params.scopedDepts && params.scopedDepts.length > 0) {
        ps.push(params.scopedDepts); scopeParts.push(`e.department=ANY($${ps.length})`);
      }
      if (params.scopedOffices && params.scopedOffices.length > 0) {
        ps.push(params.scopedOffices); scopeParts.push(`e.location=ANY($${ps.length})`);
      }
      conds.push(scopeParts.length > 0 ? `(${scopeParts.join(" OR ")})` : "1=0");
    }
    if (params.status && params.status !== "all") {
      ps.push(params.status);
      conds.push(`lr.status=$${ps.length}`);
    }
    if (params.from) {
      ps.push(params.from);
      conds.push(`lr.end_date>=$${ps.length}`);
    }
    if (params.to) {
      ps.push(params.to);
      conds.push(`lr.start_date<=$${ps.length}`);
    }
    const qTrim = (params.q ?? "").trim();
    if (qTrim) {
      const safe = qTrim.toLowerCase().replace(/[%_\\]/g, "");
      const pat = `%${safe}%`;
      ps.push(pat);
      conds.push(
        `(LOWER(TRIM(COALESCE(e.first_name,'')||' '||COALESCE(e.last_name,''))) LIKE $${ps.length} OR LOWER(COALESCE(lt.name,'')) LIKE $${ps.length} OR LOWER(COALESCE(e.department,'')) LIKE $${ps.length} OR LOWER(COALESCE(e.employee_id,'')) LIKE $${ps.length})`,
      );
    }
    appendEffectiveRegionFilter(params.regions, "e", "b", conds, ps);
    const where = conds.length ? ` WHERE ${conds.join(" AND ")}` : "";
    const countQ = `SELECT COUNT(*)::int AS c ${fromJoin}${where}`;
    const countRows = (await this.sql(countQ, [...ps])) as { c: number }[];
    const total = countRows[0]?.c ?? 0;
    const selQ = `SELECT lr.id,lr.employee_id,lr.leave_type_id,lr.start_date,lr.end_date,lr.day_type,lr.total_days,lr.reason,lr.status,lr.applied_at,lr.decided_at,lr.rejection_reason,lt.name as type_name,lt.color,lt.paid,e.first_name,e.last_name,e.employee_id as emp_code,e.department,b.time_zone as employee_branch_tz,b.date_format as employee_branch_df ${fromJoin}${where} ORDER BY lr.applied_at DESC LIMIT $${ps.length + 1} OFFSET $${ps.length + 2}`;
    const rows = (await this.sql(selQ, [...ps, params.limit, params.offset])) as any[];
    return { rows, total };
  }
  async createRequest(d: any) { const notifyJson=d.notifyEmployeeIds&&Array.isArray(d.notifyEmployeeIds)?JSON.stringify(d.notifyEmployeeIds):null; const r = await this.sql`INSERT INTO leave_requests(employee_id,leave_type_id,start_date,end_date,day_type,total_days,reason,attachment_url,notify_employee_ids,status,policy_snapshot) VALUES(${d.employeeId},${d.leaveTypeId},${d.startDate},${d.endDate},${d.dayType||"full"},${d.totalDays},${d.reason||null},${d.attachmentUrl||null},${notifyJson}::jsonb,'pending',${d.policySnapshot}::jsonb) RETURNING *` as any[]; return r[0]; }
  async createAutoApprovedRequest(d: any) { const notifyJson=d.notifyEmployeeIds&&Array.isArray(d.notifyEmployeeIds)?JSON.stringify(d.notifyEmployeeIds):null; const r = await this.sql`INSERT INTO leave_requests(employee_id,leave_type_id,start_date,end_date,day_type,total_days,reason,attachment_url,notify_employee_ids,status,decided_at,decided_by,policy_snapshot,attendance_sync_status) VALUES(${d.employeeId},${d.leaveTypeId},${d.startDate},${d.endDate},${d.dayType||"full"},${d.totalDays},${d.reason||null},${d.attachmentUrl||null},${notifyJson}::jsonb,'approved',NOW(),'auto',${d.policySnapshot}::jsonb,'pending') RETURNING *` as any[]; return r[0]; }
  async updateRequestSyncStatus(id: string, status: string) { await this.sql`UPDATE leave_requests SET attendance_sync_status=${status} WHERE id=${id}`; }
  async cancelRequest(id: string) { return this.sql`UPDATE leave_requests SET status='cancelled',updated_at=NOW() WHERE id=${id} AND status IN('pending','approved') RETURNING id` as Promise<any[]>; }
  async deleteRequest(id: string) { const r = await this.sql`DELETE FROM leave_requests WHERE id=${id} RETURNING id` as any[]; return r; }
  async approveRequest(id: string, decidedBy: string) { return this.sql`UPDATE leave_requests SET status='approved',decided_at=NOW(),decided_by=${decidedBy} WHERE id=${id} AND status='pending' RETURNING id` as Promise<any[]>; }
  async rejectRequest(id: string, decidedBy: string, reason: string) { return this.sql`UPDATE leave_requests SET status='rejected',decided_at=NOW(),decided_by=${decidedBy},rejection_reason=${reason} WHERE id=${id} AND status='pending' RETURNING id` as Promise<any[]>; }
  async checkOverlap(employeeId: string, startDate: string, endDate: string) { return this.sql`SELECT id FROM leave_requests WHERE employee_id=${employeeId} AND status IN('approved','pending') AND start_date<=${endDate} AND end_date>=${startDate}` as Promise<any[]>; }
  /** Same as checkOverlap but excludes a specific request id (post-insert race check). */
  async checkOverlapExcluding(employeeId: string, startDate: string, endDate: string, excludeId: string) { return this.sql`SELECT id FROM leave_requests WHERE employee_id=${employeeId} AND id!=${excludeId} AND status IN('approved','pending') AND start_date<=${endDate} AND end_date>=${startDate}` as Promise<any[]>; }
  async deleteRequestById(id: string) { await this.sql`DELETE FROM leave_requests WHERE id=${id}`; }
  async getRequestsByFtId(ftId: string) { return this.sql`SELECT id,status,total_days FROM leave_requests WHERE freshteam_time_off_id=${ftId} LIMIT 1` as Promise<any[]>; }
  async createFtRequest(d: any) { await this.sql`INSERT INTO leave_requests(employee_id,leave_type_id,start_date,end_date,day_type,total_days,reason,status,applied_at,decided_at,decided_by,rejection_reason,freshteam_time_off_id) VALUES(${d.employeeId},${d.leaveTypeId},${d.startDate},${d.endDate},'full',${d.totalDays},${d.reason||null},${d.status},${d.appliedAt},${d.decidedAt},${d.decidedBy},${d.rejectionReason},${d.ftId})`; }
  async updateFtRequest(id: string, d: any) { await this.sql`UPDATE leave_requests SET employee_id=${d.employeeId},leave_type_id=${d.leaveTypeId},start_date=${d.startDate},end_date=${d.endDate},day_type='full',total_days=${d.totalDays},reason=${d.reason||null},status=${d.status},applied_at=${d.appliedAt},decided_at=${d.decidedAt},decided_by=${d.decidedBy},rejection_reason=${d.rejectionReason},updated_at=NOW() WHERE id=${id}`; }
  async updateFtBalance(employeeId: string, leaveTypeId: string, used: number) {
    const r = await this.sql`SELECT id,used FROM employee_leave_balances WHERE employee_id=${employeeId} AND leave_type_id=${leaveTypeId} LIMIT 1` as any[];
    if (r[0]) await this.sql`UPDATE employee_leave_balances SET used=${String(used)},updated_at=NOW() WHERE id=${r[0].id}`;
    else await this.sql`INSERT INTO employee_leave_balances(employee_id,leave_type_id,balance,used) VALUES(${employeeId},${leaveTypeId},0,${String(used)}) ON CONFLICT (employee_id, leave_type_id) DO UPDATE SET used = EXCLUDED.used, updated_at = NOW()`;
  }

  // ── Approvals ─────────────────────────────────────────────────────────────────
  async createApproval(d: {requestId:string;approverId:string;approverRole:string;stepOrder:number}) { await this.sql`INSERT INTO leave_approvals(leave_request_id,approver_id,approver_role,status,step_order) VALUES(${d.requestId},${d.approverId},${d.approverRole},'pending',${d.stepOrder})`; }
  async getApprovalById(id: string) { const r = await this.sql`SELECT * FROM leave_approvals WHERE id=${id}` as any[]; return r[0]??null; }
  async getApprovals(requestId: string) { return this.sql`SELECT la.*,ae.first_name as approver_first_name,ae.last_name as approver_last_name FROM leave_approvals la INNER JOIN employees ae ON ae.id=la.approver_id WHERE la.leave_request_id=${requestId} ORDER BY la.step_order` as Promise<any[]>; }
  async getPendingApprovals(requestId: string) { return this.sql`SELECT id FROM leave_approvals WHERE leave_request_id=${requestId} AND status='pending'` as Promise<any[]>; }
  /** Pending rows for a request, ordered by step (for sequential approval). */
  async getPendingApprovalsOrdered(requestId: string) {
    return this.sql`SELECT id, step_order, approver_id FROM leave_approvals WHERE leave_request_id=${requestId} AND status='pending' ORDER BY step_order ASC, id ASC` as Promise<any[]>;
  }
  /** Pending steps strictly before `stepOrder` (manager before HR, etc.). */
  async getPendingApprovalsBeforeStep(requestId: string, stepOrder: number) {
    return this.sql`SELECT id, step_order FROM leave_approvals WHERE leave_request_id=${requestId} AND status='pending' AND step_order < ${stepOrder} ORDER BY step_order ASC` as Promise<any[]>;
  }
  async setApprovalApproved(id: string, actedById: string|null, remarks?: string) { return this.sql`UPDATE leave_approvals SET status='approved',actioned_at=NOW(),remarks=${remarks||null},acted_by_id=${actedById} WHERE id=${id} AND status='pending' RETURNING id` as Promise<any[]>; }
  async setApprovalRejected(id: string, actedById: string|null, remarks?: string) { return this.sql`UPDATE leave_approvals SET status='rejected',actioned_at=NOW(),remarks=${remarks||null},acted_by_id=${actedById} WHERE id=${id} AND status='pending' RETURNING id` as Promise<any[]>; }
  async cancelPendingApprovals(requestId: string) { await this.sql`UPDATE leave_approvals SET status='rejected',actioned_at=NOW(),remarks='Request cancelled' WHERE leave_request_id=${requestId} AND status='pending'`; }
  async autoRejectRemaining(requestId: string) { await this.sql`UPDATE leave_approvals SET status='rejected',actioned_at=NOW(),remarks='Auto-rejected (prior step rejected)' WHERE leave_request_id=${requestId} AND status='pending'`; }
  async getMyApprovals(employeeId: string, regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const conds = ["la.approver_id=$1", "la.status='pending'", "lr.status='pending'", "lr.employee_id!=$1"];
    const ps: unknown[] = [employeeId];
    appendEffectiveRegionFilter(regions, "e", "b", conds, ps);
    return this.sql(
      `SELECT ${LeaveRepository.APPROVALS_SELECT} ${LeaveRepository.APPROVALS_FROM} WHERE ${conds.join(" AND ")} ORDER BY la.created_at ASC`,
      ps,
    ) as Promise<any[]>;
  }
  async getHrApprovals(employeeId: string, regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const conds = ["la.approver_role IN('hr','admin','manager','second_manager')", "la.status='pending'", "lr.status='pending'", "lr.employee_id!=$1"];
    const ps: unknown[] = [employeeId];
    appendEffectiveRegionFilter(regions, "e", "b", conds, ps);
    return this.sql(
      `SELECT ${LeaveRepository.APPROVALS_SELECT} ${LeaveRepository.APPROVALS_FROM} WHERE ${conds.join(" AND ")} ORDER BY la.created_at ASC`,
      ps,
    ) as Promise<any[]>;
  }
  /** Same rows as getHrApprovals but no requester exclusion — for admin/hr users not linked to an employee (e.g. break-glass ehire). Includes manager steps so backlog is visible. */
  async getHrApprovalsOrgWide(regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const conds = ["la.approver_role IN('hr','admin','manager','second_manager')", "la.status='pending'", "lr.status='pending'"];
    const ps: unknown[] = [];
    appendEffectiveRegionFilter(regions, "e", "b", conds, ps);
    return this.sql(
      `SELECT ${LeaveRepository.APPROVALS_SELECT} ${LeaveRepository.APPROVALS_FROM} WHERE ${conds.join(" AND ")} ORDER BY la.created_at ASC`,
      ps,
    ) as Promise<any[]>;
  }
  /** Like getHrApprovals() but filters by allowed departments/offices for limited_hr scope. */
  async getHrApprovalsScopedDepts(employeeId: string, depts: string[], offices: string[], regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const scopeParts: string[] = [];
    const ps: unknown[] = [employeeId];
    if (depts.length > 0) { ps.push(depts); scopeParts.push(`e.department=ANY($${ps.length})`); }
    if (offices.length > 0) { ps.push(offices); scopeParts.push(`e.location=ANY($${ps.length})`); }
    const conds = ["la.approver_role IN('hr','admin','manager','second_manager')", "la.status='pending'", "lr.status='pending'", "lr.employee_id!=$1"];
    if (scopeParts.length > 0) conds.push(`(${scopeParts.join(" OR ")})`);
    else conds.push("1=0");
    appendEffectiveRegionFilter(regions, "e", "b", conds, ps);
    return this.sql(
      `SELECT ${LeaveRepository.APPROVALS_SELECT} ${LeaveRepository.APPROVALS_FROM} WHERE ${conds.join(" AND ")} ORDER BY la.created_at ASC`,
      ps,
    ) as Promise<any[]>;
  }

  // ── Attendance Sync ───────────────────────────────────────────────────────────
  async getRequestForSync(requestId: string) { const r = await this.sql`SELECT lr.*,lt.name as type_name FROM leave_requests lr INNER JOIN leave_types lt ON lt.id=lr.leave_type_id WHERE lr.id=${requestId}` as any[]; return r[0]??null; }
  async getAttendanceRecord(employeeId: string, dateStr: string) { return this.sql`SELECT id FROM attendance_records WHERE employee_id=${employeeId} AND date=${dateStr}` as Promise<any[]>; }
  async upsertAttendanceLeave(employeeId: string, dateStr: string, status: string, remarks: string, existing: any[]) {
    if (existing.length>0) await this.sql`UPDATE attendance_records SET remarks=${remarks},status=${status},updated_at=NOW() WHERE id=${existing[0].id}`;
    else await this.sql`INSERT INTO attendance_records(employee_id,date,source,status,remarks,created_by) VALUES(${employeeId},${dateStr},'manual',${status},${remarks},'leave_system')`;
  }
  async deleteLeaveAttendance(employeeId: string, dateStr: string) { await this.sql`DELETE FROM attendance_records WHERE employee_id=${employeeId} AND date=${dateStr} AND check_in_time IS NULL AND created_by='leave_system'`; }

  // ── Year-end ──────────────────────────────────────────────────────────────────
  async getActiveEmployeesWithCode() { return this.sql`SELECT id,employee_id FROM employees WHERE employment_status='active' ORDER BY employee_id` as Promise<any[]>; }
  async getELBalance(employeeId: string, elTypeId: string) { return this.sql`SELECT id,employee_id,leave_type_id,balance,used,last_reset_at FROM employee_leave_balances WHERE employee_id=${employeeId} AND leave_type_id=${elTypeId}` as Promise<any[]>; }
  async getEmployeeDeptType(employeeId: string) { const r = await this.sql`SELECT department,employee_type FROM employees WHERE id=${employeeId}` as any[]; return r[0]??null; }
  /** Branch IANA timezone + date format for leave submitter (emails / display context). */
  async getEmployeeBranchDisplay(employeeId: string) {
    const r = await this.sql`
      SELECT b.time_zone AS branch_tz, b.date_format AS branch_df
      FROM employees e
      LEFT JOIN branches b ON b.id = e.branch_id
      WHERE e.id = ${employeeId}
      LIMIT 1
    ` as any[];
    return r[0] ?? null;
  }
  async snapshotBalance(employeeId: string, leaveTypeId: string, year: number, balance: number, used: number) { await this.sql`INSERT INTO leave_year_end_snapshots(employee_id,leave_type_id,year,balance,used,snapshot_at) VALUES(${employeeId},${leaveTypeId},${year},${balance},${used},NOW())`; }
  async resetELBalance(id: string, resetDate: string) { await this.sql`UPDATE employee_leave_balances SET balance=0,last_reset_at=${resetDate}::timestamptz,updated_at=NOW() WHERE id=${id}`; }
  async resetBereavementBalance(id: string, days: number, resetDate: string) { await this.sql`UPDATE employee_leave_balances SET balance=${days},last_reset_at=${resetDate}::timestamptz,updated_at=NOW() WHERE id=${id}`; }
  async insertBereavementBalance(employeeId: string, typeId: string, days: number, resetDate: string) { await this.sql`INSERT INTO employee_leave_balances(employee_id,leave_type_id,balance,used,last_reset_at,last_accrual_at) VALUES(${employeeId},${typeId},${days},0,${resetDate}::timestamptz,NOW()) ON CONFLICT (employee_id, leave_type_id) DO UPDATE SET balance = EXCLUDED.balance, used = EXCLUDED.used, last_reset_at = EXCLUDED.last_reset_at, last_accrual_at = EXCLUDED.last_accrual_at, updated_at = NOW()`; }
  async tryInsertAccrualRun(period: string) { return this.sql`INSERT INTO leave_accrual_run(period,run_at) VALUES(${period},NOW()) ON CONFLICT(period) DO NOTHING RETURNING period` as Promise<any[]>; }

  // ── Calendar / Team / Stats ───────────────────────────────────────────────────
  async getCalendar(startDate: string, endDate: string, department?: string, regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const conds = ["lr.status='approved'", "lr.start_date<=$2", "lr.end_date>=$1"];
    const ps: unknown[] = [startDate, endDate];
    if (department) { ps.push(department); conds.push(`e.department=$${ps.length}`); }
    appendEffectiveRegionFilter(regions, "e", "b", conds, ps);
    return this.sql(
      `SELECT lr.id,lr.employee_id,lr.start_date,lr.end_date,lr.day_type,lr.total_days,lr.status,lt.name as type_name,lt.color,e.first_name,e.last_name,e.department,e.avatar
       FROM leave_requests lr
       INNER JOIN leave_types lt ON lt.id=lr.leave_type_id
       INNER JOIN employees e ON e.id=lr.employee_id
       LEFT JOIN branches b ON b.id=e.branch_id
       WHERE ${conds.join(" AND ")}
       ORDER BY lr.start_date`,
      ps,
    ) as Promise<any[]>;
  }
  async getTeam(managerId: string) { return this.sql`SELECT e.id,e.first_name,e.last_name,e.employee_id as emp_code,e.department,e.avatar FROM employees e WHERE e.manager_id=${managerId} AND e.employment_status='active'` as Promise<any[]>; }
  async getTeamBalances(teamIds: string[]) { return this.sql`SELECT elb.employee_id,elb.balance,elb.used,lt.name as type_name,lt.color FROM employee_leave_balances elb INNER JOIN leave_types lt ON lt.id=elb.leave_type_id WHERE elb.employee_id=ANY(${teamIds})` as Promise<any[]>; }
  async getStats(role: string, employeeId: string|null, today: string, regions?: string[] | null) {
    const monthStart = today.slice(0,8)+"01";
    if (role==="manager"&&employeeId) {
      const [[p],[ol],[ap],[po]] = await Promise.all([this.sql`SELECT COUNT(*)::int as count FROM leave_approvals la INNER JOIN leave_requests lr ON lr.id=la.leave_request_id WHERE la.approver_id=${employeeId} AND la.status='pending' AND lr.status='pending'` as Promise<any[]>, this.sql`SELECT COUNT(*)::int as count FROM leave_requests lr INNER JOIN employees e ON e.id=lr.employee_id WHERE lr.status='approved' AND lr.start_date<=${today} AND lr.end_date>=${today} AND e.manager_id=${employeeId}` as Promise<any[]>, this.sql`SELECT COUNT(*)::int as count FROM leave_requests lr INNER JOIN employees e ON e.id=lr.employee_id WHERE lr.status='approved' AND lr.start_date>=${monthStart} AND e.manager_id=${employeeId}` as Promise<any[]>, this.sql`SELECT COUNT(*)::int as count FROM leave_policies WHERE is_active=true` as Promise<any[]>]);
      return { pendingRequests:p.count, onLeaveToday:ol.count, approvedThisMonth:ap.count, activePolicies:po.count };
    }
    if(role==="employee"&&employeeId) {
      const [[pc],[apc],[tc],[tpo]] = await Promise.all([
        this.sql`SELECT COUNT(*)::int as count FROM leave_requests WHERE status='pending' AND employee_id=${employeeId}` as Promise<any[]>,
        this.sql`SELECT COUNT(*)::int as count FROM leave_requests lr WHERE lr.status='approved' AND lr.start_date<=${today} AND lr.end_date>=${today} AND lr.employee_id=${employeeId}` as Promise<any[]>,
        this.sql`SELECT COUNT(*)::int as count FROM leave_requests WHERE status='approved' AND start_date>=${monthStart} AND employee_id=${employeeId}` as Promise<any[]>,
        this.sql`SELECT COUNT(*)::int as count FROM leave_policies WHERE is_active=true` as Promise<any[]>,
      ]);
      return { pendingRequests:pc.count, onLeaveToday:apc.count, approvedThisMonth:tc.count, activePolicies:tpo.count };
    }
    if (regions != null && regions.length === 0) {
      return { pendingRequests: 0, onLeaveToday: 0, approvedThisMonth: 0, activePolicies: 0 };
    }
    const buildRegionScopedCount = async (baseConds: string[], extraParams: unknown[] = []) => {
      const conds = [...baseConds];
      const ps = [...extraParams];
      appendEffectiveRegionFilter(regions, "e", "b", conds, ps);
      const rows = await this.sql(
        `SELECT COUNT(*)::int as count FROM leave_requests lr INNER JOIN employees e ON e.id=lr.employee_id LEFT JOIN branches b ON b.id=e.branch_id WHERE ${conds.join(" AND ")}`,
        ps,
      ) as any[];
      return rows[0]?.count ?? 0;
    };
    const [pc, apc, tc, tpoRows] = await Promise.all([
      buildRegionScopedCount(["lr.status='pending'"]),
      buildRegionScopedCount(["lr.status='approved'", "lr.start_date<=$1", "lr.end_date>=$1"], [today]),
      buildRegionScopedCount(["lr.status='approved'", "lr.start_date>=$1"], [monthStart]),
      this.sql`SELECT COUNT(*)::int as count FROM leave_policies WHERE is_active=true` as Promise<any[]>,
    ]);
    const tpo = tpoRows[0];
    return { pendingRequests: pc, onLeaveToday: apc, approvedThisMonth: tc, activePolicies: tpo?.count ?? 0 };
  }

  // ── Employee helpers ──────────────────────────────────────────────────────────
  async getEmployeeDetails(employeeId: string) { const r = await this.sql`SELECT id,department,employee_type,employment_status,join_date,exit_date FROM employees WHERE id=${employeeId}` as any[]; return r[0]??null; }
  async getEmployeeById(id: string) { const r = await this.sql`SELECT id FROM employees WHERE id=${id}` as any[]; return r[0]??null; }
  async getUserEmployeeId(userId: string) { const r = await this.sql`SELECT employee_id FROM users WHERE id=${userId} AND employee_id IS NOT NULL` as any[]; return r[0]?.employee_id??null; }
  /** Reporting manager for this employee: `manager_id` (employee uuid) and optional `manager_email` (Freshteam / CSV). */
  async getEmployeeManager(employeeId: string) {
    const r = await this.sql`SELECT manager_id, manager_email FROM employees WHERE id=${employeeId}` as any[];
    return r[0] ?? null;
  }
  /** Approval tier for this employee. Returns 'standard' if not set. */
  async getEmployeeApprovalTier(employeeId: string): Promise<"standard" | "three_step"> {
    const r = await this.sql`SELECT leave_approval_tier FROM employees WHERE id=${employeeId}` as any[];
    return (r[0]?.leave_approval_tier === "three_step") ? "three_step" : "standard";
  }
  /** Manager's manager: returns `manager_id` (and optional `manager_email`) for the given manager employee. */
  async getManagersManager(managerEmployeeId: string) {
    const r = await this.sql`SELECT manager_id, manager_email FROM employees WHERE id=${managerEmployeeId}` as any[];
    return r[0] ?? null;
  }
  /** Approvers for the next pending step of a request (used for step-by-step email). */
  async getNextPendingApprovers(requestId: string): Promise<{ approver_id: string; approver_role: string; step_order: number }[]> {
    const rows = await this.sql`
      SELECT approver_id, approver_role, step_order
      FROM leave_approvals
      WHERE leave_request_id = ${requestId} AND status = 'pending'
      ORDER BY step_order ASC
      LIMIT 10
    ` as any[];
    if (!rows.length) return [];
    const minStep = rows[0].step_order as number;
    return rows.filter((r: any) => r.step_order === minStep);
  }
  // Only role='hr' — admins must not appear as HR-step approvers.
  // Admin who is also a reporting manager already enters the chain as a "manager" step (via emp.manager_id), not here.
  async getHrAdminUsers(excludeEmployeeId: string) { return this.sql`SELECT u.employee_id,u.id as user_id,u.role FROM users u INNER JOIN employees e ON e.id=u.employee_id WHERE u.role = 'hr' AND u.is_active=true AND u.employee_id IS NOT NULL AND u.employee_id!=${excludeEmployeeId} LIMIT 1` as Promise<any[]>; }
  async getHrUsers() { return this.sql`SELECT u.id,u.email,u.role,u.employee_id FROM users u WHERE u.role = 'hr' AND u.is_active=true LIMIT 5` as Promise<any[]>; }
  async verifyEmployee(id: string) { const r = await this.sql`SELECT id FROM employees WHERE id=${id}` as any[]; return r[0]??null; }
  async verifyEmployees(ids: string[]) { return this.sql`SELECT id FROM employees WHERE id=ANY(${ids})` as Promise<any[]>; }
  async getEmployeeByEmail(email: string) { const r = await this.sql`SELECT id FROM employees WHERE (work_email=${email} OR personal_email=${email}) AND id!=${email} LIMIT 1` as any[]; return r[0]??null; }
  async updateUserEmployeeId(userId: string, employeeId: string) { await this.sql`UPDATE users SET employee_id=${employeeId} WHERE id=${userId}`; }
  async createSystemEmployee(email: string, role: string) {
    const empCode=`SYS-${role.toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const emailPart=(email||"").split("@")[0]||role; const firstName=emailPart.charAt(0).toUpperCase()+emailPart.slice(1).toLowerCase();
    const r = await this.sql`INSERT INTO employees(employee_id,work_email,first_name,last_name,job_title,department,employment_status,join_date) VALUES(${empCode},${email},${firstName},${role==="admin"?"Administrator":"HR"},${role==="admin"?"System Administrator":"HR Manager"},'Human Resources','active',NOW()) RETURNING id` as any[];
    return r[0]??null;
  }
  async checkManagerIsEmployee(employeeId: string) { const r = await this.sql`SELECT manager_id FROM employees WHERE id=${employeeId}` as any[]; return r[0]??null; }
  async isInNoticePeriod(employeeId: string) { const r = await this.sql`SELECT id FROM offboarding_records WHERE employee_id=${employeeId} AND status IN('initiated','in_notice')` as any[]; return r.length>0; }
  async isManagerOf(managerId: string, employeeId: string) { const r = await this.sql`SELECT id FROM employees WHERE id=${employeeId} AND manager_id=${managerId}` as any[]; return r.length>0; }
  async getEmployeesByEmail(email: string) { return this.sql`SELECT id FROM employees WHERE LOWER(work_email)=${email} LIMIT 1` as Promise<any[]>; }
  /** Match FreshTeam `official_email` to our employee (work or personal). */
  async getEmployeeIdByEmailForFtSync(email: string) {
    const e = email.trim().toLowerCase();
    if (!e) return [] as any[];
    return this.sql`SELECT id FROM employees WHERE LOWER(work_email)=${e} OR LOWER(TRIM(COALESCE(personal_email,'')))=${e} LIMIT 1` as Promise<any[]>;
  }
  /** Join dates for a set of employee IDs (for EL accrual calculation during sync). */
  async getEmployeeJoinDates(employeeIds: string[]) { if (!employeeIds.length) return []; return this.sql`SELECT id, join_date FROM employees WHERE id=ANY(${employeeIds})` as unknown as Promise<{ id: string; join_date: string | null }[]>; }

  // ── FreshTeam sync ─────────────────────────────────────────────────────────────
  async syncFtBalance(employeeId: string, leaveTypeId: string, balance: number, used: number, isEarnedLeave?: boolean) {
    const r = await this.sql`SELECT id FROM employee_leave_balances WHERE employee_id=${employeeId} AND leave_type_id=${leaveTypeId} LIMIT 1` as any[];
    if (r[0]) {
      if (isEarnedLeave) await this.sql`UPDATE employee_leave_balances SET balance=${String(balance)},used=${String(used)},last_accrual_at=NOW(),updated_at=NOW() WHERE id=${r[0].id}`;
      else await this.sql`UPDATE employee_leave_balances SET balance=${String(balance)},used=${String(used)},updated_at=NOW() WHERE id=${r[0].id}`;
    } else {
      if (isEarnedLeave) await this.sql`INSERT INTO employee_leave_balances(employee_id,leave_type_id,balance,used,last_accrual_at) VALUES(${employeeId},${leaveTypeId},${String(balance)},${String(used)},NOW()) ON CONFLICT (employee_id, leave_type_id) DO UPDATE SET balance = EXCLUDED.balance, used = EXCLUDED.used, last_accrual_at = EXCLUDED.last_accrual_at, updated_at = NOW()`;
      else await this.sql`INSERT INTO employee_leave_balances(employee_id,leave_type_id,balance,used) VALUES(${employeeId},${leaveTypeId},${String(balance)},${String(used)}) ON CONFLICT (employee_id, leave_type_id) DO UPDATE SET balance = EXCLUDED.balance, used = EXCLUDED.used, updated_at = NOW()`;
    }
  }
}

import { BaseRepository } from "../../core/base/BaseRepository.js";
import { ConflictError } from "../../core/types/index.js";
import { normalizeCountryToIso } from "../../lib/countryNormalize.js";
import { appendEffectiveRegionFilter, sqlEmployeeEffectiveRegion } from "../../lib/employeeRegionSql.js";

export type AttendanceLegalAuditAction = "create" | "update" | "auto_checkout" | "manual_edit";

export class AttendanceRepository extends BaseRepository {
  // ── Shifts ────────────────────────────────────────────────────────────────
  async listShifts() {
    return this.sql`
      SELECT s.*, (SELECT count(*)::int FROM employee_shifts es WHERE es.shift_id = s.id AND (es.effective_to IS NULL OR es.effective_to >= CURRENT_DATE)) as active_employees
      FROM shifts s ORDER BY s.name
    ` as Promise<any[]>;
  }
  async createShift(d: any) {
    const rows = await this.sql`INSERT INTO shifts(name,start_time,end_time,grace_minutes,weekly_pattern,is_active) VALUES(${d.name},${d.startTime},${d.endTime},${d.graceMinutes??15},${JSON.stringify(d.weeklyPattern??[true,true,true,true,true,false,false])},${d.isActive??true}) RETURNING *` as any[];
    return rows[0];
  }
  async updateShift(id: string, d: any) {
    const rows = await this.sql`UPDATE shifts SET name=COALESCE(${d.name??null},name),start_time=COALESCE(${d.startTime??null},start_time),end_time=COALESCE(${d.endTime??null},end_time),grace_minutes=COALESCE(${d.graceMinutes??null},grace_minutes),weekly_pattern=COALESCE(${d.weeklyPattern?JSON.stringify(d.weeklyPattern):null},weekly_pattern),is_active=COALESCE(${d.isActive??null},is_active),updated_at=NOW() WHERE id=${id} RETURNING *` as any[];
    return rows[0] ?? null;
  }
  async deleteShift(id: string) { await this.sql`DELETE FROM shifts WHERE id=${id}`; }

  // ── Employee Shifts ───────────────────────────────────────────────────────
  async listEmployeeShifts(regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    if (regions == null) {
      return this.sql`
        SELECT es.*, s.name as shift_name, s.start_time, s.end_time, e.first_name, e.last_name, e.employee_id as emp_code, e.department
        FROM employee_shifts es
        JOIN shifts s ON s.id = es.shift_id
        JOIN employees e ON e.id = es.employee_id
        ORDER BY es.effective_from DESC
      ` as Promise<any[]>;
    }
    const regionExpr = sqlEmployeeEffectiveRegion("e", "b");
    return this.sql(`
      SELECT es.*, s.name as shift_name, s.start_time, s.end_time, e.first_name, e.last_name, e.employee_id as emp_code, e.department
      FROM employee_shifts es
      JOIN shifts s ON s.id = es.shift_id
      JOIN employees e ON e.id = es.employee_id
      LEFT JOIN branches b ON b.id = e.branch_id
      WHERE ${regionExpr} = ANY($1)
      ORDER BY es.effective_from DESC
    `, [regions]) as Promise<any[]>;
  }
  async getEmployeeById(id: string) { const r = await this.sql`SELECT id FROM employees WHERE id=${id}` as any[]; return r[0]??null; }
  async endOverlappingAssignments(employeeId: string, effectiveFrom: string) { await this.sql`UPDATE employee_shifts SET effective_to=${effectiveFrom} WHERE employee_id=${employeeId} AND (effective_to IS NULL OR effective_to >= ${effectiveFrom})`; }
  async createEmployeeShift(employeeId: string, shiftId: string, effectiveFrom: string, effectiveTo: string|null, useShiftOverride = false) {
    const rows = await this.sql`INSERT INTO employee_shifts(employee_id,shift_id,effective_from,effective_to,use_shift_override) VALUES(${employeeId},${shiftId},${effectiveFrom},${effectiveTo},${useShiftOverride}) RETURNING *` as any[];
    return rows[0];
  }
  async deleteEmployeeShift(id: string) { await this.sql`DELETE FROM employee_shifts WHERE id=${id}`; }
  async getEmployeeShiftById(id: string) {
    const rows = await this.sql`SELECT id, employee_id FROM employee_shifts WHERE id = ${id}` as { id: string; employee_id: string }[];
    return rows[0] ?? null;
  }

  async getShiftAssignmentForEmployee(employeeId: string, dateStr: string) {
    const rows = await this.sql`
      SELECT es.use_shift_override, s.start_time, s.end_time, s.grace_minutes, s.weekly_pattern
      FROM employee_shifts es
      JOIN shifts s ON s.id = es.shift_id
      WHERE es.employee_id = ${employeeId}
        AND es.effective_from <= ${dateStr}
        AND (es.effective_to IS NULL OR es.effective_to >= ${dateStr})
        AND s.is_active = true
      ORDER BY es.effective_from DESC
      LIMIT 1
    ` as any[];
    return rows[0] ?? null;
  }

  async getShiftForEmployee(employeeId: string, dateStr: string) {
    const rows = await this.sql`SELECT s.* FROM employee_shifts es JOIN shifts s ON s.id=es.shift_id WHERE es.employee_id=${employeeId} AND es.effective_from<=${dateStr} AND (es.effective_to IS NULL OR es.effective_to>=${dateStr}) AND s.is_active=true ORDER BY es.effective_from DESC LIMIT 1` as any[];
    return rows[0] ?? null;
  }

  // ── Leave (existing leave_requests) ──────────────────────────────────────
  /** Approved leave covering workDate; day_type full | half */
  async getApprovedLeaveForDate(employeeId: string, workDate: string): Promise<{ dayType: "full" | "half" } | null> {
    const rows = await this.sql`
      SELECT day_type FROM leave_requests
      WHERE employee_id = ${employeeId}
        AND status = 'approved'
        AND ${workDate}::date >= start_date
        AND ${workDate}::date <= end_date
      ORDER BY updated_at DESC NULLS LAST, applied_at DESC
      LIMIT 1
    ` as { day_type: string }[];
    const dt = rows[0]?.day_type;
    if (dt === "half") return { dayType: "half" };
    if (dt === "full") return { dayType: "full" };
    return null;
  }

  // ── Attendance Records ───────────────────────────────────────────────────
  async getTodayRecord(employeeId: string, today: string) {
    const r = await this.sql`
      SELECT id, check_in_time, check_out_time, policy_snapshot
      FROM attendance_records
      WHERE employee_id = ${employeeId} AND date = ${today} AND deleted_at IS NULL
    ` as any[];
    return r[0] ?? null;
  }

  async getEmployeeInfo(employeeId: string) {
    const r = await this.sql`SELECT employment_status,exit_date,join_date FROM employees WHERE id=${employeeId}` as any[];
    return r[0] ?? null;
  }

  async getEmployeeCountryCode(employeeId: string): Promise<string | null> {
    const r = await this.sql`
      SELECT NULLIF(trim(country), '') AS cc, NULLIF(trim(comm_country), '') AS cc2
      FROM employees WHERE id = ${employeeId}
    ` as { cc: string | null; cc2: string | null }[];
    const raw = r[0]?.cc || r[0]?.cc2;
    return normalizeCountryToIso(raw ?? null);
  }

  /**
   * Concurrency-safe check-in: advisory lock + SELECT FOR UPDATE + INSERT.
   * Requires migration 0081 (partial unique index + deleted_at).
   */
  async checkInTransactional(params: {
    employeeId: string;
    workDate: string;
    now: Date;
    status: string;
    createdBy: string;
    policySnapshot: Record<string, unknown>;
  }): Promise<any> {
    const snapJson = JSON.stringify(params.policySnapshot);
    try {
      const ins = await this.sql`
        INSERT INTO attendance_records(employee_id,date,check_in_time,source,status,created_by,policy_snapshot)
        VALUES(
          ${params.employeeId},
          ${params.workDate}::date,
          ${params.now.toISOString()}::timestamptz,
          'web',
          ${params.status},
          ${params.createdBy},
          ${snapJson}::jsonb
        )
        ON CONFLICT (employee_id, date) WHERE deleted_at IS NULL
        DO NOTHING
        RETURNING *
      ` as any[];
      if (ins[0]) return ins[0];

      const existing = await this.sql`
        SELECT id, check_in_time, check_out_time
        FROM attendance_records
        WHERE employee_id = ${params.employeeId}
          AND date = ${params.workDate}::date
          AND deleted_at IS NULL
        LIMIT 1
      ` as any[];
      const ex = existing[0];
      if (ex?.check_in_time && !ex?.check_out_time) throw new ConflictError("Already checked in");
      throw new ConflictError("Attendance already recorded for this date");
    } catch (e: any) {
      if (e?.code === "23505") throw new ConflictError("Attendance already recorded for this date");
      throw e;
    }
  }

  /** Legacy path — prefer checkInTransactional */
  async createCheckIn(
    employeeId: string,
    today: string,
    now: Date,
    status: string,
    createdBy: string,
    policySnapshot: Record<string, unknown>
  ) {
    return this.checkInTransactional({ employeeId, workDate: today, now, status, createdBy, policySnapshot });
  }

  async updateCheckOut(
    recordId: string,
    now: Date,
    status: string,
    opts?: { isAuto?: boolean; missedCheckout?: boolean }
  ) {
    const isAuto = opts?.isAuto === true;
    const missed = opts?.missedCheckout === true;
    const rows = await this.sql`
      UPDATE attendance_records SET
        check_out_time = ${now.toISOString()},
        status = ${status},
        is_auto_checkout = ${isAuto},
        missed_checkout = ${missed},
        auto_checkout_at = ${isAuto ? new Date().toISOString() : null},
        updated_at = NOW()
      WHERE id = ${recordId} AND deleted_at IS NULL
      RETURNING *
    ` as any[];
    await this.logAudit(recordId, "update", null, isAuto ? "Auto check-out" : "Web check-out");
    return rows[0];
  }

  async listRecords(filters: {
    employeeId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    limit: number;
    offset: number;
    regions?: string[] | null;
  }) {
    const { employeeId, startDate, endDate, status, limit, offset, regions } = filters;
    const params: unknown[] = [];
    const conds: string[] = ["ar.deleted_at IS NULL"];
    if (employeeId) { params.push(employeeId); conds.push(`ar.employee_id=$${params.length}`); }
    if (startDate) { params.push(startDate); conds.push(`ar.date>=$${params.length}`); }
    if (endDate) { params.push(endDate); conds.push(`ar.date<=$${params.length}`); }
    if (status) { params.push(status); conds.push(`ar.status=$${params.length}`); }
    this.appendEmployeeRegionFilter(regions, "e", conds, params);
    params.push(limit, offset);
    return this.sql(
      `SELECT ar.*,e.first_name,e.last_name,e.nickname,e.employee_id as emp_code,e.department FROM attendance_records ar JOIN employees e ON e.id=ar.employee_id LEFT JOIN branches b ON b.id=e.branch_id WHERE ${conds.join(" AND ")} ORDER BY ar.date DESC,ar.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params as any[]
    ) as Promise<any[]>;
  }

  private appendEmployeeRegionFilter(
    regions: string[] | null | undefined,
    employeeAlias: string,
    conds: string[],
    params: unknown[],
  ): void {
    appendEffectiveRegionFilter(regions, employeeAlias, "b", conds, params);
  }

  async manualUpsert(employeeId: string, date: string, data: any, userId: string) {
    const existing = await this.sql`
      SELECT id FROM attendance_records
      WHERE employee_id = ${employeeId} AND date = ${date} AND deleted_at IS NULL
    ` as any[];
    const status = data.status || "present";
    const remarks = data.remarks ?? data.notes ?? null;
    const auditReason = remarks || "Manual entry";
    const snap = data.policySnapshot != null ? JSON.stringify(data.policySnapshot) : null;
    if (existing.length > 0) {
      const rows = snap
        ? await this.sql`
            UPDATE attendance_records SET
              check_in_time = ${data.checkInTime||null},
              check_out_time = ${data.checkOutTime||null},
              status = ${status},
              source = 'manual',
              remarks = ${remarks},
              policy_snapshot = COALESCE(${snap}::jsonb, policy_snapshot),
              updated_at = NOW()
            WHERE id = ${existing[0].id} RETURNING *
          ` as any[]
        : await this.sql`UPDATE attendance_records SET check_in_time=${data.checkInTime||null},check_out_time=${data.checkOutTime||null},status=${status},source='manual',remarks=${remarks},updated_at=NOW() WHERE id=${existing[0].id} RETURNING *` as any[];
      await this.logAudit(existing[0].id, "update", userId, auditReason);
      return rows[0];
    }
    const rows = snap
      ? await this.sql`
          INSERT INTO attendance_records(employee_id,date,check_in_time,check_out_time,source,status,remarks,created_by,policy_snapshot)
          VALUES(${employeeId},${date},${data.checkInTime||null},${data.checkOutTime||null},'manual',${status},${remarks},${userId},${snap}::jsonb)
          RETURNING *
        ` as any[]
      : await this.sql`INSERT INTO attendance_records(employee_id,date,check_in_time,check_out_time,source,status,remarks,created_by) VALUES(${employeeId},${date},${data.checkInTime||null},${data.checkOutTime||null},'manual',${status},${remarks},${userId}) RETURNING *` as any[];
    await this.logAudit(rows[0].id, "create", userId, auditReason);
    return rows[0];
  }

  async logAudit(attendanceId: string, action: string, performedBy: string|null, reason?: string, changes?: any) {
    await this.sql`INSERT INTO attendance_audit(attendance_id,action,performed_by,reason,changes) VALUES(${attendanceId},${action},${performedBy},${reason||null},${changes?JSON.stringify(changes):null})`;
  }
  async listAudit(attendanceId: string) {
    return this.sql`SELECT * FROM attendance_audit WHERE attendance_id=${attendanceId} ORDER BY created_at ASC` as Promise<any[]>;
  }

  async insertAttendanceAuditLog(entry: {
    attendanceId: string;
    action: AttendanceLegalAuditAction;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
    changedByUserId: string | null;
  }) {
    const oldJ = entry.oldValue ? JSON.stringify(entry.oldValue) : null;
    const newJ = entry.newValue ? JSON.stringify(entry.newValue) : null;
    const act = entry.action;
    await this.sql`
      INSERT INTO attendance_audit_logs (attendance_id, action, old_value, new_value, changed_by_user_id)
      VALUES (
        ${entry.attendanceId},
        ${act},
        ${oldJ}::jsonb,
        ${newJ}::jsonb,
        ${entry.changedByUserId}
      )
    `;
  }

  /** Approved leave rows overlapping a date range (expand to days in service). */
  async listApprovedLeaveSpansOverlapping(from: string, to: string) {
    const rows = await this.sql`
      SELECT employee_id, start_date, end_date, day_type
      FROM leave_requests
      WHERE status = 'approved'
        AND end_date >= ${from}::date
        AND start_date <= ${to}::date
    `;
    return rows as { employee_id: string; start_date: string; end_date: string; day_type: string }[];
  }

  async listAttendanceAuditLogs(attendanceId: string) {
    return this.sql`
      SELECT * FROM attendance_audit_logs
      WHERE attendance_id = ${attendanceId}
      ORDER BY created_at ASC
    ` as Promise<any[]>;
  }

  // ── Frontend-facing ───────────────────────────────────────────────────────
  async getTodayWithShift(employeeId: string, today: string) {
    const rows = await this.sql`
      SELECT ar.*, s.name as shift_name, s.start_time as shift_start, s.end_time as shift_end, s.grace_minutes
      FROM attendance_records ar
      LEFT JOIN employee_shifts es ON es.employee_id = ar.employee_id AND es.effective_from <= ${today} AND (es.effective_to IS NULL OR es.effective_to >= ${today})
      LEFT JOIN shifts s ON s.id = es.shift_id AND s.is_active = true
      WHERE ar.employee_id = ${employeeId} AND ar.date = ${today} AND ar.deleted_at IS NULL
      LIMIT 1
    ` as any[];
    return rows[0] ?? null;
  }

  async getStats(today: string, regions?: string[] | null) {
    if (regions != null && regions.length === 0) {
      return { today, present: 0, late: 0, absent: 0, totalEmployees: 0 };
    }

    const regionExpr = sqlEmployeeEffectiveRegion("e", "b");
    const regionCond =
      regions == null
        ? ""
        : ` AND ${regionExpr} = ANY($2)`;
    const regionParams = regions == null ? [today] : [today, regions];
    const branchJoin = regions == null ? "" : " LEFT JOIN branches b ON b.id = e.branch_id";

    const [presentRow] = (await this.sql(
      `SELECT count(*)::int as c FROM attendance_records ar
       JOIN employees e ON e.id = ar.employee_id${branchJoin}
       WHERE ar.date = $1 AND ar.deleted_at IS NULL
         AND ar.status IN ('present','late','half_day','short_hours','holiday')${regionCond}`,
      regionParams as any[],
    )) as any[];
    const [lateRow] = (await this.sql(
      `SELECT count(*)::int as c FROM attendance_records ar
       JOIN employees e ON e.id = ar.employee_id${branchJoin}
       WHERE ar.date = $1 AND ar.deleted_at IS NULL AND ar.status = 'late'${regionCond}`,
      regionParams as any[],
    )) as any[];
    const absentQuery =
      regions == null
        ? `SELECT count(*)::int as c FROM employees e
           WHERE e.employment_status = 'active'
             AND e.id NOT IN (
               SELECT employee_id FROM attendance_records
               WHERE date = $1 AND deleted_at IS NULL
             )`
        : `SELECT count(*)::int as c FROM employees e
           LEFT JOIN branches b ON b.id = e.branch_id
           WHERE e.employment_status = 'active'
             AND ${regionExpr} = ANY($2)
             AND e.id NOT IN (
               SELECT ar.employee_id FROM attendance_records ar
               WHERE ar.date = $1 AND ar.deleted_at IS NULL
             )`;
    const [absentRow] = (await this.sql(absentQuery, regionParams as any[])) as any[];
    const totalQuery =
      regions == null
        ? `SELECT count(*)::int as c FROM employees WHERE employment_status = 'active'`
        : `SELECT count(*)::int as c FROM employees e
           LEFT JOIN branches b ON b.id = e.branch_id
           WHERE e.employment_status = 'active'
             AND ${regionExpr} = ANY($1)`;
    const totalParams = regions == null ? [] : [regions];
    const [totalRow] = (await this.sql(totalQuery, totalParams as any[])) as any[];
    return { today, present: presentRow?.c ?? 0, late: lateRow?.c ?? 0, absent: absentRow?.c ?? 0, totalEmployees: totalRow?.c ?? 0 };
  }

  async getEmployeeRecords(employeeId: string, from: string, to: string) {
    return this.sql`
      SELECT ar.*, e.first_name, e.last_name, e.nickname, e.employee_id as emp_code, e.department,
        s.name as shift_name, s.start_time as shift_start, s.end_time as shift_end, s.grace_minutes
      FROM attendance_records ar
      JOIN employees e ON e.id = ar.employee_id
      LEFT JOIN employee_shifts es ON es.employee_id = ar.employee_id AND es.effective_from <= ar.date AND (es.effective_to IS NULL OR es.effective_to >= ar.date)
      LEFT JOIN shifts s ON s.id = es.shift_id
      WHERE ar.employee_id = ${employeeId} AND ar.date >= ${from} AND ar.date <= ${to} AND ar.deleted_at IS NULL
      ORDER BY ar.date DESC
    ` as Promise<any[]>;
  }

  async getReport(from: string, to: string, department?: string, regions?: string[] | null) {
    let query = `
      SELECT ar.*, e.first_name, e.last_name, e.nickname, e.employee_id as emp_code, e.department,
        s.name as shift_name, s.start_time as shift_start, s.end_time as shift_end, s.grace_minutes
      FROM attendance_records ar
      JOIN employees e ON e.id = ar.employee_id
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN employee_shifts es ON es.employee_id = ar.employee_id AND es.effective_from <= ar.date AND (es.effective_to IS NULL OR es.effective_to >= ar.date)
      LEFT JOIN shifts s ON s.id = es.shift_id
      WHERE ar.date >= $1 AND ar.date <= $2 AND ar.deleted_at IS NULL
    `;
    const params: unknown[] = [from, to];
    const conds: string[] = [];
    this.appendEmployeeRegionFilter(regions, "e", conds, params);
    if (conds.length) query += ` AND ${conds.join(" AND ")}`;
    if (department) { params.push(department); query += ` AND e.department = $${params.length}`; }
    query += ` ORDER BY ar.date DESC, e.first_name`;
    return this.sql(query, params as any[]) as Promise<any[]>;
  }

  async getRecordById(id: string) {
    const rows = await this.sql`SELECT * FROM attendance_records WHERE id = ${id} AND deleted_at IS NULL` as any[];
    return rows[0] ?? null;
  }

  async getActiveRecordByEmployeeAndDate(employeeId: string, date: string) {
    const rows = await this.sql`
      SELECT * FROM attendance_records
      WHERE employee_id = ${employeeId} AND date = ${date} AND deleted_at IS NULL
      LIMIT 1
    ` as any[];
    return rows[0] ?? null;
  }

  async getRecordByIdIncludingDeleted(id: string) {
    const rows = await this.sql`SELECT * FROM attendance_records WHERE id = ${id}` as any[];
    return rows[0] ?? null;
  }

  async updateRecord(id: string, data: { checkInTime?: string | null; checkOutTime?: string | null; remarks?: string | null }, status: string, performedBy?: string | null, reason?: string, previous?: any) {
    const rows = await this.sql`
      UPDATE attendance_records SET
        check_in_time = COALESCE(${data.checkInTime ?? null}, check_in_time),
        check_out_time = COALESCE(${data.checkOutTime ?? null}, check_out_time),
        remarks = COALESCE(${data.remarks ?? null}, remarks),
        status = ${status},
        missed_checkout = false,
        updated_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL RETURNING *
    ` as any[];
    if (rows[0] && (performedBy != null || reason != null)) await this.logAudit(id, "update", performedBy ?? null, reason, previous ? { check_in_time: [previous.check_in_time, data.checkInTime], check_out_time: [previous.check_out_time, data.checkOutTime], status: [previous.status, status] } : undefined);
    return rows[0] ?? null;
  }

  async softDeleteRecord(id: string, deletedByUserId: string) {
    const rows = await this.sql`
      UPDATE attendance_records SET
        deleted_at = NOW(),
        deleted_by_user_id = ${deletedByUserId},
        updated_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING *
    ` as any[];
    return rows[0] ?? null;
  }

  async restoreAttendanceRecord(id: string) {
    const rows = await this.sql`
      UPDATE attendance_records SET
        deleted_at = NULL,
        deleted_by_user_id = NULL,
        updated_at = NOW()
      WHERE id = ${id} AND deleted_at IS NOT NULL
      RETURNING *
    ` as any[];
    return rows[0] ?? null;
  }

  /** @deprecated Use softDeleteRecord */
  async deleteRecord(id: string) {
    await this.sql`UPDATE attendance_records SET deleted_at = NOW() WHERE id = ${id}`;
  }

  async getDailySummary(date: string, regions?: string[] | null) {
    if (regions != null && regions.length === 0) return [];
    const regionExpr = sqlEmployeeEffectiveRegion("e", "b");
    if (regions == null) {
      const rows = await this.sql`
        SELECT ar.id, ar.employee_id, ar.date, ar.check_in_time, ar.check_out_time, ar.status, ar.remarks,
          e.first_name, e.last_name, e.nickname, e.employee_id as emp_code, e.department
        FROM attendance_records ar
        JOIN employees e ON e.id = ar.employee_id
        WHERE ar.date = ${date} AND ar.deleted_at IS NULL
        ORDER BY e.department NULLS LAST, e.last_name, e.first_name
      ` as any[];
      return rows;
    }
    const rows = await this.sql(`
      SELECT ar.id, ar.employee_id, ar.date, ar.check_in_time, ar.check_out_time, ar.status, ar.remarks,
        e.first_name, e.last_name, e.nickname, e.employee_id as emp_code, e.department
      FROM attendance_records ar
      JOIN employees e ON e.id = ar.employee_id
      LEFT JOIN branches b ON b.id = e.branch_id
      WHERE ar.date = $1 AND ar.deleted_at IS NULL
        AND ${regionExpr} = ANY($2)
      ORDER BY e.department NULLS LAST, e.last_name, e.first_name
    `, [date, regions]) as any[];
    return rows;
  }

  async listOpenAttendanceRecords(limit = 2000) {
    return this.sql`
      SELECT ar.id, ar.employee_id, ar.date, ar.check_in_time, ar.check_out_time, ar.policy_snapshot
      FROM attendance_records ar
      WHERE ar.check_in_time IS NOT NULL AND ar.check_out_time IS NULL AND ar.deleted_at IS NULL
      ORDER BY ar.check_in_time ASC
      LIMIT ${limit}
    ` as Promise<any[]>;
  }

  /** Calendar dates (YYYY-MM-DD) from Leave Settings in an inclusive range. */
  async listLeaveHolidayDatesBetween(from: string, to: string): Promise<string[]> {
    const rows = await this.sql`
      SELECT date FROM leave_holidays
      WHERE date >= ${from}::date AND date <= ${to}::date
      ORDER BY date
    ` as { date: string | Date }[];
    return rows.map((r) => {
      const raw = r.date;
      if (raw instanceof Date) return raw.toISOString().slice(0, 10);
      return String(raw).slice(0, 10);
    });
  }

  async isHolidayForDate(workDate: string, employeeCountryCode: string | null): Promise<boolean> {
    // leave_holidays is the primary table managed from Leave Settings.
    // Any holiday added there is company-wide and takes precedence.
    const leaveHol = await this.sql`
      SELECT 1 FROM leave_holidays WHERE date = ${workDate}::date LIMIT 1
    ` as any[];
    if (leaveHol.length > 0) return true;

    // Also check org_holidays (attendance-module managed, supports per-country filtering).
    const cc = employeeCountryCode?.trim().toUpperCase().slice(0, 2) || null;
    if (cc) {
      const rows = await this.sql`
        SELECT 1 FROM org_holidays
        WHERE holiday_date = ${workDate}::date
          AND (country_code IS NULL OR upper(trim(country_code)) = ${cc})
        LIMIT 1
      ` as any[];
      return rows.length > 0;
    }
    const rows = await this.sql`
      SELECT 1 FROM org_holidays
      WHERE holiday_date = ${workDate}::date AND country_code IS NULL
      LIMIT 1
    ` as any[];
    return rows.length > 0;
  }

  async listOrgHolidays(from?: string, to?: string) {
    if (from && to) {
      return this.sql`
        SELECT id, holiday_date, country_code, name FROM org_holidays
        WHERE holiday_date >= ${from}::date AND holiday_date <= ${to}::date
        ORDER BY holiday_date, country_code NULLS FIRST
      ` as Promise<any[]>;
    }
    return this.sql`SELECT id, holiday_date, country_code, name FROM org_holidays ORDER BY holiday_date DESC LIMIT 500` as Promise<any[]>;
  }

  async insertOrgHoliday(d: { holidayDate: string; countryCode: string | null; name: string }) {
    const rows = await this.sql`
      INSERT INTO org_holidays (holiday_date, country_code, name)
      VALUES (${d.holidayDate}::date, ${d.countryCode?.trim().toUpperCase().slice(0, 2) || null}, ${d.name})
      RETURNING *
    ` as any[];
    return rows[0];
  }

  async deleteOrgHoliday(id: string) {
    await this.sql`DELETE FROM org_holidays WHERE id = ${id}`;
  }

  async getOrgTimesheetPolicy() {
    const rows = await this.sql`SELECT * FROM org_timesheet_policy WHERE id = 1` as any[];
    return rows[0] ?? null;
  }

  async ensureOrgTimesheetPolicyRow() {
    await this.sql`
      INSERT INTO org_timesheet_policy (id) VALUES (1)
      ON CONFLICT (id) DO NOTHING
    `;
  }

  async updateOrgTimesheetPolicy(d: {
    policyTimezone: string | null;
    workDayStart: string;
    workDayEnd: string;
    graceMinutes: number;
    halfDayThresholdPercent: number;
    workingDays?: number[];
    checkinWindowStartOffsetMinutes?: number;
    checkinWindowEndOffsetMinutes?: number;
    minOvertimeMinutes?: number;
    overtimeRequiresApproval?: boolean;
    autoCheckoutBufferMinutes?: number;
  }, userId: string | null) {
    const workingDays = d.workingDays ?? [1, 2, 3, 4, 5];
    const ws = d.checkinWindowStartOffsetMinutes ?? -120;
    const we = d.checkinWindowEndOffsetMinutes ?? 240;
    const minOt = d.minOvertimeMinutes ?? 0;
    const otAppr = d.overtimeRequiresApproval ?? false;
    const autoBuf = d.autoCheckoutBufferMinutes ?? 60;
    await this.sql`
      UPDATE org_timesheet_policy SET
        policy_timezone = ${d.policyTimezone},
        work_day_start = ${d.workDayStart}::time,
        work_day_end = ${d.workDayEnd}::time,
        grace_minutes = ${d.graceMinutes},
        half_day_threshold_percent = ${d.halfDayThresholdPercent},
        working_days = ${workingDays}::integer[],
        checkin_window_start_offset_minutes = ${ws},
        checkin_window_end_offset_minutes = ${we},
        min_overtime_minutes = ${minOt},
        overtime_requires_approval = ${otAppr},
        auto_checkout_buffer_minutes = ${autoBuf},
        updated_at = NOW(),
        updated_by_user_id = ${userId}
      WHERE id = 1
    `;
  }

  /**
   * Claim idempotent send slot for HR missing check-in digest (one send per work_date org-wide).
   * @returns true if this call inserted the row (caller should send); false if already sent.
   */
  async tryClaimMissingCheckInHrAlertSent(workDate: string): Promise<boolean> {
    const rows = await this.sql`
      INSERT INTO attendance_hr_missing_checkin_sent (work_date)
      VALUES (${workDate}::date)
      ON CONFLICT (work_date) DO NOTHING
      RETURNING work_date
    ` as { work_date: string }[];
    return rows.length > 0;
  }

  // ── Check-in reminder settings ──────────────────────────────────────────

  async listCheckinReminders() {
    return this.sql`
      SELECT id, send_time, enabled, notify_hr, notify_employee, label, sort_order, branch_ids, created_at, updated_at
      FROM checkin_reminder_settings
      ORDER BY sort_order ASC, send_time ASC
    ` as unknown as Promise<{
      id: string; send_time: string; enabled: boolean;
      notify_hr: boolean; notify_employee: boolean;
      label: string | null; sort_order: number;
      branch_ids: string[] | null;
      created_at: string; updated_at: string;
    }[]>;
  }

  async upsertCheckinReminder(d: {
    id?: string | null;
    sendTime: string;
    enabled: boolean;
    notifyHr: boolean;
    notifyEmployee: boolean;
    label?: string | null;
    sortOrder?: number;
    branchIds?: string[] | null | undefined;
  }) {
    const branchIdsJson =
      d.branchIds === undefined
        ? undefined
        : d.branchIds && d.branchIds.length > 0
          ? JSON.stringify(d.branchIds)
          : null;

    if (d.id) {
      const rows =
        branchIdsJson === undefined
          ? await this.sql`
              UPDATE checkin_reminder_settings SET
                send_time       = ${d.sendTime}::time,
                enabled         = ${d.enabled},
                notify_hr       = ${d.notifyHr},
                notify_employee = ${d.notifyEmployee},
                label           = ${d.label ?? null},
                sort_order      = ${d.sortOrder ?? 0},
                updated_at      = NOW()
              WHERE id = ${d.id}
              RETURNING *
            `
          : await this.sql`
              UPDATE checkin_reminder_settings SET
                send_time       = ${d.sendTime}::time,
                enabled         = ${d.enabled},
                notify_hr       = ${d.notifyHr},
                notify_employee = ${d.notifyEmployee},
                label           = ${d.label ?? null},
                sort_order      = ${d.sortOrder ?? 0},
                branch_ids      = ${branchIdsJson}::jsonb,
                updated_at      = NOW()
              WHERE id = ${d.id}
              RETURNING *
            `;
      return (rows as any[])[0] ?? null;
    }
    const rows = await this.sql`
      INSERT INTO checkin_reminder_settings (send_time, enabled, notify_hr, notify_employee, label, sort_order, branch_ids)
      VALUES (${d.sendTime}::time, ${d.enabled}, ${d.notifyHr}, ${d.notifyEmployee}, ${d.label ?? null}, ${d.sortOrder ?? 0}, ${branchIdsJson}::jsonb)
      RETURNING *
    ` as any[];
    return rows[0];
  }

  async deleteCheckinReminder(id: string) {
    await this.sql`DELETE FROM checkin_reminder_settings WHERE id = ${id}`;
  }

  /** Try to claim send slot; returns true if this call should send, false if already sent today. */
  async tryClaimCheckinReminderSent(reminderId: string, workDate: string): Promise<boolean> {
    const rows = await this.sql`
      INSERT INTO checkin_reminder_sent (reminder_id, work_date)
      VALUES (${reminderId}::uuid, ${workDate}::date)
      ON CONFLICT (reminder_id, work_date) DO NOTHING
      RETURNING reminder_id
    ` as { reminder_id: string }[];
    return rows.length > 0;
  }

  /** Active employees with an active user login, no check-in punch today, not on full-day approved leave.
   *  Pass branchIds to restrict to specific branches; null/empty = all branches. */
  async listEmployeesMissingCheckInForHrAlert(
    workDate: string,
    branchIds?: string[] | null,
  ): Promise<
    { employee_id: string; emp_code: string | null; first_name: string | null; last_name: string | null; department: string | null; branch_name: string | null; country_hint: string | null; region_code: string | null }[]
  > {
    const filterByBranch = Array.isArray(branchIds) && branchIds.length > 0;
    const rows = filterByBranch
      ? await this.sql`
          SELECT
            e.id AS employee_id,
            e.employee_id AS emp_code,
            e.first_name,
            e.last_name,
            e.department,
            COALESCE(b.name, e.location) AS branch_name,
            NULLIF(trim(COALESCE(e.country, e.comm_country, '')), '') AS country_hint,
            b.region_code AS region_code
          FROM employees e
          INNER JOIN users u ON u.employee_id = e.id AND u.is_active = true
          LEFT JOIN branches b ON b.id = e.branch_id
          WHERE e.employment_status = 'active'
            AND (
              e.branch_id = ANY(${branchIds}::varchar[])
              OR EXISTS (
                SELECT 1 FROM branches bf
                WHERE bf.id = ANY(${branchIds}::varchar[])
                  AND trim(lower(coalesce(e.location, ''))) = trim(lower(bf.name))
              )
            )
            AND NOT EXISTS (
              SELECT 1 FROM attendance_records ar
              WHERE ar.employee_id = e.id
                AND ar.date = ${workDate}::date
                AND ar.deleted_at IS NULL
                AND ar.check_in_time IS NOT NULL
            )
            AND NOT EXISTS (
              SELECT 1 FROM leave_requests lr
              WHERE lr.employee_id = e.id
                AND lr.status = 'approved'
                AND lr.day_type = 'full'
                AND ${workDate}::date >= lr.start_date
                AND ${workDate}::date <= lr.end_date
            )
          ORDER BY e.department NULLS LAST, e.last_name, e.first_name
        `
      : await this.sql`
          SELECT
            e.id AS employee_id,
            e.employee_id AS emp_code,
            e.first_name,
            e.last_name,
            e.department,
            b.name AS branch_name,
            NULLIF(trim(COALESCE(e.country, e.comm_country, '')), '') AS country_hint,
            b.region_code AS region_code
          FROM employees e
          INNER JOIN users u ON u.employee_id = e.id AND u.is_active = true
          LEFT JOIN branches b ON b.id = e.branch_id
          WHERE e.employment_status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM attendance_records ar
              WHERE ar.employee_id = e.id
                AND ar.date = ${workDate}::date
                AND ar.deleted_at IS NULL
                AND ar.check_in_time IS NOT NULL
            )
            AND NOT EXISTS (
              SELECT 1 FROM leave_requests lr
              WHERE lr.employee_id = e.id
                AND lr.status = 'approved'
                AND lr.day_type = 'full'
                AND ${workDate}::date >= lr.start_date
                AND ${workDate}::date <= lr.end_date
            )
          ORDER BY e.department NULLS LAST, e.last_name, e.first_name
        `;
    return rows as {
      employee_id: string;
      emp_code: string | null;
      first_name: string | null;
      last_name: string | null;
      department: string | null;
      branch_name: string | null;
      country_hint: string | null;
      region_code: string | null;
    }[];
  }
}

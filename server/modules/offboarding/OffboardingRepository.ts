import { BaseRepository } from "../../core/base/BaseRepository.js";

export class OffboardingRepository extends BaseRepository {
  async getEmployee(id: string) { const r = await this.sql`SELECT id,first_name,last_name,work_email,employment_status FROM employees WHERE id=${id}` as any[]; return r[0]??null; }
  async getActiveOffboarding(employeeId: string) { const r = await this.sql`SELECT id FROM offboarding_records WHERE employee_id=${employeeId} AND status IN('initiated','in_notice')` as any[]; return r[0]??null; }

  /** True if the given employee is assigned to at least one task on the given offboarding record. */
  async isAssigneeOfRecord(recordId: string, employeeId: string): Promise<boolean> {
    const rows = await this.sql`
      SELECT 1 FROM offboarding_tasks WHERE offboarding_id = ${recordId} AND assigned_to = ${employeeId} LIMIT 1
    ` as { "?column?": number }[];
    return rows.length > 0;
  }

  /** True if the employee is assigned to at least one task on an active offboarding (for nav visibility). */
  async hasActiveTaskAssignments(employeeId: string): Promise<boolean> {
    const rows = await this.sql`
      SELECT 1 FROM offboarding_tasks t
      INNER JOIN offboarding_records o ON o.id = t.offboarding_id
      WHERE t.assigned_to = ${employeeId} AND o.status IN ('initiated', 'in_notice') LIMIT 1
    ` as { "?column?": number }[];
    return rows.length > 0;
  }
  async getPendingOnboarding(employeeId: string) { const r = await this.sql`SELECT id FROM onboarding_records WHERE employee_id=${employeeId} AND status = 'in_progress'` as any[]; return r[0]??null; }
  async createRecord(data: any) {
    const r = await this.sql`
      INSERT INTO offboarding_records(
        employee_id, initiated_by, offboarding_type, reason, notice_required, notice_period_days,
        resignation_date, exit_date, status, remarks, region_code
      )
      VALUES (
        ${data.employeeId}, ${data.initiatedBy}, ${data.offboardingType}, ${data.reason ?? null},
        ${data.noticeRequired ?? false}, ${data.noticePeriodDays ?? null}, ${data.resignationDate ?? null},
        ${data.exitDate}, ${data.status}, ${data.remarks ?? null},
        (SELECT b.region_code FROM employees e JOIN branches b ON b.id = e.branch_id WHERE e.id = ${data.employeeId})
      )
      RETURNING *
    ` as any[];
    return r[0];
  }
  async updateEmployeeExitInfo(employeeId: string, offboardingType: string, reason: string|null, exitDate: string, resignationDate: string | null) {
    await this.sql`UPDATE employees SET exit_type=${offboardingType},resignation_reason=${reason},exit_date=${exitDate},resignation_date=${resignationDate},updated_at=NOW() WHERE id=${employeeId}`;
  }
  async generateDefaultTasks(offboardingId: string, employeeId: string) {
    const std = [["handover","Complete project handover documentation"],["knowledge_transfer","Knowledge transfer sessions with replacement/team"],["exit_interview","Conduct exit interview"],["final_settlement","Process final salary settlement"]];
    for (const [type,title] of std) await this.sql`INSERT INTO offboarding_tasks(offboarding_id,task_type,title) VALUES(${offboardingId},${type},${title})`;
    const assets = await this.sql`
      SELECT a.id, a.asset_id, a.processor, s.name as asset_name
      FROM assigned_systems a
      LEFT JOIN stock_items s ON s.id = a.stock_item_id
      WHERE a.user_id = ${employeeId}
    ` as any[];
    for (const a of assets) {
      const displayName = (a.asset_name && String(a.asset_name).trim()) || a.asset_id || "Asset";
      const title = "Return asset: " + displayName + (a.processor ? " (" + a.processor + ")" : "");
      const notes = "Asset ID: " + (a.asset_id || "");
      await this.sql`INSERT INTO offboarding_tasks(offboarding_id,task_type,title,related_asset_id,notes) VALUES(${offboardingId},'asset_return',${title},${a.id},${notes})`;
    }
  }
  async audit(offboardingId: string, action: string, performedBy: string | null, details: string, prevVal?: string, newVal?: string) {
    await this.sql`INSERT INTO offboarding_audit_log(offboarding_id,action,performed_by,details,previous_value,new_value) VALUES(${offboardingId},${action},${performedBy},${details},${prevVal??null},${newVal??null})`;
  }
  async completeRecord(id: string) { await this.sql`UPDATE offboarding_records SET status='completed',completed_at=NOW(),updated_at=NOW() WHERE id=${id}`; }
  /**
   * Mark employee as left the organization. Does not overwrite exit_date — that was set at offboarding initiate
   * (and may be updated via exit-date change). Termination-type offboarding sets employment_status to `terminated`;
   * other types use `offboarded`.
   */
  async offboardEmployee(employeeId: string, offboardingType: string) {
    const t = (offboardingType || "").toLowerCase();
    const employmentStatus = t === "termination" ? "terminated" : "offboarded";
    await this.sql`UPDATE employees SET employment_status=${employmentStatus}, updated_at=NOW() WHERE id=${employeeId}`;
  }
  async getById(id: string) { const r = await this.sql`SELECT * FROM offboarding_records WHERE id=${id}` as any[]; return r[0]??null; }
  async list(status?: string, regions?: string[] | null) {
    // Region scope (branch-derived): null = no filter; [] = none (ANY('{}') is false → fail-closed).
    const noRegion = regions == null;
    const regionArr = regions ?? [];
    if (status) {
      return this.sql`
        SELECT o.*, e.first_name, e.last_name, e.department, e.employee_id as emp_id, e.job_title, e.work_email, e.avatar,
          initiator.first_name as initiator_first_name, initiator.last_name as initiator_last_name,
          (SELECT COUNT(*)::int FROM offboarding_tasks t WHERE t.offboarding_id = o.id) as total_tasks,
          (SELECT COUNT(*)::int FROM offboarding_tasks t WHERE t.offboarding_id = o.id AND t.status = 'completed') as done_tasks
        FROM offboarding_records o
        INNER JOIN employees e ON e.id = o.employee_id
        LEFT JOIN employees initiator ON initiator.id = o.initiated_by
        LEFT JOIN branches b ON b.id = e.branch_id
        WHERE o.status = ${status}
          AND (${noRegion} OR COALESCE(o.region_code, b.region_code) = ANY(${regionArr}))
        ORDER BY o.exit_date ASC
      ` as Promise<any[]>;
    }
    return this.sql`
      SELECT o.*, e.first_name, e.last_name, e.department, e.employee_id as emp_id, e.job_title, e.work_email, e.avatar,
        initiator.first_name as initiator_first_name, initiator.last_name as initiator_last_name,
        (SELECT COUNT(*)::int FROM offboarding_tasks t WHERE t.offboarding_id = o.id) as total_tasks,
        (SELECT COUNT(*)::int FROM offboarding_tasks t WHERE t.offboarding_id = o.id AND t.status = 'completed') as done_tasks
      FROM offboarding_records o
      INNER JOIN employees e ON e.id = o.employee_id
      LEFT JOIN employees initiator ON initiator.id = o.initiated_by
      LEFT JOIN branches b ON b.id = e.branch_id
      WHERE (${noRegion} OR COALESCE(o.region_code, b.region_code) = ANY(${regionArr}))
      ORDER BY o.created_at DESC
    ` as Promise<any[]>;
  }

  /** List active offboarding records where the given employee is assigned to at least one task (for assignee view). */
  async listWhereAssignee(employeeId: string) {
    return this.sql`
      SELECT DISTINCT o.*, e.first_name, e.last_name, e.department, e.employee_id as emp_id, e.job_title, e.work_email, e.avatar,
        initiator.first_name as initiator_first_name, initiator.last_name as initiator_last_name,
        (SELECT COUNT(*)::int FROM offboarding_tasks t WHERE t.offboarding_id = o.id) as total_tasks,
        (SELECT COUNT(*)::int FROM offboarding_tasks t WHERE t.offboarding_id = o.id AND t.status = 'completed') as done_tasks
      FROM offboarding_records o
      INNER JOIN employees e ON e.id = o.employee_id
      LEFT JOIN employees initiator ON initiator.id = o.initiated_by
      INNER JOIN offboarding_tasks t ON t.offboarding_id = o.id AND t.assigned_to = ${employeeId}
      WHERE o.status IN ('initiated', 'in_notice')
      ORDER BY o.exit_date ASC
    ` as Promise<any[]>;
  }

  /** Get the active or most recent offboarding record for an employee with employee and initiator display fields. */
  async getRecordByEmployeeId(employeeId: string) {
    const r = await this.sql`
      SELECT o.*, e.first_name, e.last_name, e.department, e.job_title, e.work_email, e.employee_id as emp_id, e.employment_status,
        initiator.first_name as initiator_first_name, initiator.last_name as initiator_last_name
      FROM offboarding_records o
      INNER JOIN employees e ON e.id = o.employee_id
      LEFT JOIN employees initiator ON initiator.id = o.initiated_by
      WHERE o.employee_id = ${employeeId}
      ORDER BY CASE WHEN o.status IN ('initiated','in_notice') THEN 0 ELSE 1 END, o.created_at DESC
      LIMIT 1
    ` as any[];
    return r[0] ?? null;
  }

  /** Tasks with assignee names and resolved asset name (for asset_return). */
  async getTasksWithAssignees(offboardingId: string) {
    const rows = await (this.sql`
      SELECT t.*,
        emp.first_name as assignee_first_name, emp.last_name as assignee_last_name,
        ast.asset_id as _asset_id, ast.processor as _asset_processor,
        COALESCE(si.name, ast.asset_id) as _asset_display_name
      FROM offboarding_tasks t
      LEFT JOIN employees emp ON emp.id = t.assigned_to
      LEFT JOIN assigned_systems ast ON ast.id = t.related_asset_id
      LEFT JOIN stock_items si ON si.id = ast.stock_item_id
      WHERE t.offboarding_id = ${offboardingId}
      ORDER BY t.created_at ASC
    ` as unknown as Promise<any[]>);
    return rows.map((r: any) => {
      const { _asset_id, _asset_processor, _asset_display_name, ...task } = r;
      if (task.task_type === "asset_return" && (_asset_display_name != null || _asset_id != null)) {
        const name = (_asset_display_name && String(_asset_display_name).trim()) || _asset_id || "Asset";
        task.title = "Return asset: " + name + (_asset_processor ? " (" + _asset_processor + ")" : "");
      }
      return task;
    });
  }

  /** Assigned systems for an employee (for offboarding asset list). */
  async getAssetsForEmployee(employeeId: string) {
    return this.sql`
      SELECT
        a.id,
        a.asset_id,
        a.user_name,
        a.ram,
        a.storage,
        a.processor,
        'assigned' as status,
        a.created_at as assigned_date,
        COALESCE(
          (SELECT s.name FROM stock_items s WHERE s.id = a.stock_item_id),
          (SELECT s.name FROM stock_items s WHERE s.id = a.asset_id OR a.asset_id LIKE s.id || '-%' LIMIT 1)
        ) as asset_name
      FROM assigned_systems a
      WHERE a.user_id = ${employeeId}
      ORDER BY a.created_at ASC
    ` as Promise<any[]>;
  }
  async updateExitDate(id: string, exitDate: string, employeeId: string) {
    await this.sql`UPDATE offboarding_records SET exit_date=${exitDate},updated_at=NOW() WHERE id=${id}`;
    await this.sql`UPDATE employees SET exit_date=${exitDate},updated_at=NOW() WHERE id=${employeeId}`;
  }
  async updateResignationDate(id: string, resignationDate: string | null, employeeId: string) {
    await this.sql`UPDATE offboarding_records SET resignation_date=${resignationDate},updated_at=NOW() WHERE id=${id}`;
    await this.sql`UPDATE employees SET resignation_date=${resignationDate},updated_at=NOW() WHERE id=${employeeId}`;
  }
  async cancelRecord(id: string, reason: string|null) {
    await this.sql`UPDATE offboarding_records SET status='cancelled',remarks=COALESCE(${reason},remarks),updated_at=NOW() WHERE id=${id}`;
  }
  async revertEmployeeExitInfo(employeeId: string) { await this.sql`UPDATE employees SET exit_date=NULL,exit_type=NULL,resignation_date=NULL,resignation_reason=NULL,updated_at=NOW() WHERE id=${employeeId}`; }
  // Tasks
  async getTask(taskId: string) { const r = await this.sql`SELECT * FROM offboarding_tasks WHERE id=${taskId}` as any[]; return r[0]??null; }

  /** Employee + offboarding record context for task-assignment emails. */
  async getTaskAssignmentEmailContext(taskId: string) {
    const r = await this.sql`
      SELECT
        t.id AS task_id,
        t.title,
        t.task_type,
        t.offboarding_id,
        o.employee_id,
        o.status AS record_status,
        e.first_name,
        e.last_name,
        e.department,
        e.employee_id AS emp_code
      FROM offboarding_tasks t
      INNER JOIN offboarding_records o ON o.id = t.offboarding_id
      INNER JOIN employees e ON e.id = o.employee_id
      WHERE t.id = ${taskId}
    ` as any[];
    return r[0] ?? null;
  }
  async updateTask(taskId: string, data: any) {
    let completedAt = data._existing_completed_at ?? null;
    if (data.status === "completed" && data._prev_status !== "completed") completedAt = new Date().toISOString();
    const assignedTo = data._assigned_to !== undefined ? data._assigned_to : (data.assignedTo ?? null);
    const r = await this.sql`UPDATE offboarding_tasks SET status=COALESCE(${data.status??null},status),notes=COALESCE(${data.notes??null},notes),assigned_to=${assignedTo},completed_at=${completedAt},updated_at=NOW() WHERE id=${taskId} RETURNING *` as any[];
    return r[0]??null;
  }
  async unassignAsset(assetId: string) { await this.sql`UPDATE assigned_systems SET user_id=NULL,updated_at=NOW() WHERE id=${assetId}`; }
  async getTasks(offboardingId: string) { return this.sql`SELECT * FROM offboarding_tasks WHERE offboarding_id=${offboardingId} ORDER BY created_at ASC` as Promise<any[]>; }
  async getAuditLog(offboardingId: string) {
    return this.sql`
      SELECT
        a.id,
        a.offboarding_id,
        a.action,
        a.performed_by,
        a.details,
        a.previous_value,
        a.new_value,
        a.created_at,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ', emp.first_name, emp.last_name)), ''),
          usr.email
        ) AS performed_by_display
      FROM offboarding_audit_log a
      LEFT JOIN employees emp ON emp.id = a.performed_by
      LEFT JOIN users usr ON usr.id = a.performed_by
      WHERE a.offboarding_id = ${offboardingId}
      ORDER BY a.created_at ASC
    ` as Promise<any[]>;
  }

  /** Permanently delete an offboarding record (tasks and audit removed). */
  async deleteRecord(id: string) {
    await this.sql`DELETE FROM offboarding_tasks WHERE offboarding_id = ${id}`;
    await this.sql`DELETE FROM offboarding_audit_log WHERE offboarding_id = ${id}`;
    await this.sql`DELETE FROM offboarding_records WHERE id = ${id}`;
  }
}

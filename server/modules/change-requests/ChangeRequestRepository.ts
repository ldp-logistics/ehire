import { BaseRepository } from "../../core/base/BaseRepository.js";
import { appendEffectiveRegionFilter } from "../../lib/employeeRegionSql.js";

export interface ChangeRequestRow {
  id: string; requester_id: string; employee_id: string; category: string;
  field_name: string; old_value: string | null; new_value: string; status: string;
  reviewed_by: string | null; reviewed_at: Date | null; review_notes: string | null;
  created_at: Date; updated_at: Date;
  employee_name?: string; employee_code?: string; requester_email?: string;
}

export class ChangeRequestRepository extends BaseRepository {
  async findAll(opts: { isAdminOrHR: boolean; requesterId: string; status?: string; employeeId?: string; limit: number; offset: number; regions?: string[] | null }): Promise<ChangeRequestRow[]> {
    const { isAdminOrHR, requesterId, status, employeeId, limit, offset, regions } = opts;
    if (regions != null && regions.length === 0) return [];
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (!isAdminOrHR) { params.push(requesterId); conditions.push(`cr.requester_id = $${params.length}`); }
    else {
      if (employeeId) { params.push(employeeId); conditions.push(`cr.employee_id = $${params.length}`); }
      if (status) { params.push(status); conditions.push(`cr.status = $${params.length}`); }
    }
    appendEffectiveRegionFilter(regions, "e", "b", conditions, params);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit, offset);

    return this.sql(`
      SELECT cr.*, e.first_name || ' ' || e.last_name as employee_name,
             e.employee_id as employee_code, u.email as requester_email
      FROM change_requests cr
      JOIN employees e ON cr.employee_id = e.id
      LEFT JOIN branches b ON b.id = e.branch_id
      JOIN users u ON cr.requester_id = u.id
      ${where} ORDER BY cr.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params) as unknown as Promise<ChangeRequestRow[]>;
  }

  async countPending(regions?: string[] | null): Promise<number> {
    if (regions != null && regions.length === 0) return 0;
    const conds = ["cr.status = 'pending'"];
    const params: unknown[] = [];
    appendEffectiveRegionFilter(regions, "e", "b", conds, params);
    const rows = await this.sql(
      `SELECT COUNT(*)::int as count FROM change_requests cr
       JOIN employees e ON cr.employee_id = e.id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE ${conds.join(" AND ")}`,
      params,
    ) as any[];
    return rows[0].count;
  }

  async getEmployeeField(employeeId: string, fieldName: string): Promise<{ value: string | null } | null> {
    const rows = await this.sql(`SELECT ${fieldName} as value FROM employees WHERE id = $1`, [employeeId]) as any[];
    return rows[0] ? { value: rows[0].value } : null;
  }

  async getEmployee(employeeId: string): Promise<any | null> {
    const rows = await this.sql`SELECT * FROM employees WHERE id = ${employeeId}` as any[];
    return rows[0] ?? null;
  }

  async create(requesterId: string, employeeId: string, category: string, fieldName: string, oldValue: string | null, newValue: string): Promise<ChangeRequestRow> {
    const rows = await this.sql`
      INSERT INTO change_requests (requester_id, employee_id, category, field_name, old_value, new_value)
      VALUES (${requesterId}, ${employeeId}, ${category}, ${fieldName}, ${oldValue}, ${newValue}) RETURNING *
    ` as ChangeRequestRow[];
    return rows[0];
  }

  async findById(id: string): Promise<ChangeRequestRow | null> {
    const rows = await this.sql`SELECT * FROM change_requests WHERE id = ${id}` as ChangeRequestRow[];
    return rows[0] ?? null;
  }

  async findPendingById(id: string): Promise<ChangeRequestRow | null> {
    const rows = await this.sql`SELECT * FROM change_requests WHERE id = ${id} AND status = 'pending'` as ChangeRequestRow[];
    return rows[0] ?? null;
  }

  async applyChange(employeeId: string, fieldName: string, newValue: string): Promise<void> {
    await this.sql(`UPDATE employees SET ${fieldName} = $1, updated_at = NOW() WHERE id = $2`, [newValue, employeeId]);
  }

  async markApproved(id: string, reviewedBy: string, reviewNotes: string | null): Promise<ChangeRequestRow> {
    const rows = await this.sql`
      UPDATE change_requests SET status = 'approved', reviewed_by = ${reviewedBy},
        reviewed_at = NOW(), review_notes = ${reviewNotes}, updated_at = NOW()
      WHERE id = ${id} RETURNING *
    ` as ChangeRequestRow[];
    return rows[0];
  }

  async markRejected(id: string, reviewedBy: string, reviewNotes: string): Promise<ChangeRequestRow | null> {
    const rows = await this.sql`
      UPDATE change_requests SET status = 'rejected', reviewed_by = ${reviewedBy},
        reviewed_at = NOW(), review_notes = ${reviewNotes}, updated_at = NOW()
      WHERE id = ${id} AND status = 'pending' RETURNING *
    ` as ChangeRequestRow[];
    return rows[0] ?? null;
  }

  async deleteById(id: string): Promise<boolean> {
    const rows = await this.sql`DELETE FROM change_requests WHERE id = ${id} RETURNING id` as { id: string }[];
    return rows.length > 0;
  }

  /** Rows with avatar field still storing base64 data URLs (migration target). */
  async findAvatarBase64Rows(): Promise<
    { id: string; employee_id: string; old_value: string | null; new_value: string }[]
  > {
    return this.sql`
      SELECT id, employee_id, old_value, new_value
      FROM change_requests
      WHERE field_name = 'avatar'
        AND (
          (old_value IS NOT NULL AND TRIM(old_value) LIKE 'data:%')
          OR (new_value IS NOT NULL AND TRIM(new_value) LIKE 'data:%')
        )
    ` as unknown as Promise<{ id: string; employee_id: string; old_value: string | null; new_value: string }[]>;
  }

  async updateValueColumn(
    id: string,
    column: "old_value" | "new_value",
    value: string
  ): Promise<void> {
    if (column === "old_value") {
      await this.sql`UPDATE change_requests SET old_value = ${value}, updated_at = NOW() WHERE id = ${id}`;
    } else {
      await this.sql`UPDATE change_requests SET new_value = ${value}, updated_at = NOW() WHERE id = ${id}`;
    }
  }
}

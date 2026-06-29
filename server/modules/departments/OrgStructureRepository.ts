/**
 * OrgStructureRepository — DB access for business_units, levels, and branches (locations).
 * Used by the FreshTeam org-structure migration (upsert by freshteam_id).
 */

import { BaseRepository } from "../../core/base/BaseRepository.js";

export class OrgStructureRepository extends BaseRepository {
  /** Upsert branch (location) by FreshTeam id; returns { created: boolean }. */
  async upsertBranch(ftId: string, name: string): Promise<{ created: boolean }> {
    const existing = (await this.sql`
      SELECT id FROM branches WHERE freshteam_id = ${ftId} LIMIT 1
    `) as { id: string }[];
    if (existing.length > 0) {
      await this.sql`
        UPDATE branches SET name = ${name}, updated_at = NOW() WHERE id = ${existing[0].id}
      `;
      return { created: false };
    }
    await this.sql`
      INSERT INTO branches (name, freshteam_id) VALUES (${name}, ${ftId})
    `;
    return { created: true };
  }

  /** Upsert business_unit by FreshTeam id; returns { created: boolean }. */
  async upsertBusinessUnit(ftId: string, name: string): Promise<{ created: boolean }> {
    const existing = (await this.sql`
      SELECT id FROM business_units WHERE freshteam_id = ${ftId} LIMIT 1
    `) as { id: string }[];
    if (existing.length > 0) {
      await this.sql`
        UPDATE business_units SET name = ${name}, updated_at = NOW() WHERE id = ${existing[0].id}
      `;
      return { created: false };
    }
    await this.sql`
      INSERT INTO business_units (name, freshteam_id) VALUES (${name}, ${ftId})
    `;
    return { created: true };
  }

  /** Upsert level (job band/grade) by FreshTeam id; returns { created: boolean }. */
  async upsertLevel(ftId: string, name: string): Promise<{ created: boolean }> {
    const existing = (await this.sql`
      SELECT id FROM levels WHERE freshteam_id = ${ftId} LIMIT 1
    `) as { id: string }[];
    if (existing.length > 0) {
      await this.sql`
        UPDATE levels SET name = ${name}, updated_at = NOW() WHERE id = ${existing[0].id}
      `;
      return { created: false };
    }
    await this.sql`
      INSERT INTO levels (name, freshteam_id) VALUES (${name}, ${ftId})
    `;
    return { created: true };
  }

  /** Get business_unit name by FreshTeam id (for linking employees). */
  async getBusinessUnitNameByFreshteamId(ftId: string): Promise<string | null> {
    const rows = (await this.sql`
      SELECT name FROM business_units WHERE freshteam_id = ${ftId} LIMIT 1
    `) as { name: string }[];
    return rows[0]?.name ?? null;
  }

  /** Get level name by FreshTeam id (for linking employees). */
  async getLevelNameByFreshteamId(ftId: string): Promise<string | null> {
    const rows = (await this.sql`
      SELECT name FROM levels WHERE freshteam_id = ${ftId} LIMIT 1
    `) as { name: string }[];
    return rows[0]?.name ?? null;
  }

  /** Get branch (location) name by FreshTeam id (for linking employees). */
  async getBranchNameByFreshteamId(ftId: string): Promise<string | null> {
    const rows = (await this.sql`
      SELECT name FROM branches WHERE freshteam_id = ${ftId} LIMIT 1
    `) as { name: string }[];
    return rows[0]?.name ?? null;
  }

  /** Upsert team by FreshTeam id; returns { created: boolean }. */
  async upsertTeam(ftId: string, name: string): Promise<{ created: boolean }> {
    const existing = (await this.sql`
      SELECT id FROM teams WHERE freshteam_id = ${ftId} LIMIT 1
    `) as { id: string }[];
    if (existing.length > 0) {
      await this.sql`
        UPDATE teams SET name = ${name}, updated_at = NOW() WHERE id = ${existing[0].id}
      `;
      return { created: false };
    }
    await this.sql`
      INSERT INTO teams (name, freshteam_id) VALUES (${name}, ${ftId})
    `;
    return { created: true };
  }

  /** Get team name by FreshTeam id (for linking employees). */
  async getTeamNameByFreshteamId(ftId: string): Promise<string | null> {
    const rows = (await this.sql`
      SELECT name FROM teams WHERE freshteam_id = ${ftId} LIMIT 1
    `) as { name: string }[];
    return rows[0]?.name ?? null;
  }

  /** List teams. When includeInactive is true, returns all with isActive; otherwise active only (for dropdowns). */
  async listTeams(
    includeInactive = false,
  ): Promise<
    { id: string; name: string; isActive: boolean; managerId: string | null; managerName: string | null }[]
  > {
    const base = includeInactive
      ? this.sql`
        SELECT t.id, t.name, COALESCE(t.is_active, true) AS is_active, t.manager_id,
          TRIM(COALESCE(m.first_name,'') || ' ' || COALESCE(m.last_name,'')) AS manager_name
        FROM teams t
        LEFT JOIN employees m ON m.id = t.manager_id
        ORDER BY t.name`
      : this.sql`
        SELECT t.id, t.name, true AS is_active, t.manager_id,
          TRIM(COALESCE(m.first_name,'') || ' ' || COALESCE(m.last_name,'')) AS manager_name
        FROM teams t
        LEFT JOIN employees m ON m.id = t.manager_id
        WHERE COALESCE(t.is_active, true) = true
        ORDER BY t.name`;
    const rows = (await base) as {
      id: string;
      name: string;
      is_active: boolean;
      manager_id: string | null;
      manager_name: string | null;
    }[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      isActive: r.is_active !== false,
      managerId: r.manager_id ?? null,
      managerName: r.manager_name?.trim() ? r.manager_name.trim() : null,
    }));
  }

  /** Single team row for RBAC and edits. */
  async getTeamById(id: string): Promise<{
    id: string;
    name: string;
    isActive: boolean;
    managerId: string | null;
  } | null> {
    const rows = (await this.sql`
      SELECT t.id, t.name, COALESCE(t.is_active, true) AS is_active, t.manager_id
      FROM teams t
      WHERE t.id = ${id}
      LIMIT 1
    `) as { id: string; name: string; is_active: boolean; manager_id: string | null }[];
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      isActive: r.is_active !== false,
      managerId: r.manager_id ?? null,
    };
  }

  /** Teams where this employee is the assigned org team manager. */
  async listTeamsManagedByEmployee(employeeId: string): Promise<
    { id: string; name: string; isActive: boolean; managerId: string | null; managerName: string | null }[]
  > {
    const rows = (await this.sql`
      SELECT t.id, t.name, COALESCE(t.is_active, true) AS is_active, t.manager_id,
        TRIM(COALESCE(m.first_name,'') || ' ' || COALESCE(m.last_name,'')) AS manager_name
      FROM teams t
      LEFT JOIN employees m ON m.id = t.manager_id
      WHERE t.manager_id = ${employeeId}
      ORDER BY t.name
    `) as {
      id: string;
      name: string;
      is_active: boolean;
      manager_id: string | null;
      manager_name: string | null;
    }[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      isActive: r.is_active !== false,
      managerId: r.manager_id ?? null,
      managerName: r.manager_name?.trim() ? r.manager_name.trim() : null,
    }));
  }

  async updateTeamWithManager(
    id: string,
    name: string,
    managerId: string | null | undefined,
  ): Promise<{
    id: string;
    name: string;
    isActive: boolean;
    managerId: string | null;
    managerName: string | null;
  } | null> {
    const existing = (await this.sql`
      SELECT name FROM teams WHERE id = ${id} LIMIT 1
    `) as { name: string }[];
    if (existing.length === 0) return null;
    const r = (await (managerId === undefined
      ? this.sql`
        UPDATE teams SET name = ${name.trim()}, updated_at = NOW() WHERE id = ${id}
        RETURNING id, name, COALESCE(is_active, true) AS is_active, manager_id`
      : this.sql`
        UPDATE teams
        SET name = ${name.trim()}, manager_id = ${managerId}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, name, COALESCE(is_active, true) AS is_active, manager_id`)) as {
      id: string;
      name: string;
      is_active: boolean;
      manager_id: string | null;
    }[];
    if (r.length === 0) return null;
    await this.updateEmployeeOrgText("primary_team", existing[0].name, r[0].name);
    const mid = r[0].manager_id ?? null;
    let managerName: string | null = null;
    if (mid) {
      const m = (await this.sql`
        SELECT TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) AS n
        FROM employees WHERE id = ${mid} LIMIT 1
      `) as { n: string }[];
      managerName = m[0]?.n?.trim() || null;
    }
    return {
      id: r[0].id,
      name: r[0].name,
      isActive: r[0].is_active !== false,
      managerId: mid,
      managerName,
    };
  }

  /** Active employees in the same department (case-insensitive match on department text). */
  async listTeammatesByDepartment(employeeId: string): Promise<
    {
      id: string;
      employeeId: string;
      firstName: string;
      lastName: string;
      jobTitle: string | null;
      department: string | null;
      avatar: string | null;
      isYou: boolean;
    }[]
  > {
    const rows = (await this.sql`
      SELECT e.id, e.employee_id, e.first_name, e.last_name, e.job_title, e.department, e.avatar,
        (e.id = me.id) AS is_you
      FROM employees e
      INNER JOIN employees me ON me.id = ${employeeId}
      WHERE NULLIF(TRIM(me.department), '') IS NOT NULL
        AND NULLIF(TRIM(e.department), '') IS NOT NULL
        AND TRIM(LOWER(e.department)) = TRIM(LOWER(me.department))
        AND e.employment_status IN ('active', 'onboarding', 'on_leave')
      ORDER BY (e.id = me.id) DESC, e.first_name ASC NULLS LAST, e.last_name ASC NULLS LAST
    `) as {
      id: string;
      employee_id: string;
      first_name: string;
      last_name: string;
      job_title: string | null;
      department: string | null;
      avatar: string | null;
      is_you: boolean;
    }[];
    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      firstName: r.first_name ?? "",
      lastName: r.last_name ?? "",
      jobTitle: r.job_title ?? null,
      department: r.department ?? null,
      avatar: r.avatar ?? null,
      isYou: r.is_you === true,
    }));
  }

  async getEmployeeDepartmentContext(employeeId: string): Promise<{
    departmentName: string | null;
    reportingManagerId: string | null;
    reportingManagerName: string | null;
  }> {
    const rows = (await this.sql`
      SELECT NULLIF(TRIM(e.department), '') AS dept,
        e.manager_id,
        TRIM(COALESCE(m.first_name,'') || ' ' || COALESCE(m.last_name,'')) AS mgr_name
      FROM employees e
      LEFT JOIN employees m ON m.id = e.manager_id
      WHERE e.id = ${employeeId}
      LIMIT 1
    `) as {
      dept: string | null;
      manager_id: string | null;
      mgr_name: string | null;
    }[];
    const r = rows[0];
    return {
      departmentName: r?.dept ?? null,
      reportingManagerId: r?.manager_id ?? null,
      reportingManagerName: r?.mgr_name?.trim() || null,
    };
  }

  /** Distinct departments among active employees with headcount (admin overview). */
  async listDepartmentsWithHeadcount(): Promise<{ name: string; headcount: number }[]> {
    const rows = (await this.sql`
      SELECT MIN(TRIM(department)) AS name, COUNT(*)::int AS headcount
      FROM employees
      WHERE employment_status IN ('active', 'onboarding', 'on_leave')
        AND department IS NOT NULL AND TRIM(department) <> ''
      GROUP BY LOWER(TRIM(department))
      ORDER BY MIN(TRIM(department))
    `) as { name: string; headcount: number }[];
    return rows.map((r) => ({ name: r.name, headcount: r.headcount }));
  }

  /** Upsert role by FreshTeam id; returns { created: boolean }. */
  async upsertRole(ftId: string, name: string): Promise<{ created: boolean }> {
    const existing = (await this.sql`
      SELECT id FROM roles WHERE freshteam_id = ${ftId} LIMIT 1
    `) as { id: string }[];
    if (existing.length > 0) {
      await this.sql`
        UPDATE roles SET name = ${name}, updated_at = NOW() WHERE id = ${existing[0].id}
      `;
      return { created: false };
    }
    await this.sql`
      INSERT INTO roles (name, freshteam_id) VALUES (${name}, ${ftId})
    `;
    return { created: true };
  }

  /** Get role name by FreshTeam id (for linking employees). */
  async getRoleNameByFreshteamId(ftId: string): Promise<string | null> {
    const rows = (await this.sql`
      SELECT name FROM roles WHERE freshteam_id = ${ftId} LIMIT 1
    `) as { name: string }[];
    return rows[0]?.name ?? null;
  }

  /** List roles. includeInactive: include soft-deleted. */
  async listRoles(includeInactive = false): Promise<{ id: string; name: string; isActive: boolean }[]> {
    try {
      const rows = (await (includeInactive
        ? this.sql`SELECT id, name, COALESCE(is_active, true) AS is_active FROM roles ORDER BY name`
        : this.sql`SELECT id, name, true AS is_active FROM roles WHERE COALESCE(is_active, true) = true ORDER BY name`)) as { id: string; name: string; is_active: boolean }[];
      return rows.map((r) => ({ id: r.id, name: r.name, isActive: r.is_active !== false }));
    } catch {
      return [];
    }
  }

  /** List business units. includeInactive: include soft-deleted. */
  async listBusinessUnits(includeInactive = false): Promise<{ id: string; name: string; isActive: boolean }[]> {
    const rows = (await (includeInactive
      ? this.sql`SELECT id, name, COALESCE(is_active, true) AS is_active FROM business_units ORDER BY name`
      : this.sql`SELECT id, name, true AS is_active FROM business_units WHERE COALESCE(is_active, true) = true ORDER BY name`)) as { id: string; name: string; is_active: boolean }[];
    return rows.map((r) => ({ id: r.id, name: r.name, isActive: r.is_active !== false }));
  }

  /** List levels. includeInactive: include soft-deleted. */
  async listLevels(includeInactive = false): Promise<{ id: string; name: string; isActive: boolean }[]> {
    const rows = (await (includeInactive
      ? this.sql`SELECT id, name, COALESCE(is_active, true) AS is_active FROM levels ORDER BY name`
      : this.sql`SELECT id, name, true AS is_active FROM levels WHERE COALESCE(is_active, true) = true ORDER BY name`)) as { id: string; name: string; is_active: boolean }[];
    return rows.map((r) => ({ id: r.id, name: r.name, isActive: r.is_active !== false }));
  }

  /** List branches with regional display settings. */
  async listBranches(includeInactive = false): Promise<{ id: string; name: string; isActive: boolean; timeZone: string | null; dateFormat: string | null; regionCode: string | null }[]> {
    const rows = (await (includeInactive
      ? this.sql`SELECT id, name, COALESCE(is_active, true) AS is_active, time_zone, date_format, region_code FROM branches ORDER BY name`
      : this.sql`SELECT id, name, true AS is_active, time_zone, date_format, region_code FROM branches WHERE COALESCE(is_active, true) = true ORDER BY name`)) as {
      id: string;
      name: string;
      is_active: boolean;
      time_zone: string | null;
      date_format: string | null;
      region_code: string | null;
    }[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      isActive: r.is_active !== false,
      timeZone: r.time_zone ?? null,
      dateFormat: r.date_format ?? null,
      regionCode: r.region_code ?? null,
    }));
  }

  /** Upsert work_shift by FreshTeam id; returns { created: boolean }. */
  async upsertWorkShift(ftId: string, name: string): Promise<{ created: boolean }> {
    const existing = (await this.sql`
      SELECT id FROM work_shifts WHERE freshteam_id = ${ftId} LIMIT 1
    `) as { id: string }[];
    if (existing.length > 0) {
      await this.sql`
        UPDATE work_shifts SET name = ${name}, updated_at = NOW() WHERE id = ${existing[0].id}
      `;
      return { created: false };
    }
    await this.sql`
      INSERT INTO work_shifts (name, freshteam_id) VALUES (${name}, ${ftId})
    `;
    return { created: true };
  }

  /** Upsert job_category by FreshTeam id; returns { created: boolean }. */
  async upsertJobCategory(ftId: string, name: string): Promise<{ created: boolean }> {
    const existing = (await this.sql`
      SELECT id FROM job_categories WHERE freshteam_id = ${ftId} LIMIT 1
    `) as { id: string }[];
    if (existing.length > 0) {
      await this.sql`
        UPDATE job_categories SET name = ${name}, updated_at = NOW() WHERE id = ${existing[0].id}
      `;
      return { created: false };
    }
    await this.sql`
      INSERT INTO job_categories (name, freshteam_id) VALUES (${name}, ${ftId})
    `;
    return { created: true };
  }

  /** Get work_shift name by FreshTeam id (for linking employees). */
  async getWorkShiftNameByFreshteamId(ftId: string): Promise<string | null> {
    const rows = (await this.sql`
      SELECT name FROM work_shifts WHERE freshteam_id = ${ftId} LIMIT 1
    `) as { name: string }[];
    return rows[0]?.name ?? null;
  }

  /** Get job_category name by FreshTeam id (for linking employees). */
  async getJobCategoryNameByFreshteamId(ftId: string): Promise<string | null> {
    const rows = (await this.sql`
      SELECT name FROM job_categories WHERE freshteam_id = ${ftId} LIMIT 1
    `) as { name: string }[];
    return rows[0]?.name ?? null;
  }

  /** List work shifts. includeInactive: include soft-deleted. */
  async listWorkShifts(includeInactive = false): Promise<{ id: string; name: string; isActive: boolean }[]> {
    const rows = (await (includeInactive
      ? this.sql`SELECT id, name, COALESCE(is_active, true) AS is_active FROM work_shifts ORDER BY name`
      : this.sql`SELECT id, name, true AS is_active FROM work_shifts WHERE COALESCE(is_active, true) = true ORDER BY name`)) as { id: string; name: string; is_active: boolean }[];
    return rows.map((r) => ({ id: r.id, name: r.name, isActive: r.is_active !== false }));
  }

  /** List job categories. includeInactive: include soft-deleted. */
  async listJobCategories(includeInactive = false): Promise<{ id: string; name: string; isActive: boolean }[]> {
    const rows = (await (includeInactive
      ? this.sql`SELECT id, name, COALESCE(is_active, true) AS is_active FROM job_categories ORDER BY name`
      : this.sql`SELECT id, name, true AS is_active FROM job_categories WHERE COALESCE(is_active, true) = true ORDER BY name`)) as { id: string; name: string; is_active: boolean }[];
    return rows.map((r) => ({ id: r.id, name: r.name, isActive: r.is_active !== false }));
  }

  /** List sub-departments. includeInactive: include soft-deleted. */
  async listSubDepartments(includeInactive = false): Promise<{ id: string; name: string; isActive: boolean }[]> {
    const rows = (await (includeInactive
      ? this.sql`SELECT id, name, COALESCE(is_active, true) AS is_active FROM sub_departments ORDER BY name`
      : this.sql`SELECT id, name, true AS is_active FROM sub_departments WHERE COALESCE(is_active, true) = true ORDER BY name`)) as { id: string; name: string; is_active: boolean }[];
    return rows.map((r) => ({ id: r.id, name: r.name, isActive: r.is_active !== false }));
  }

  // ─── Generic CRUD helpers for org entities (sub_departments, business_units, teams, levels, branches, work_shifts, roles, job_categories) ───

  private async createOrgRow(table: string, name: string): Promise<{ id: string; name: string; isActive: boolean }> {
    const r = await this.sql(`INSERT INTO ${table} (name, is_active) VALUES ($1, true) RETURNING id, name, COALESCE(is_active, true) AS is_active`, [name]) as { id: string; name: string; is_active: boolean }[];
    return { id: r[0].id, name: r[0].name, isActive: r[0].is_active !== false };
  }

  private async updateEmployeeOrgText(column: string, oldName: string | null, newName: string): Promise<void> {
    if (!oldName || oldName === newName) return;
    await this.sql(`UPDATE employees SET ${column} = $1, updated_at = NOW() WHERE ${column} = $2`, [newName, oldName]);
  }

  private async updateOrgRow(table: string, id: string, name: string): Promise<{ id: string; name: string; isActive: boolean } | null> {
    const r = await this.sql(`UPDATE ${table} SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, COALESCE(is_active, true) AS is_active`, [name, id]) as { id: string; name: string; is_active: boolean }[];
    if (r.length === 0) return null;
    return { id: r[0].id, name: r[0].name, isActive: r[0].is_active !== false };
  }

  private async updateOrgRowAndEmployeeField(
    table: string,
    employeeColumn: string,
    id: string,
    name: string,
  ): Promise<{ id: string; name: string; isActive: boolean } | null> {
    const existing = (await this.sql(`SELECT name FROM ${table} WHERE id = $1 LIMIT 1`, [id])) as { name: string }[];
    if (existing.length === 0) return null;
    const row = await this.updateOrgRow(table, id, name);
    if (!row) return null;
    await this.updateEmployeeOrgText(employeeColumn, existing[0].name, row.name);
    return row;
  }

  private async softDeleteOrgRow(table: string, id: string): Promise<boolean> {
    const r = await this.sql(`UPDATE ${table} SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`, [id]) as { id: string }[];
    return r.length > 0;
  }

  private async restoreOrgRow(table: string, id: string): Promise<boolean> {
    const r = await this.sql(`UPDATE ${table} SET is_active = true, updated_at = NOW() WHERE id = $1 RETURNING id`, [id]) as { id: string }[];
    return r.length > 0;
  }

  async createSubDepartment(name: string) { return this.createOrgRow("sub_departments", name); }
  async updateSubDepartment(id: string, name: string) { return this.updateOrgRowAndEmployeeField("sub_departments", "sub_department", id, name); }
  async softDeleteSubDepartment(id: string) { return this.softDeleteOrgRow("sub_departments", id); }
  async restoreSubDepartment(id: string) { return this.restoreOrgRow("sub_departments", id); }

  async createBusinessUnit(name: string) { return this.createOrgRow("business_units", name); }
  async updateBusinessUnit(id: string, name: string) { return this.updateOrgRowAndEmployeeField("business_units", "business_unit", id, name); }
  async softDeleteBusinessUnit(id: string) { return this.softDeleteOrgRow("business_units", id); }
  async restoreBusinessUnit(id: string) { return this.restoreOrgRow("business_units", id); }

  async createTeam(name: string) { return this.createOrgRow("teams", name); }
  async updateTeam(id: string, name: string) { return this.updateOrgRowAndEmployeeField("teams", "primary_team", id, name); }
  async softDeleteTeam(id: string) { return this.softDeleteOrgRow("teams", id); }
  async restoreTeam(id: string) { return this.restoreOrgRow("teams", id); }

  async createLevel(name: string) { return this.createOrgRow("levels", name); }
  async updateLevel(id: string, name: string) { return this.updateOrgRowAndEmployeeField("levels", "grade", id, name); }
  async softDeleteLevel(id: string) { return this.softDeleteOrgRow("levels", id); }
  async restoreLevel(id: string) { return this.restoreOrgRow("levels", id); }

  async createBranch(name: string, timeZone?: string | null, dateFormat?: string | null) {
    const r = await this.sql`
      INSERT INTO branches (name, is_active, time_zone, date_format)
      VALUES (${name}, true, ${timeZone ?? null}, ${dateFormat ?? null})
      RETURNING id, name, COALESCE(is_active, true) AS is_active, time_zone, date_format
    ` as {
      id: string;
      name: string;
      is_active: boolean;
      time_zone: string | null;
      date_format: string | null;
    }[];
    return {
      id: r[0].id,
      name: r[0].name,
      isActive: r[0].is_active !== false,
      timeZone: r[0].time_zone ?? null,
      dateFormat: r[0].date_format ?? null,
    };
  }
  /**
   * Patch branch display fields. Pass `undefined` for timeZone / dateFormat to leave that column unchanged
   * (avoids accidental null-out when the client omits a key or sends snake_case under a different name).
   */
  async updateBranch(
    id: string,
    name: string,
    timeZone?: string | null | undefined,
    dateFormat?: string | null | undefined,
  ) {
    const existing = (await this.sql`
      SELECT name, time_zone, date_format FROM branches WHERE id = ${id} LIMIT 1
    `) as { name: string; time_zone: string | null; date_format: string | null }[];
    if (existing.length === 0) return null;
    const nextTz = timeZone === undefined ? existing[0].time_zone : timeZone;
    const nextDf = dateFormat === undefined ? existing[0].date_format : dateFormat;
    const r = await this.sql`
      UPDATE branches
      SET
        name = ${name},
        time_zone = ${nextTz},
        date_format = ${nextDf},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name, COALESCE(is_active, true) AS is_active, time_zone, date_format
    ` as {
      id: string;
      name: string;
      is_active: boolean;
      time_zone: string | null;
      date_format: string | null;
    }[];
    if (r.length === 0) return null;
    await this.updateEmployeeOrgText("location", existing[0].name, r[0].name);
    return {
      id: r[0].id,
      name: r[0].name,
      isActive: r[0].is_active !== false,
      timeZone: r[0].time_zone ?? null,
      dateFormat: r[0].date_format ?? null,
    };
  }
  async softDeleteBranch(id: string) { return this.softDeleteOrgRow("branches", id); }
  async restoreBranch(id: string) { return this.restoreOrgRow("branches", id); }

  async createWorkShift(name: string) { return this.createOrgRow("work_shifts", name); }
  async updateWorkShift(id: string, name: string) { return this.updateOrgRowAndEmployeeField("work_shifts", "shift", id, name); }
  async softDeleteWorkShift(id: string) { return this.softDeleteOrgRow("work_shifts", id); }
  async restoreWorkShift(id: string) { return this.restoreOrgRow("work_shifts", id); }

  async createRole(name: string) { return this.createOrgRow("roles", name); }
  async updateRole(id: string, name: string) { return this.updateOrgRowAndEmployeeField("roles", "role", id, name); }
  async softDeleteRole(id: string) { return this.softDeleteOrgRow("roles", id); }
  async restoreRole(id: string) { return this.restoreOrgRow("roles", id); }

  async createJobCategory(name: string) { return this.createOrgRow("job_categories", name); }
  async updateJobCategory(id: string, name: string) { return this.updateOrgRowAndEmployeeField("job_categories", "job_category", id, name); }
  async softDeleteJobCategory(id: string) { return this.softDeleteOrgRow("job_categories", id); }
  async restoreJobCategory(id: string) { return this.restoreOrgRow("job_categories", id); }
}

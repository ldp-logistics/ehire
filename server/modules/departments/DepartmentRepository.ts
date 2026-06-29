/**
 * DepartmentRepository — all database interactions for the departments table.
 *
 * Rules:
 *  • Only raw SQL / ORM queries here. No business logic.
 *  • Never throw HTTP errors from here; throw plain JS errors or let them bubble.
 *  • All public methods are async and return typed results.
 *  • Use parameterized queries for all user input (neon tagged templates handle this).
 */

import { BaseRepository } from "../../core/base/BaseRepository.js";
import type { PaginationParams } from "../../core/types/index.js";
import type { CreateDepartmentInput, UpdateDepartmentInput } from "./Department.validators.js";

// ─── Raw row type returned from the DB ───────────────────────────────────────

export interface DepartmentRow {
  id: string;
  name: string;
  freshteam_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  /** Computed by LEFT JOIN with employees table */
  employee_count: number;
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class DepartmentRepository extends BaseRepository {
  /**
   * Paginated list with optional name search.
   * When includeInactive is true, returns all; otherwise only is_active = true.
   */
  async findAll(params: PaginationParams, includeInactive = false): Promise<{ rows: DepartmentRow[]; total: number }> {
    const { search, limit, offset } = params;
    const showInactive = !!includeInactive;

    const [countRow] = (await (search
      ? this.sql`
          SELECT COUNT(*)::int AS total FROM departments d
          WHERE d.name ILIKE ${this.likePattern(search)}
            AND (COALESCE(d.is_active, true) = true OR ${showInactive})`
      : this.sql`
          SELECT COUNT(*)::int AS total FROM departments d
          WHERE (COALESCE(d.is_active, true) = true OR ${showInactive})`)) as [{ total: number }];

    const rows = (await (search
      ? this.sql`
          SELECT
            d.id,
            d.name,
            d.freshteam_id,
            COALESCE(d.is_active, true) AS is_active,
            d.created_at,
            d.updated_at,
            COUNT(e.id)::int AS employee_count
          FROM departments d
          LEFT JOIN employees e
            ON LOWER(e.department) = LOWER(d.name)
            AND e.employment_status NOT IN ('terminated', 'resigned', 'offboarded')
          WHERE d.name ILIKE ${this.likePattern(search)}
            AND (COALESCE(d.is_active, true) = true OR ${showInactive})
          GROUP BY d.id, d.name, d.freshteam_id, d.is_active, d.created_at, d.updated_at
          ORDER BY d.name ASC
          LIMIT ${limit} OFFSET ${offset}`
      : this.sql`
          SELECT
            d.id,
            d.name,
            d.freshteam_id,
            COALESCE(d.is_active, true) AS is_active,
            d.created_at,
            d.updated_at,
            COUNT(e.id)::int AS employee_count
          FROM departments d
          LEFT JOIN employees e
            ON LOWER(e.department) = LOWER(d.name)
            AND e.employment_status NOT IN ('terminated', 'resigned', 'offboarded')
          WHERE (COALESCE(d.is_active, true) = true OR ${showInactive})
          GROUP BY d.id, d.name, d.freshteam_id, d.is_active, d.created_at, d.updated_at
          ORDER BY d.name ASC
          LIMIT ${limit} OFFSET ${offset}`)) as DepartmentRow[];

    return { rows, total: countRow?.total ?? 0 };
  }

  /** Single department by primary key, with employee count. */
  async findById(id: string): Promise<DepartmentRow | null> {
    const rows = (await this.sql`
      SELECT
        d.id,
        d.name,
        d.freshteam_id,
        COALESCE(d.is_active, true) AS is_active,
        d.created_at,
        d.updated_at,
        COUNT(e.id)::int AS employee_count
      FROM departments d
      LEFT JOIN employees e
        ON LOWER(e.department) = LOWER(d.name)
        AND e.employment_status NOT IN ('terminated', 'resigned', 'offboarded')
      WHERE d.id = ${id}
      GROUP BY d.id, d.name, d.freshteam_id, d.is_active, d.created_at, d.updated_at
      LIMIT 1
    `) as DepartmentRow[];
    return rows[0] ?? null;
  }

  /** Look up by name (case-insensitive) — used for uniqueness checks. */
  async findByName(name: string): Promise<DepartmentRow | null> {
    const rows = (await this.sql`
      SELECT id, name, freshteam_id, COALESCE(is_active, true) AS is_active, created_at, updated_at, 0 AS employee_count
      FROM departments
      WHERE LOWER(name) = LOWER(${name})
      LIMIT 1
    `) as DepartmentRow[];
    return rows[0] ?? null;
  }

  /** Look up by FreshTeam ID — used for idempotent sync. */
  async findByFreshteamId(freshteamId: string): Promise<DepartmentRow | null> {
    const rows = (await this.sql`
      SELECT id, name, freshteam_id, COALESCE(is_active, true) AS is_active, created_at, updated_at, 0 AS employee_count
      FROM departments
      WHERE freshteam_id = ${freshteamId}
      LIMIT 1
    `) as DepartmentRow[];
    return rows[0] ?? null;
  }

  /** Insert a new department row and return it. */
  async create(data: CreateDepartmentInput): Promise<DepartmentRow> {
    const rows = (await this.sql`
      INSERT INTO departments (name, freshteam_id, is_active)
      VALUES (${data.name}, ${data.freshteamId ?? null}, true)
      RETURNING id, name, freshteam_id, COALESCE(is_active, true) AS is_active, created_at, updated_at, 0 AS employee_count
    `) as DepartmentRow[];
    return rows[0];
  }

  /** Partial update — only supplied fields are changed. */
  async update(id: string, data: UpdateDepartmentInput): Promise<DepartmentRow | null> {
    const rows = (await this.sql`
      UPDATE departments
      SET
        name        = COALESCE(${data.name ?? null},        name),
        freshteam_id = CASE
                        WHEN ${data.freshteamId !== undefined}
                        THEN ${data.freshteamId ?? null}
                        ELSE freshteam_id
                      END,
        is_active   = CASE WHEN ${data.isActive !== undefined} THEN ${data.isActive} ELSE COALESCE(is_active, true) END,
        updated_at  = NOW()
      WHERE id = ${id}
      RETURNING id, name, freshteam_id, COALESCE(is_active, true) AS is_active, created_at, updated_at, 0 AS employee_count
    `) as DepartmentRow[];
    return rows[0] ?? null;
  }

  async updateEmployeeDepartmentName(oldName: string, newName: string): Promise<void> {
    if (!oldName || oldName === newName) return;
    await this.sql`
      UPDATE employees
      SET department = ${newName}, updated_at = NOW()
      WHERE department = ${oldName}
    `;
  }

  /** Soft delete: set is_active = false. Returns true if a row was updated. */
  async softDelete(id: string): Promise<boolean> {
    const rows = (await this.sql`
      UPDATE departments SET is_active = false, updated_at = NOW() WHERE id = ${id} RETURNING id
    `) as { id: string }[];
    return rows.length > 0;
  }

  /** Restore: set is_active = true. Returns true if a row was updated. */
  async restore(id: string): Promise<boolean> {
    const rows = (await this.sql`
      UPDATE departments SET is_active = true, updated_at = NOW() WHERE id = ${id} RETURNING id
    `) as { id: string }[];
    return rows.length > 0;
  }
}

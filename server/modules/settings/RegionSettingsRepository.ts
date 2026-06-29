/**
 * RegionSettingsRepository — read/write helpers for the Multi-Region settings panel.
 *
 * Region model (see migration 0123): branches.region_code is the single source of
 * truth. Employees and users derive their region live from their branch, so
 * re-assigning a branch's region instantly re-scopes everyone in it.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config();
const sql = neon(process.env.DATABASE_URL!);

export interface RegionBranchRow {
  id: string;
  name: string;
  regionCode: string | null;
  isActive: boolean;
  employeeCount: number;
}

export interface RegionRollupRow {
  region_code: string;
  branch_count: number;
  employee_count: number;
  user_count: number;
}

export interface RegionSuperAdminRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export class RegionSettingsRepository {
  /** All branches with their region and live employee count. */
  async listBranchesWithRegion(): Promise<RegionBranchRow[]> {
    const rows = (await sql`
      SELECT b.id, b.name, b.region_code, COALESCE(b.is_active, true) AS is_active,
             (SELECT COUNT(*) FROM employees e WHERE e.branch_id = b.id) AS employee_count
      FROM branches b
      ORDER BY (b.region_code IS NULL), b.region_code, b.name
    `) as {
      id: string;
      name: string;
      region_code: string | null;
      is_active: boolean;
      employee_count: number | string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      regionCode: r.region_code,
      isActive: r.is_active === true || String(r.is_active) === "true",
      employeeCount: Number(r.employee_count) || 0,
    }));
  }

  /** Per-region rollup (branches + employees + users), keyed by region_code. */
  async regionRollup(): Promise<Record<string, RegionRollupRow>> {
    const branchEmp = (await sql`
      SELECT b.region_code,
             COUNT(DISTINCT b.id) AS branch_count,
             COUNT(DISTINCT e.id) AS employee_count
      FROM branches b
      LEFT JOIN employees e ON e.branch_id = b.id
      WHERE b.region_code IS NOT NULL
      GROUP BY b.region_code
    `) as { region_code: string; branch_count: number | string; employee_count: number | string }[];

    const userRows = (await sql`
      SELECT br.region_code, COUNT(DISTINCT u.id) AS user_count
      FROM users u
      LEFT JOIN employees e ON e.id = u.employee_id
      LEFT JOIN branches br ON br.id = COALESCE(u.branch_id, e.branch_id)
      WHERE br.region_code IS NOT NULL
      GROUP BY br.region_code
    `) as { region_code: string; user_count: number | string }[];

    const userByRegion = new Map(userRows.map((u) => [u.region_code, Number(u.user_count) || 0]));
    const out: Record<string, RegionRollupRow> = {};
    for (const r of branchEmp) {
      out[r.region_code] = {
        region_code: r.region_code,
        branch_count: Number(r.branch_count) || 0,
        employee_count: Number(r.employee_count) || 0,
        user_count: userByRegion.get(r.region_code) ?? 0,
      };
    }
    return out;
  }

  /** Super Region admins: explicit grant OR Pakistan-region Admin (automatic). */
  async listSuperRegionAdmins(): Promise<RegionSuperAdminRow[]> {
    const rows = (await sql`
      SELECT u.id, u.email, e.first_name, e.last_name
      FROM users u
      LEFT JOIN employees e ON e.id = u.employee_id
      LEFT JOIN branches b ON b.id = COALESCE(u.branch_id, e.branch_id)
      WHERE COALESCE(u.is_active, true) = true
        AND (
          u.roles @> '["regional_super_admin"]'::jsonb
          OR (
            b.region_code = 'PK'
            AND (u.role = 'admin' OR u.roles::jsonb @> '["admin"]'::jsonb)
          )
        )
      ORDER BY u.email
    `) as { id: string; email: string; first_name: string | null; last_name: string | null }[];
    return rows.map((r) => ({ id: r.id, email: r.email, firstName: r.first_name, lastName: r.last_name }));
  }

  /** Counts of items that fall outside region control (fail-closed: they see nothing). */
  async unassignedCounts(): Promise<{ unassignedBranches: number; usersWithoutBranch: number }> {
    const rows = (await sql`
      SELECT
        (SELECT COUNT(*) FROM branches WHERE region_code IS NULL AND COALESCE(is_active, true) = true) AS unassigned_branches,
        (SELECT COUNT(*) FROM users u
           LEFT JOIN employees e ON e.id = u.employee_id
           WHERE COALESCE(u.branch_id, e.branch_id) IS NULL
             AND COALESCE(u.is_active, true) = true) AS users_without_branch
    `) as { unassigned_branches: number | string; users_without_branch: number | string }[];
    return {
      unassignedBranches: Number(rows[0]?.unassigned_branches) || 0,
      usersWithoutBranch: Number(rows[0]?.users_without_branch) || 0,
    };
  }

  /**
   * Active employees whose resolved region is NULL — either no branch, or a branch
   * that itself has no region. These are fail-closed (they see nothing) until fixed.
   */
  async listEmployeesWithoutRegion(): Promise<
    { id: string; employeeId: string | null; name: string; jobTitle: string | null; department: string | null; branchId: string | null; branchName: string | null }[]
  > {
    const rows = (await sql`
      SELECT e.id, e.employee_id, e.first_name, e.last_name, e.job_title, e.department,
             e.branch_id, b.name AS branch_name, b.region_code
      FROM employees e
      LEFT JOIN branches b ON b.id = e.branch_id
      WHERE e.employment_status IN ('active','onboarding','on_leave')
        AND (e.branch_id IS NULL OR b.region_code IS NULL)
      ORDER BY e.first_name, e.last_name
    `) as {
      id: string;
      employee_id: string | null;
      first_name: string | null;
      last_name: string | null;
      job_title: string | null;
      department: string | null;
      branch_id: string | null;
      branch_name: string | null;
      region_code: string | null;
    }[];
    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || "(unnamed)",
      jobTitle: r.job_title,
      department: r.department,
      branchId: r.branch_id,
      branchName: r.branch_name,
    }));
  }

  /** Count of active employees with no resolved region. */
  async employeesWithoutRegionCount(): Promise<number> {
    const rows = (await sql`
      SELECT COUNT(*) AS c
      FROM employees e
      LEFT JOIN branches b ON b.id = e.branch_id
      WHERE e.employment_status IN ('active','onboarding','on_leave')
        AND (e.branch_id IS NULL OR b.region_code IS NULL)
    `) as { c: number | string }[];
    return Number(rows[0]?.c) || 0;
  }

  /** Assign an employee to a branch (which gives them that branch's region). Returns updated info or null. */
  async setEmployeeBranch(employeeId: string, branchId: string): Promise<{ id: string; name: string; branchId: string; branchName: string; regionCode: string | null } | null> {
    const rows = (await sql`
      UPDATE employees
      SET branch_id = ${branchId}, updated_at = NOW()
      WHERE id = ${employeeId}
      RETURNING id, first_name, last_name, branch_id
    `) as { id: string; first_name: string | null; last_name: string | null; branch_id: string }[];
    const r = rows[0];
    if (!r) return null;
    const b = (await sql`SELECT name, region_code FROM branches WHERE id = ${branchId}`) as { name: string; region_code: string | null }[];
    return {
      id: r.id,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || "(unnamed)",
      branchId: r.branch_id,
      branchName: b[0]?.name ?? "",
      regionCode: b[0]?.region_code ?? null,
    };
  }

  /** True if the branch exists. */
  async branchExists(branchId: string): Promise<boolean> {
    const rows = (await sql`SELECT 1 FROM branches WHERE id = ${branchId} LIMIT 1`) as unknown[];
    return rows.length > 0;
  }

  /** Set (or clear, when regionCode is null) a branch's region. Returns the updated row or null. */
  async setBranchRegion(branchId: string, regionCode: string | null): Promise<{ id: string; name: string; regionCode: string | null } | null> {
    const rows = (await sql`
      UPDATE branches
      SET region_code = ${regionCode}, updated_at = NOW()
      WHERE id = ${branchId}
      RETURNING id, name, region_code
    `) as { id: string; name: string; region_code: string | null }[];
    const r = rows[0];
    return r ? { id: r.id, name: r.name, regionCode: r.region_code } : null;
  }
}

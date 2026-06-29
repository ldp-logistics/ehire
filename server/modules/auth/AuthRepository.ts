import { BaseRepository } from "../../core/base/BaseRepository.js";
import { appendAuditLog } from "../../lib/auditAppend.js";
import { ConflictError } from "../../core/types/index.js";

const PG_UNDEFINED_COLUMN = "42703";

export class AuthRepository extends BaseRepository {
  async findUserByEmail(email: string) {
    try {
      const r = await this.sql`
        SELECT id,email,password_hash,role,roles,employee_id,is_active,allowed_modules,
               must_change_password, totp_secret, totp_pending_secret, totp_enabled, totp_recovery_codes_hash
        FROM users WHERE email=${email}
      ` as any[];
      return r[0] ?? null;
    } catch (e: any) {
      if (e.code === PG_UNDEFINED_COLUMN) {
        try {
          const r2 = await this.sql`SELECT id,email,password_hash,role,roles,employee_id,is_active,allowed_modules FROM users WHERE email=${email}` as any[];
          return r2[0] ?? null;
        } catch (e2: any) {
          if (e2.code === PG_UNDEFINED_COLUMN) {
            const r3 = await this.sql`SELECT id,email,password_hash,role,employee_id,is_active FROM users WHERE email=${email}` as any[];
            return r3[0] ?? null;
          }
          throw e2;
        }
      }
      throw e;
    }
  }

  async findUserById(userId: string) {
    try {
      const r = await this.sql`
        SELECT u.id, u.email, u.role, u.roles, u.employee_id, u.allowed_modules, u.time_zone,
               e.first_name, e.last_name, e.nickname, e.avatar,
               b.time_zone AS branch_time_zone,
               b.date_format AS branch_date_format,
               b.region_code AS branch_region_code
        FROM users u
        LEFT JOIN employees e ON u.employee_id = e.id
        LEFT JOIN branches b ON b.id = COALESCE(u.branch_id, e.branch_id)
        WHERE u.id = ${userId} AND u.is_active = true
      ` as any[];
      return r[0] ?? null;
    } catch (e: any) {
      if (e.code === PG_UNDEFINED_COLUMN) {
        try {
          const r = await this.sql`
            SELECT u.id, u.email, u.role, u.roles, u.employee_id, u.allowed_modules, u.time_zone,
                   e.first_name, e.last_name, e.nickname, e.avatar,
                   b.time_zone AS branch_time_zone
            FROM users u
            LEFT JOIN employees e ON u.employee_id = e.id
            LEFT JOIN branches b ON b.id = e.branch_id
            WHERE u.id = ${userId} AND u.is_active = true
          ` as any[];
          return r[0] ?? null;
        } catch (e2: any) {
          if (e2.code === PG_UNDEFINED_COLUMN) {
            const r = await this.sql`SELECT u.id,u.email,u.role,u.employee_id,u.allowed_modules,e.first_name,e.last_name,e.avatar FROM users u LEFT JOIN employees e ON u.employee_id=e.id WHERE u.id=${userId} AND u.is_active=true` as any[];
            return r[0] ?? null;
          }
          throw e2;
        }
      }
      throw e;
    }
  }

  async updateLastLogin(userId: string) { await this.sql`UPDATE users SET last_login_at=NOW(),updated_at=NOW() WHERE id=${userId}`; }

  /** Resolve a user's region (via own branch_id, else employee's branch) — works for active or inactive users. */
  async getUserRegion(userId: string): Promise<string | null> {
    try {
      const r = await this.sql`
        SELECT b.region_code
        FROM users u
        LEFT JOIN employees e ON e.id = u.employee_id
        LEFT JOIN branches b ON b.id = COALESCE(u.branch_id, e.branch_id)
        WHERE u.id = ${userId}
      ` as { region_code: string | null }[];
      return r[0]?.region_code ?? null;
    } catch (e: any) {
      if (e.code === PG_UNDEFINED_COLUMN) return null;
      throw e;
    }
  }

  /** Grant/revoke the `regional_super_admin` grant in users.roles JSONB (Pakistan Super Region). */
  async setSuperRegionGrant(userId: string, grant: boolean) {
    if (grant) {
      const r = await this.sql`
        UPDATE users
        SET roles = CASE
              WHEN roles @> '["regional_super_admin"]'::jsonb THEN roles
              ELSE COALESCE(roles, '[]'::jsonb) || '["regional_super_admin"]'::jsonb
            END,
            updated_at = NOW()
        WHERE id = ${userId}
        RETURNING id, role, roles
      ` as any[];
      return r[0] ?? null;
    }
    const r = await this.sql`
      UPDATE users
      SET roles = COALESCE(
            (SELECT jsonb_agg(elem) FROM jsonb_array_elements_text(roles) AS elem WHERE elem <> 'regional_super_admin'),
            '[]'::jsonb
          ),
          updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, role, roles
    ` as any[];
    return r[0] ?? null;
  }

  async createUser(
    email: string,
    passwordHash: string | null,
    role: string,
    employeeId: string | null,
    provider: string,
    grantRoles: string[] = [],
    branchId: string | null = null,
  ) {
    try {
      const rj = JSON.stringify(grantRoles);
      // branch_id drives multi-region access. Use the explicit branchId, else
      // derive it from the linked employee's branch (so region is always set).
      const r = await this.sql`
        INSERT INTO users(email,password_hash,role,roles,employee_id,auth_provider,branch_id)
        VALUES(
          ${email},${passwordHash},${role},${rj}::jsonb,${employeeId},${provider},
          COALESCE(${branchId}::varchar, (SELECT branch_id FROM employees WHERE id = ${employeeId}))
        )
        RETURNING id,email,role,employee_id,branch_id
      ` as any[];
      return r[0];
    } catch (e: any) {
      if (e.code === PG_UNDEFINED_COLUMN) {
        const r = await this.sql`INSERT INTO users(email,password_hash,role,employee_id,auth_provider) VALUES(${email},${passwordHash},${role},${employeeId},${provider}) RETURNING id,email,role,employee_id` as any[];
        return r[0];
      }
      throw e;
    }
  }

  /**
   * List users with their resolved region (via own branch_id, else employee's branch).
   * `regions`: null = all (no filter), [] = none (fail-closed), [..] = restrict to those region codes.
   */
  async listUsers(regions?: string[] | null) {
    const cols =
      "u.id,u.email,u.role,u.roles,u.employee_id,u.branch_id,u.is_active,u.last_login_at,u.allowed_modules," +
      "e.first_name,e.last_name,e.job_title,e.department,br.region_code AS region_code";
    const from =
      "FROM users u LEFT JOIN employees e ON e.id=u.employee_id " +
      "LEFT JOIN branches br ON br.id = COALESCE(u.branch_id, e.branch_id)";
    const params: any[] = [];
    let where = "";
    if (regions != null) {
      if (regions.length === 0) {
        where = "WHERE 1=0";
      } else {
        params.push(regions);
        where = `WHERE br.region_code = ANY($${params.length})`;
      }
    }
    const query = `SELECT ${cols} ${from} ${where} ORDER BY u.email`;
    try {
      return this.sql(query, params) as unknown as Promise<any[]>;
    } catch (e: any) {
      if (e.code === PG_UNDEFINED_COLUMN) {
        // Older schema without allowed_modules / branch_id — region filtering unavailable.
        return this.sql`SELECT u.id,u.email,u.role,u.roles,u.employee_id,u.is_active,u.last_login_at,e.first_name,e.last_name,e.job_title,e.department FROM users u LEFT JOIN employees e ON e.id=u.employee_id ORDER BY u.email` as Promise<any[]>;
      }
      throw e;
    }
  }

  async findExistingUser(email: string) { const r = await this.sql`SELECT id FROM users WHERE email=${email}` as any[]; return r[0]??null; }

  async updateUser(id: string, data: { role: string; employeeId: string|null; branchId?: string|null; isActive: boolean; allowedModules: any[]; additionalRoles: string[] }) {
    if (data.branchId !== undefined) {
      await this.sql`
        UPDATE users SET
          role=${data.role},
          roles=${JSON.stringify(data.additionalRoles)}::jsonb,
          employee_id=${data.employeeId},
          branch_id=${data.branchId},
          is_active=${data.isActive},
          allowed_modules=${JSON.stringify(data.allowedModules)}::jsonb,
          updated_at=NOW()
        WHERE id=${id}
      `;
    } else {
      await this.sql`
        UPDATE users SET
          role=${data.role},
          roles=${JSON.stringify(data.additionalRoles)}::jsonb,
          employee_id=${data.employeeId},
          is_active=${data.isActive},
          allowed_modules=${JSON.stringify(data.allowedModules)}::jsonb,
          updated_at=NOW()
        WHERE id=${id}
      `;
    }
  }

  /**
   * `employee_profile_changes.changed_by` FK-references users; reassign before deleting the actor user.
   */
  async reassignEmployeeProfileChangesActor(fromUserId: string, toUserId: string) {
    try {
      await this.sql`
        UPDATE employee_profile_changes SET changed_by = ${toUserId} WHERE changed_by = ${fromUserId}
      `;
    } catch (e: any) {
      if (e?.code === "42P01" || e?.code === "42703") return;
      throw e;
    }
  }

  async deleteUser(id: string) { await this.sql`DELETE FROM users WHERE id=${id}`; }

  /** Count users per primary role (for Settings → Manage roles). */
  async countUsersByRole(): Promise<Array<{ role: string; total: number; active: number }>> {
    const rows = await this.sql`
      SELECT
        role::text AS role,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active IS TRUE)::int AS active
      FROM users
      GROUP BY role
    ` as Array<{ role: string; total: number; active: number }>;
    return rows;
  }

  /** All user accounts — used for Employee role card (Freshteam-style: everyone is an employee baseline). */
  async countAllUsers(): Promise<{ total: number; active: number }> {
    const rows = await this.sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active IS TRUE)::int AS active
      FROM users
    ` as Array<{ total: number; active: number }>;
    const r = rows[0];
    return { total: r?.total ?? 0, active: r?.active ?? 0 };
  }

  /** Users who have a privilege grant (stored primary or in users.roles JSONB). */
  async countUsersWithGrant(grant: string): Promise<{ total: number; active: number }> {
    const tag = JSON.stringify([grant]);
    const rows = await this.sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active IS TRUE)::int AS active
      FROM users
      WHERE role::text = ${grant}
         OR roles::jsonb @> ${tag}::jsonb
    ` as Array<{ total: number; active: number }>;
    const r = rows[0];
    return { total: r?.total ?? 0, active: r?.active ?? 0 };
  }
  async findUserRow(id: string) { const r = await this.sql`SELECT id,email,role,roles,employee_id,branch_id,is_active,allowed_modules FROM users WHERE id=${id}` as any[]; return r[0]??null; }

  /** True if user is linked to at least one job (hiring manager / limited recruiter / etc.). Used for nav visibility. */
  async hasAnyJobAssignment(userId: string): Promise<boolean> {
    try {
      const rows = await this.sql`
        SELECT 1 FROM job_assignments WHERE user_id = ${userId} LIMIT 1
      ` as unknown[];
      return Array.isArray(rows) && rows.length > 0;
    } catch (e: any) {
      if (e?.code === "42P01" || e?.code === "42703") return false;
      throw e;
    }
  }
  async updateTimezone(userId: string, tz: string|null) {
    try { await this.sql`UPDATE users SET time_zone=${tz},updated_at=NOW() WHERE id=${userId}`; } catch (e: any) { if (e.code !== PG_UNDEFINED_COLUMN) throw e; }
  }
  async updatePasswordHash(userId: string, hash: string) { await this.sql`UPDATE users SET password_hash=${hash},updated_at=NOW() WHERE id=${userId}`; }

  /** Break-glass: set password and clear must_change_password when column exists. */
  async updatePasswordHashBreakGlass(userId: string, hash: string, clearMustChange: boolean) {
    try {
      if (clearMustChange) {
        await this.sql`UPDATE users SET password_hash=${hash}, must_change_password=false, updated_at=NOW() WHERE id=${userId}`;
      } else {
        await this.sql`UPDATE users SET password_hash=${hash}, updated_at=NOW() WHERE id=${userId}`;
      }
    } catch (e: any) {
      if (e.code === PG_UNDEFINED_COLUMN) await this.updatePasswordHash(userId, hash);
      else throw e;
    }
  }

  async setTotpPendingSecret(userId: string, secret: string | null) {
    try {
      await this.sql`UPDATE users SET totp_pending_secret=${secret}, updated_at=NOW() WHERE id=${userId}`;
    } catch (e: any) {
      if (e.code !== PG_UNDEFINED_COLUMN) throw e;
    }
  }

  async finalizeTotpEnrollment(userId: string, recoveryHashes: string[]) {
    const codesJson = JSON.stringify(recoveryHashes);
    await this.sql`
      UPDATE users SET
        totp_secret = totp_pending_secret,
        totp_pending_secret = NULL,
        totp_enabled = true,
        totp_recovery_codes_hash = ${codesJson}::jsonb,
        updated_at = NOW()
      WHERE id = ${userId}
    `;
  }

  async updateTotpRecoveryHashes(userId: string, hashes: string[]) {
    const codesJson = JSON.stringify(hashes);
    try {
      await this.sql`UPDATE users SET totp_recovery_codes_hash=${codesJson}::jsonb, updated_at=NOW() WHERE id=${userId}`;
    } catch (e: any) {
      if (e.code !== PG_UNDEFINED_COLUMN) throw e;
    }
  }

  async getBreakGlassSecurityRow(userId: string): Promise<{
    totp_secret: string | null;
    totp_pending_secret: string | null;
    totp_enabled: boolean;
    totp_recovery_codes_hash: string[] | null;
  } | null> {
    try {
      const r = await this.sql`
        SELECT totp_secret, totp_pending_secret, totp_enabled, totp_recovery_codes_hash
        FROM users WHERE id=${userId}
      ` as any[];
      const row = r[0];
      if (!row) return null;
      const raw = row.totp_recovery_codes_hash;
      const hashes = Array.isArray(raw) ? raw.map((x: unknown) => String(x)) : [];
      return {
        totp_secret: row.totp_secret ?? null,
        totp_pending_secret: row.totp_pending_secret ?? null,
        totp_enabled: row.totp_enabled === true || row.totp_enabled === "true",
        totp_recovery_codes_hash: hashes,
      };
    } catch (e: any) {
      if (e.code === PG_UNDEFINED_COLUMN) return null;
      throw e;
    }
  }
  async findPasswordHash(userId: string) { const r = await this.sql`SELECT id,password_hash FROM users WHERE id=${userId}` as any[]; return r[0]??null; }

  async findEmployeeByEmail(email: string) { const r = await this.sql`SELECT id FROM employees WHERE LOWER(TRIM(work_email))=${email} OR (personal_email IS NOT NULL AND LOWER(TRIM(personal_email))=${email}) LIMIT 1` as any[]; return r[0]??null; }
  async findEmployeeByWorkEmail(email: string) { const r = await this.sql`SELECT id FROM employees WHERE LOWER(TRIM(work_email))=${email} LIMIT 1` as any[]; return r[0]??null; }
  async findUserByEmployeeId(employeeId: string) { const r = await this.sql`SELECT id,email,role,employee_id,is_active FROM users WHERE employee_id=${employeeId} LIMIT 1` as any[]; return r[0]??null; }
  async linkEmployeeToUser(userId: string, employeeId: string) { await this.sql`UPDATE users SET employee_id=${employeeId},updated_at=NOW() WHERE id=${userId}`; }

  /**
   * When an employee's work email changes, keep the linked login user in sync (Settings → User Access).
   * Matches by users.employee_id first, then falls back to the previous work email.
   */
  async syncUserEmailForEmployee(
    employeeId: string,
    newEmail: string,
    oldEmail?: string | null,
  ): Promise<void> {
    const newNorm = String(newEmail ?? "").trim().toLowerCase();
    if (!newNorm) return;

    let rows = (await this.sql`
      SELECT id, email, employee_id FROM users WHERE employee_id = ${employeeId} LIMIT 1
    `) as { id: string; email: string; employee_id: string | null }[];

    const oldNorm = String(oldEmail ?? "").trim().toLowerCase();
    if (rows.length === 0 && oldNorm) {
      rows = (await this.sql`
        SELECT id, email, employee_id FROM users WHERE LOWER(TRIM(email)) = ${oldNorm} LIMIT 1
      `) as { id: string; email: string; employee_id: string | null }[];
    }
    if (rows.length === 0) return;

    const user = rows[0];
    const currentNorm = String(user.email ?? "").trim().toLowerCase();
    if (currentNorm === newNorm) {
      if (user.employee_id !== employeeId) {
        await this.sql`UPDATE users SET employee_id = ${employeeId}, updated_at = NOW() WHERE id = ${user.id}`;
      }
      return;
    }

    const conflict = (await this.sql`
      SELECT id FROM users WHERE LOWER(TRIM(email)) = ${newNorm} AND id != ${user.id} LIMIT 1
    `) as { id: string }[];
    if (conflict.length > 0) {
      throw new ConflictError("This work email is already used by another user account");
    }

    const employeeOwner = (await this.sql`
      SELECT id FROM users WHERE employee_id = ${employeeId} AND id != ${user.id} LIMIT 1
    `) as { id: string }[];
    if (employeeOwner.length > 0) {
      // Another login already owns this employee — update that account's email instead.
      await this.sql`
        UPDATE users SET email = ${newNorm}, updated_at = NOW() WHERE id = ${employeeOwner[0].id}
      `;
      return;
    }

    await this.sql`
      UPDATE users
      SET email = ${newNorm},
          employee_id = COALESCE(employee_id, ${employeeId}),
          updated_at = NOW()
      WHERE id = ${user.id}
    `;
  }
  async syncMicrosoftUser(userId: string, email: string) {
    try { await this.sql`UPDATE users SET email=${email},auth_provider='microsoft',sso_provider='microsoft',last_login_at=NOW(),updated_at=NOW() WHERE id=${userId}`; }
    catch { await this.sql`UPDATE users SET email=${email},sso_provider='microsoft',last_login_at=NOW(),updated_at=NOW() WHERE id=${userId}`; }
  }

  /** Save Microsoft OAuth tokens for delegated Graph (e.g. create meeting as user). */
  async saveMicrosoftTokens(
    userId: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: Date
  ) {
    try {
      await this.sql`
        UPDATE users
        SET microsoft_access_token = ${accessToken},
            microsoft_refresh_token = ${refreshToken},
            microsoft_token_expires_at = ${expiresAt.toISOString()},
            updated_at = NOW()
        WHERE id = ${userId}
      `;
    } catch (e: any) {
      if (e?.code === "42703") return; // column not yet migrated
      throw e;
    }
  }

  /** Get stored Microsoft tokens for a user (for refresh / delegated API). */
  async getMicrosoftTokens(userId: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  } | null> {
    try {
      const r = await this.sql`
        SELECT microsoft_access_token AS access_token, microsoft_refresh_token AS refresh_token, microsoft_token_expires_at AS expires_at
        FROM users WHERE id = ${userId}
      ` as any[];
      const row = r[0];
      if (!row?.refresh_token) return null;
      return {
        accessToken: row.access_token || "",
        refreshToken: row.refresh_token,
        expiresAt: row.expires_at ? new Date(row.expires_at) : new Date(0),
      };
    } catch (e: any) {
      if (e?.code === "42703") return null;
      throw e;
    }
  }

  async saveMicrosoftCalendarTokens(
    userId: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: Date,
  ) {
    try {
      await this.sql`
        UPDATE users
        SET microsoft_calendar_access_token = ${accessToken},
            microsoft_calendar_refresh_token = ${refreshToken},
            microsoft_calendar_token_expires_at = ${expiresAt.toISOString()},
            updated_at = NOW()
        WHERE id = ${userId}
      `;
    } catch (e: any) {
      if (e?.code === "42703") return;
      throw e;
    }
  }

  async clearMicrosoftCalendarTokens(userId: string): Promise<void> {
    try {
      await this.sql`
        UPDATE users
        SET microsoft_calendar_access_token = NULL,
            microsoft_calendar_refresh_token = NULL,
            microsoft_calendar_token_expires_at = NULL,
            updated_at = NOW()
        WHERE id = ${userId}
      `;
    } catch (e: any) {
      if (e?.code === "42703") return;
      throw e;
    }
  }

  async getMicrosoftCalendarTokens(userId: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  } | null> {
    try {
      const r = await this.sql`
        SELECT microsoft_calendar_access_token AS access_token,
               microsoft_calendar_refresh_token AS refresh_token,
               microsoft_calendar_token_expires_at AS expires_at
        FROM users WHERE id = ${userId}
      ` as any[];
      const row = r[0];
      if (!row?.refresh_token) return null;
      return {
        accessToken: row.access_token || "",
        refreshToken: row.refresh_token,
        expiresAt: row.expires_at ? new Date(row.expires_at) : new Date(0),
      };
    } catch (e: any) {
      if (e?.code === "42703") return null;
      throw e;
    }
  }

  /**
   * Write an audit event. Tries the canonical audit_logs table first,
   * falls back to the recruitment-module audit_log table if available,
   * and silently ignores failures (missing table, column, etc.) so callers never blow up.
   */
  async insertAuditLog(entry: {
    entity: string;
    entityId: string;
    action: string;
    performedBy: string;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    await appendAuditLog({
      entityType: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      performedBy: entry.performedBy,
      details: entry.details,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
    });
  }

  async createMicrosoftUser(email: string, employeeId: string|null) {
    try {
      const r = await this.sql`INSERT INTO users(email,role,roles,employee_id,is_active,auth_provider,sso_provider) VALUES(${email},'employee','[]'::jsonb,${employeeId},true,'microsoft','microsoft') RETURNING id,email,role,employee_id,is_active` as any[];
      return r[0];
    } catch {
      try {
        const r = await this.sql`INSERT INTO users(email,role,roles,employee_id,is_active,sso_provider) VALUES(${email},'employee','[]'::jsonb,${employeeId},true,'microsoft') RETURNING id,email,role,employee_id,is_active` as any[];
        return r[0];
      } catch {
        const r = await this.sql`INSERT INTO users(email,role,employee_id,is_active,sso_provider) VALUES(${email},'employee',${employeeId},true,'microsoft') RETURNING id,email,role,employee_id,is_active` as any[];
        return r[0];
      }
    }
  }
}

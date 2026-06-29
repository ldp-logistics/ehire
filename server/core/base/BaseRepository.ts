/**
 * BaseRepository — all domain repositories extend this.
 *
 * Provides:
 *   • A shared Neon SQL client (lazily reads DATABASE_URL at call time).
 *   • Common SQL-building helpers (like pattern, pagination).
 *
 * Do NOT add business logic here. Business rules belong in the Service layer.
 *
 * Extending example:
 *   export class DepartmentRepository extends BaseRepository {
 *     async findAll(params: PaginationParams) { … }
 *   }
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { PaginationParams } from "../types/index.js";

/** One shared Neon client per process — avoids extra driver setup per repository instance. */
let sharedSql: NeonQueryFunction<false, false> | null = null;
function getSharedSql(): NeonQueryFunction<false, false> {
  if (!sharedSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL environment variable is not set");
    sharedSql = neon(url);
  }
  return sharedSql;
}

export abstract class BaseRepository {
  protected readonly sql: NeonQueryFunction<false, false>;

  constructor() {
    this.sql = getSharedSql();
  }

  /**
   * Escape special LIKE metacharacters in a user-supplied search string.
   * Returns the pattern wrapped in % … % ready to pass to ILIKE.
   */
  protected likePattern(search: string): string {
    return `%${search.replace(/[%_\\]/g, "\\$&")}%`;
  }

  /**
   * Returns a simple LIMIT / OFFSET fragment.
   * Only call this after sanitizing params via parsePagination().
   */
  protected paginationClause(params: PaginationParams): string {
    return `LIMIT ${params.limit} OFFSET ${params.offset}`;
  }

  /**
   * Fire-and-forget audit log entry. Never throws — failures are console.warn'd only.
   * Uses the shared recruitment_audit_log table for all recruitment-adjacent actions.
   */
  async auditLog(
    entityType: string,
    entityId: string,
    action: string,
    performedBy: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.sql`INSERT INTO recruitment_audit_log(entity_type,entity_id,action,performed_by,metadata) VALUES(${entityType},${entityId},${action},${performedBy},${metadata ? JSON.stringify(metadata) : null})`;
    } catch (e) {
      console.warn("[audit] Failed to write audit log:", (e as Error)?.message);
    }
  }
}

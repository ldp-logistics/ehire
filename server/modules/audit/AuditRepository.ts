import { BaseRepository } from "../../core/base/BaseRepository.js";

export type AuditLogRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  performed_by: string;
  details: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  performer_email: string | null;
};

export type AuditListFilters = {
  entityType: string | null;
  action: string | null;
  performedBy: string | null;
  q: string | null;
  from: string | null;
  to: string | null;
  limit: number;
  offset: number;
};

export class AuditRepository extends BaseRepository {
  async count(filters: AuditListFilters): Promise<number> {
    const entityType = filters.entityType?.trim() || null;
    const action = filters.action?.trim() || null;
    const performedBy = filters.performedBy?.trim() || null;
    const from = filters.from?.trim() || null;
    const to = filters.to?.trim() || null;
    const q = (filters.q || "").trim();
    const qPat = q.length > 0 ? this.likePattern(q) : null;

    const r = (await this.sql`
      SELECT COUNT(*)::int AS c
      FROM audit_logs a
      LEFT JOIN users u ON u.id::text = a.performed_by
      WHERE
        (${entityType}::text IS NULL OR a.entity_type = ${entityType})
        AND (${action}::text IS NULL OR a.action = ${action})
        AND (${performedBy}::text IS NULL OR a.performed_by = ${performedBy})
        AND (${from}::text IS NULL OR a.created_at >= ${from}::timestamptz)
        AND (${to}::text IS NULL OR a.created_at <= ${to}::timestamptz)
        AND (
          ${qPat}::text IS NULL
          OR a.entity_type ILIKE ${qPat}
          OR a.action ILIKE ${qPat}
          OR a.entity_id ILIKE ${qPat}
          OR a.performed_by ILIKE ${qPat}
          OR COALESCE(a.ip_address, '') ILIKE ${qPat}
          OR COALESCE(u.email, '') ILIKE ${qPat}
          OR a.details::text ILIKE ${qPat}
        )
    `) as { c: number }[];
    return r[0]?.c ?? 0;
  }

  async list(filters: AuditListFilters): Promise<AuditLogRow[]> {
    const entityType = filters.entityType?.trim() || null;
    const action = filters.action?.trim() || null;
    const performedBy = filters.performedBy?.trim() || null;
    const from = filters.from?.trim() || null;
    const to = filters.to?.trim() || null;
    const q = (filters.q || "").trim();
    const qPat = q.length > 0 ? this.likePattern(q) : null;
    const limit = filters.limit;
    const offset = filters.offset;

    return this.sql`
      SELECT
        a.id,
        a.entity_type,
        a.entity_id,
        a.action,
        a.performed_by,
        a.details,
        a.ip_address,
        a.user_agent,
        a.created_at::text,
        u.email AS performer_email
      FROM audit_logs a
      LEFT JOIN users u ON u.id::text = a.performed_by
      WHERE
        (${entityType}::text IS NULL OR a.entity_type = ${entityType})
        AND (${action}::text IS NULL OR a.action = ${action})
        AND (${performedBy}::text IS NULL OR a.performed_by = ${performedBy})
        AND (${from}::text IS NULL OR a.created_at >= ${from}::timestamptz)
        AND (${to}::text IS NULL OR a.created_at <= ${to}::timestamptz)
        AND (
          ${qPat}::text IS NULL
          OR a.entity_type ILIKE ${qPat}
          OR a.action ILIKE ${qPat}
          OR a.entity_id ILIKE ${qPat}
          OR a.performed_by ILIKE ${qPat}
          OR COALESCE(a.ip_address, '') ILIKE ${qPat}
          OR COALESCE(u.email, '') ILIKE ${qPat}
          OR a.details::text ILIKE ${qPat}
        )
      ORDER BY a.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    ` as unknown as Promise<AuditLogRow[]>;
  }
}

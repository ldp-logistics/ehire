import { AuditRepository, type AuditLogRow, type AuditListFilters } from "./AuditRepository.js";

function parseLimit(raw: string | undefined, fallback: number, cap: number): number {
  const n = parseInt(String(raw ?? ""), 10);
  if (Number.isNaN(n)) return Math.min(fallback, cap);
  return Math.min(Math.max(n, 1), cap);
}

function parseOffset(raw: string | undefined): number {
  const n = parseInt(String(raw ?? ""), 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, n);
}

export class AuditService {
  private readonly repo = new AuditRepository();

  private buildFilters(query: Record<string, unknown>, limitCap: number): AuditListFilters {
    const entityType = typeof query.entityType === "string" ? query.entityType : null;
    const action = typeof query.action === "string" ? query.action : null;
    const performedBy = typeof query.performedBy === "string" ? query.performedBy : null;
    const q = typeof query.q === "string" ? query.q : null;
    const from = typeof query.from === "string" ? query.from : null;
    const to = typeof query.to === "string" ? query.to : null;
    const limit = parseLimit(query.limit as string | undefined, 50, limitCap);
    const offset = parseOffset(query.offset as string | undefined);
    return { entityType, action, performedBy, q, from, to, limit, offset };
  }

  async list(query: Record<string, unknown>) {
    const filtersI = this.buildFilters(query, 200);
    const [total, rows] = await Promise.all([this.repo.count(filtersI), this.repo.list(filtersI)]);
    return {
      total,
      limit: filtersI.limit,
      offset: filtersI.offset,
      logs: rows.map((r: AuditLogRow) => ({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        action: r.action,
        performedBy: r.performed_by,
        performerEmail: r.performer_email,
        details: r.details,
        ipAddress: r.ip_address,
        userAgent: r.user_agent,
        createdAt: r.created_at,
      })),
    };
  }

  /** Same filters as list; larger cap for export. */
  async exportRows(query: Record<string, unknown>): Promise<AuditLogRow[]> {
    const filters = this.buildFilters(query, 10_000);
    filters.offset = 0;
    filters.limit = parseLimit(query.limit as string | undefined, 10_000, 10_000);
    return this.repo.list(filters);
  }
}

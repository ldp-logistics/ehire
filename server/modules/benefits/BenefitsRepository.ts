import { BaseRepository } from "../../core/base/BaseRepository.js";
import type { BenefitCustomField } from "../../../shared/benefitFields.js";
import { appendEffectiveRegionFilter } from "../../lib/employeeRegionSql.js";

export class BenefitsRepository extends BaseRepository {

  // ── Benefit Cards ──────────────────────────────────────────────────────────

  async listCards(includeInactive = false, regions?: string[] | null): Promise<any[]> {
    // Benefits cards are always region-scoped; null/empty = nothing (fail-closed).
    if (regions == null || regions.length === 0) return [];
    const whereConds: string[] = [];
    const params: unknown[] = [];
    if (!includeInactive) whereConds.push("bc.is_active = true");
    params.push(regions);
    whereConds.push(`bc.region_code = ANY($${params.length})`);
    const where = whereConds.length ? `WHERE ${whereConds.join(" AND ")}` : "";
    return this.sql(
      `SELECT bc.*,
              COUNT(bca.id) FILTER (WHERE bca.status = 'active') AS assignment_count
       FROM benefit_cards bc
       LEFT JOIN benefit_card_assignments bca ON bca.benefit_card_id = bc.id
       ${where}
       GROUP BY bc.id
       ORDER BY bc.created_at DESC`,
      params,
    ) as Promise<any[]>;
  }

  async getCard(id: string): Promise<any | null> {
    const rows = await this.sql`
      SELECT bc.*,
             COUNT(bca.id) FILTER (WHERE bca.status = 'active') AS assignment_count
      FROM benefit_cards bc
      LEFT JOIN benefit_card_assignments bca ON bca.benefit_card_id = bc.id
      WHERE bc.id = ${id}
      GROUP BY bc.id
    ` as any[];
    return rows[0] ?? null;
  }

  async createCard(data: {
    title: string;
    category: string;
    provider?: string | null;
    description?: string | null;
    validFrom?: string | null;
    validUntil?: string | null;
    documentUrl?: string | null;
    customFields?: BenefitCustomField[];
    regionCode: string;
  }, createdBy: string, createdByName: string): Promise<any> {
    const fieldsJson = JSON.stringify(data.customFields ?? []);
    const rows = await this.sql`
      INSERT INTO benefit_cards
        (title, category, provider, description, valid_from, valid_until, document_url, custom_fields, region_code, created_by, created_by_name)
      VALUES (
        ${data.title},
        ${data.category ?? "medical"},
        ${data.provider ?? null},
        ${data.description ?? null},
        ${data.validFrom ? new Date(data.validFrom).toISOString() : null},
        ${data.validUntil ? new Date(data.validUntil).toISOString() : null},
        ${data.documentUrl ?? null},
        ${fieldsJson}::jsonb,
        ${data.regionCode},
        ${createdBy},
        ${createdByName}
      ) RETURNING *
    ` as any[];
    return rows[0];
  }

  async updateCard(id: string, data: {
    title?: string;
    category?: string;
    provider?: string | null;
    description?: string | null;
    validFrom?: string | null;
    validUntil?: string | null;
    documentUrl?: string | null;
    isActive?: boolean;
    customFields?: BenefitCustomField[];
  }): Promise<any | null> {
    const current = await this.getCard(id);
    if (!current) return null;
    const fieldsJson = data.customFields !== undefined
      ? JSON.stringify(data.customFields)
      : JSON.stringify(current.custom_fields ?? []);
    const rows = await this.sql`
      UPDATE benefit_cards SET
        title        = ${data.title        ?? current.title},
        category     = ${data.category     ?? current.category},
        provider     = ${data.provider     !== undefined ? data.provider     : current.provider},
        description  = ${data.description  !== undefined ? data.description  : current.description},
        valid_from   = ${data.validFrom    !== undefined ? (data.validFrom    ? new Date(data.validFrom).toISOString()    : null) : current.valid_from},
        valid_until  = ${data.validUntil   !== undefined ? (data.validUntil   ? new Date(data.validUntil).toISOString()   : null) : current.valid_until},
        document_url = ${data.documentUrl  !== undefined ? data.documentUrl  : current.document_url},
        custom_fields= ${fieldsJson}::jsonb,
        is_active    = ${data.isActive     !== undefined ? data.isActive     : current.is_active},
        updated_at   = NOW()
      WHERE id = ${id} RETURNING *
    ` as any[];
    return rows[0] ?? null;
  }

  async deleteCard(id: string): Promise<boolean> {
    const rows = await this.sql`DELETE FROM benefit_cards WHERE id = ${id} RETURNING id` as any[];
    return rows.length > 0;
  }

  // ── Assignments ────────────────────────────────────────────────────────────

  async getCardAssignments(cardId: string, regions?: string[] | null): Promise<any[]> {
    if (regions != null && regions.length === 0) return [];
    const conds = ["bca.benefit_card_id = $1", "bca.status = 'active'"];
    const params: unknown[] = [cardId];
    appendEffectiveRegionFilter(regions, "e", "b", conds, params);
    return this.sql(
      `SELECT bca.*,
              e.first_name, e.last_name, e.work_email, e.job_title, e.department, e.avatar
       FROM benefit_card_assignments bca
       JOIN employees e ON bca.employee_id = e.id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE ${conds.join(" AND ")}
       ORDER BY e.first_name, e.last_name`,
      params,
    ) as Promise<any[]>;
  }

  async getEmployeeBenefits(employeeId: string, regionCode: string): Promise<any[]> {
    return this.sql`
      SELECT bca.*,
             bc.title, bc.category, bc.provider, bc.description,
             bc.valid_from, bc.valid_until, bc.document_url, bc.custom_fields, bc.is_active, bc.region_code
      FROM benefit_card_assignments bca
      JOIN benefit_cards bc ON bca.benefit_card_id = bc.id
      WHERE bca.employee_id = ${employeeId}
        AND bca.status = 'active'
        AND bc.is_active = true
        AND bc.region_code = ${regionCode}
      ORDER BY bc.category, bc.title
    ` as Promise<any[]>;
  }

  async findAssignment(cardId: string, employeeId: string): Promise<any | null> {
    const rows = await this.sql`
      SELECT * FROM benefit_card_assignments
      WHERE benefit_card_id = ${cardId} AND employee_id = ${employeeId}
      LIMIT 1
    ` as any[];
    return rows[0] ?? null;
  }

  async findAssignmentById(id: string): Promise<any | null> {
    const rows = await this.sql`SELECT * FROM benefit_card_assignments WHERE id = ${id} LIMIT 1` as any[];
    return rows[0] ?? null;
  }

  async addAssignment(cardId: string, employeeId: string, data: {
    cardNumber?: string | null;
    notes?: string | null;
  }, assignedBy: string, assignedByName: string): Promise<any> {
    // Upsert: if removed previously, reactivate
    const existing = await this.findAssignment(cardId, employeeId);
    if (existing) {
      const rows = await this.sql`
        UPDATE benefit_card_assignments SET
          status           = 'active',
          card_number      = ${data.cardNumber ?? existing.card_number},
          notes            = ${data.notes ?? existing.notes},
          assigned_by      = ${assignedBy},
          assigned_by_name = ${assignedByName},
          assigned_at      = NOW()
        WHERE id = ${existing.id} RETURNING *
      ` as any[];
      return rows[0];
    }
    const rows = await this.sql`
      INSERT INTO benefit_card_assignments
        (benefit_card_id, employee_id, card_number, notes, assigned_by, assigned_by_name)
      VALUES (${cardId}, ${employeeId}, ${data.cardNumber ?? null}, ${data.notes ?? null}, ${assignedBy}, ${assignedByName})
      RETURNING *
    ` as any[];
    return rows[0];
  }

  async updateAssignment(id: string, data: {
    cardNumber?: string | null;
    notes?: string | null;
    status?: string;
  }): Promise<any | null> {
    const existing = await this.findAssignmentById(id);
    if (!existing) return null;
    const rows = await this.sql`
      UPDATE benefit_card_assignments SET
        card_number = ${data.cardNumber !== undefined ? data.cardNumber : existing.card_number},
        notes       = ${data.notes      !== undefined ? data.notes      : existing.notes},
        status      = ${data.status     !== undefined ? data.status     : existing.status}
      WHERE id = ${id} RETURNING *
    ` as any[];
    return rows[0] ?? null;
  }

  async removeAssignment(id: string): Promise<boolean> {
    const rows = await this.sql`
      UPDATE benefit_card_assignments SET status = 'removed'
      WHERE id = ${id} RETURNING id
    ` as any[];
    return rows.length > 0;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  async resolveUserName(userId: string): Promise<string> {
    const rows = await this.sql`
      SELECT u.email, e.first_name, e.last_name
      FROM users u LEFT JOIN employees e ON u.employee_id = e.id
      WHERE u.id = ${userId}
    ` as any[];
    if (!rows[0]) return "Unknown";
    return rows[0].first_name ? `${rows[0].first_name} ${rows[0].last_name}` : rows[0].email;
  }
}

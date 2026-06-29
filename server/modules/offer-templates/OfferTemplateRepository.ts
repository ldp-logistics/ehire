import { BaseRepository } from "../../core/base/BaseRepository.js";

export interface OfferTemplateRow {
  id: string;
  name: string;
  description: string | null;
  docx_data: string | null;
  docx_filename: string;
  placeholders: string[];
  is_active: boolean;
  version: number;
  template_type: "docx" | "pdf_form";
  pdf_template_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export class OfferTemplateRepository extends BaseRepository {
  async list(includeInactive = false): Promise<Omit<OfferTemplateRow, "docx_data">[]> {
    const rows = includeInactive
      ? ((await this.sql`SELECT id, name, description, docx_filename, placeholders, is_active, version, template_type, pdf_template_url, created_by, created_at, updated_at FROM offer_templates ORDER BY name`) as any[])
      : ((await this.sql`SELECT id, name, description, docx_filename, placeholders, is_active, version, template_type, pdf_template_url, created_by, created_at, updated_at FROM offer_templates WHERE is_active = true ORDER BY name`) as any[]);
    return rows.map((r) => ({ ...r, placeholders: r.placeholders ?? [], template_type: r.template_type ?? "docx" }));
  }

  async getById(id: string): Promise<OfferTemplateRow | null> {
    const rows = (await this.sql`SELECT * FROM offer_templates WHERE id = ${id}`) as OfferTemplateRow[];
    if (!rows.length) return null;
    return {
      ...rows[0],
      placeholders: rows[0].placeholders ?? [],
      template_type: rows[0].template_type ?? "docx",
    };
  }

  async create(d: {
    name: string;
    description?: string | null;
    docxData: string | null;
    docxFilename: string;
    placeholders: string[];
    createdBy: string | null;
    templateType?: "docx" | "pdf_form";
    pdfTemplateUrl?: string | null;
  }): Promise<OfferTemplateRow> {
    const templateType = d.templateType ?? "docx";
    const pdfUrl = d.pdfTemplateUrl ?? null;
    const rows = (await this.sql`
      INSERT INTO offer_templates (name, description, docx_data, docx_filename, placeholders, created_by, template_type, pdf_template_url)
      VALUES (${d.name}, ${d.description || null}, ${d.docxData}, ${d.docxFilename}, ${JSON.stringify(d.placeholders)}, ${d.createdBy}, ${templateType}, ${pdfUrl})
      RETURNING *
    `) as OfferTemplateRow[];
    return rows[0];
  }

  async update(
    id: string,
    d: {
      name?: string;
      description?: string | null;
      docxData?: string;
      docxFilename?: string;
      placeholders?: string[];
      isActive?: boolean;
    },
  ): Promise<OfferTemplateRow | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    const newVersion = d.docxData ? existing.version + 1 : existing.version;
    const rows = (await this.sql`
      UPDATE offer_templates SET
        name = COALESCE(${d.name ?? null}, name),
        description = COALESCE(${d.description !== undefined ? d.description : null}, description),
        docx_data = COALESCE(${d.docxData ?? null}, docx_data),
        docx_filename = COALESCE(${d.docxFilename ?? null}, docx_filename),
        placeholders = COALESCE(${d.placeholders ? JSON.stringify(d.placeholders) : null}, placeholders),
        is_active = COALESCE(${d.isActive !== undefined ? d.isActive : null}, is_active),
        version = ${newVersion},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `) as OfferTemplateRow[];
    return rows.length ? { ...rows[0], template_type: rows[0].template_type ?? "docx" } : null;
  }

  /** Attach (or replace) the AcroForm PDF template for an existing offer template. */
  async setPdfTemplate(
    id: string,
    pdfTemplateUrl: string,
  ): Promise<OfferTemplateRow | null> {
    const rows = (await this.sql`
      UPDATE offer_templates SET
        pdf_template_url = ${pdfTemplateUrl},
        template_type    = 'pdf_form',
        version          = version + 1,
        updated_at       = NOW()
      WHERE id = ${id}
      RETURNING *
    `) as OfferTemplateRow[];
    return rows.length ? { ...rows[0], template_type: "pdf_form" } : null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = (await this.sql`DELETE FROM offer_templates WHERE id = ${id} RETURNING id`) as any[];
    return rows.length > 0;
  }
}

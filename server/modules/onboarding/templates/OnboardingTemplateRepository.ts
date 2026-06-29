import { BaseRepository } from "../../../core/base/BaseRepository.js";

export interface TemplateRow {
  id: string; name: string; description: string | null; department: string | null;
  is_active: boolean; created_by_id: string | null; created_at: Date; updated_at: Date;
}
export interface TemplateSectionRow {
  id: string; template_id: string; name: string; description: string | null;
  sort_order: number; created_at: Date;
}
export interface TemplateTaskRow {
  id: string; section_id: string; task_name: string; sort_order: number; created_at: Date;
  requires_assignment?: boolean;
}
export interface TemplateSectionAssigneeRow {
  id: string;
  section_id: string;
  employee_id: string;
  created_at: Date;
  first_name: string;
  last_name: string;
  avatar: string | null;
}

export class OnboardingTemplateRepository extends BaseRepository {

  // ── Templates ────────────────────────────────────────────────────────────────

  // Templates are global (no region_code) — same checklist library for every region.
  async findAll(): Promise<TemplateRow[]> {
    return this.sql`
      SELECT * FROM onboarding_templates WHERE is_active = true ORDER BY name ASC
    ` as unknown as Promise<TemplateRow[]>;
  }

  async findById(id: string): Promise<TemplateRow | null> {
    const r = await this.sql`SELECT * FROM onboarding_templates WHERE id = ${id}` as TemplateRow[];
    return r[0] ?? null;
  }

  async create(name: string, description: string | null, department: string | null, createdById: string | null): Promise<TemplateRow> {
    const r = await this.sql`
      INSERT INTO onboarding_templates (name, description, department, created_by_id)
      VALUES (${name}, ${description}, ${department}, ${createdById}) RETURNING *
    ` as TemplateRow[];
    return r[0];
  }

  async update(id: string, fields: { name?: string; description?: string | null; department?: string | null; is_active?: boolean }): Promise<TemplateRow | null> {
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.name !== undefined)        { vals.push(fields.name);        sets.push(`name=$${vals.length}`); }
    if (fields.description !== undefined) { vals.push(fields.description); sets.push(`description=$${vals.length}`); }
    if (fields.department !== undefined)  { vals.push(fields.department);  sets.push(`department=$${vals.length}`); }
    if (fields.is_active !== undefined)   { vals.push(fields.is_active);   sets.push(`is_active=$${vals.length}`); }
    if (!sets.length) return this.findById(id);
    vals.push(id);
    const r = await this.sql(`UPDATE onboarding_templates SET ${sets.join(",")},updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals) as TemplateRow[];
    return r[0] ?? null;
  }

  async softDelete(id: string): Promise<void> {
    await this.sql`UPDATE onboarding_templates SET is_active = false, updated_at = NOW() WHERE id = ${id}`;
  }

  // ── Sections ─────────────────────────────────────────────────────────────────

  async findSections(templateId: string): Promise<TemplateSectionRow[]> {
    return this.sql`
      SELECT * FROM onboarding_template_sections WHERE template_id = ${templateId} ORDER BY sort_order ASC, created_at ASC
    ` as unknown as Promise<TemplateSectionRow[]>;
  }

  async findSectionById(sectionId: string): Promise<TemplateSectionRow | null> {
    const r = await this.sql`SELECT * FROM onboarding_template_sections WHERE id = ${sectionId}` as TemplateSectionRow[];
    return r[0] ?? null;
  }

  async createSection(templateId: string, name: string, description: string | null, sortOrder: number): Promise<TemplateSectionRow> {
    const r = await this.sql`
      INSERT INTO onboarding_template_sections (template_id, name, description, sort_order)
      VALUES (${templateId}, ${name}, ${description}, ${sortOrder}) RETURNING *
    ` as TemplateSectionRow[];
    return r[0];
  }

  async updateSection(sectionId: string, fields: { name?: string; description?: string | null; sort_order?: number }): Promise<TemplateSectionRow | null> {
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.name !== undefined)        { vals.push(fields.name);        sets.push(`name=$${vals.length}`); }
    if (fields.description !== undefined) { vals.push(fields.description); sets.push(`description=$${vals.length}`); }
    if (fields.sort_order !== undefined)  { vals.push(fields.sort_order);  sets.push(`sort_order=$${vals.length}`); }
    if (!sets.length) return this.findSectionById(sectionId);
    vals.push(sectionId);
    const r = await this.sql(`UPDATE onboarding_template_sections SET ${sets.join(",")} WHERE id=$${vals.length} RETURNING *`, vals) as TemplateSectionRow[];
    return r[0] ?? null;
  }

  async deleteSection(sectionId: string): Promise<void> {
    await this.sql`DELETE FROM onboarding_template_sections WHERE id = ${sectionId}`;
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────────

  async findTasks(sectionId: string): Promise<TemplateTaskRow[]> {
    return this.sql`
      SELECT * FROM onboarding_template_tasks WHERE section_id = ${sectionId} ORDER BY sort_order ASC, created_at ASC
    ` as unknown as Promise<TemplateTaskRow[]>;
  }

  async findAllTasksByTemplate(templateId: string): Promise<TemplateTaskRow[]> {
    return this.sql`
      SELECT tt.* FROM onboarding_template_tasks tt
      INNER JOIN onboarding_template_sections ts ON ts.id = tt.section_id
      WHERE ts.template_id = ${templateId}
      ORDER BY ts.sort_order ASC, tt.sort_order ASC
    ` as unknown as Promise<TemplateTaskRow[]>;
  }

  async findTaskById(taskId: string): Promise<TemplateTaskRow | null> {
    const r = await this.sql`SELECT * FROM onboarding_template_tasks WHERE id = ${taskId}` as TemplateTaskRow[];
    return r[0] ?? null;
  }

  async createTask(sectionId: string, taskName: string, sortOrder: number, requiresAssignment = false): Promise<TemplateTaskRow> {
    const r = await this.sql`
      INSERT INTO onboarding_template_tasks (section_id, task_name, sort_order, requires_assignment)
      VALUES (${sectionId}, ${taskName}, ${sortOrder}, ${requiresAssignment}) RETURNING *
    ` as TemplateTaskRow[];
    return r[0];
  }

  async updateTask(taskId: string, fields: { task_name?: string; sort_order?: number; requires_assignment?: boolean }): Promise<TemplateTaskRow | null> {
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.task_name !== undefined)  { vals.push(fields.task_name);  sets.push(`task_name=$${vals.length}`); }
    if (fields.sort_order !== undefined) { vals.push(fields.sort_order); sets.push(`sort_order=$${vals.length}`); }
    if (fields.requires_assignment !== undefined) { vals.push(fields.requires_assignment); sets.push(`requires_assignment=$${vals.length}`); }
    if (!sets.length) return this.findTaskById(taskId);
    vals.push(taskId);
    const r = await this.sql(`UPDATE onboarding_template_tasks SET ${sets.join(",")} WHERE id=$${vals.length} RETURNING *`, vals) as TemplateTaskRow[];
    return r[0] ?? null;
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.sql`DELETE FROM onboarding_template_tasks WHERE id = ${taskId}`;
  }

  async getNextSectionSortOrder(templateId: string): Promise<number> {
    const r = await this.sql`SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM onboarding_template_sections WHERE template_id = ${templateId}` as any[];
    return r[0]?.next ?? 0;
  }

  async getNextTaskSortOrder(sectionId: string): Promise<number> {
    const r = await this.sql`SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM onboarding_template_tasks WHERE section_id = ${sectionId}` as any[];
    return r[0]?.next ?? 0;
  }

  // ── Section default assignees ───────────────────────────────────────────────

  async findAssigneesBySection(sectionId: string): Promise<TemplateSectionAssigneeRow[]> {
    return this.sql`
      SELECT a.id, a.section_id, a.employee_id, a.created_at,
        e.first_name, e.last_name, e.avatar
      FROM onboarding_template_section_assignees a
      INNER JOIN employees e ON e.id = a.employee_id
      WHERE a.section_id = ${sectionId}
      ORDER BY e.first_name ASC, e.last_name ASC
    ` as unknown as Promise<TemplateSectionAssigneeRow[]>;
  }

  async findAllAssigneesByTemplate(templateId: string): Promise<TemplateSectionAssigneeRow[]> {
    return this.sql`
      SELECT a.id, a.section_id, a.employee_id, a.created_at,
        e.first_name, e.last_name, e.avatar
      FROM onboarding_template_section_assignees a
      INNER JOIN onboarding_template_sections s ON s.id = a.section_id
      INNER JOIN employees e ON e.id = a.employee_id
      WHERE s.template_id = ${templateId}
      ORDER BY s.sort_order ASC, e.first_name ASC, e.last_name ASC
    ` as unknown as Promise<TemplateSectionAssigneeRow[]>;
  }

  async getSectionAssigneeEmployeeIds(sectionId: string): Promise<string[]> {
    const rows = await this.sql`
      SELECT employee_id FROM onboarding_template_section_assignees WHERE section_id = ${sectionId}
    ` as { employee_id: string }[];
    return rows.map(r => r.employee_id);
  }

  /** Returns true if a new row was inserted. */
  async addSectionAssignee(sectionId: string, employeeId: string): Promise<boolean> {
    const rows = await this.sql`
      INSERT INTO onboarding_template_section_assignees (section_id, employee_id)
      VALUES (${sectionId}, ${employeeId})
      ON CONFLICT (section_id, employee_id) DO NOTHING
      RETURNING id
    ` as { id: string }[];
    return rows.length > 0;
  }

  async removeSectionAssignee(sectionId: string, employeeId: string): Promise<void> {
    await this.sql`
      DELETE FROM onboarding_template_section_assignees
      WHERE section_id = ${sectionId} AND employee_id = ${employeeId}
    `;
  }
}

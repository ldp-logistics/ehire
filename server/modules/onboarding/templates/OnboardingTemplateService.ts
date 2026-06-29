import { OnboardingTemplateRepository } from "./OnboardingTemplateRepository.js";
import type { TemplateRow, TemplateSectionRow, TemplateTaskRow, TemplateSectionAssigneeRow } from "./OnboardingTemplateRepository.js";
import type {
  OnboardingTemplateDTO, TemplateSectionDTO, TemplateTaskDTO, TemplateSectionAssigneeDTO,
  CreateTemplateDTO, UpdateTemplateDTO,
  CreateTemplateSectionDTO, UpdateTemplateSectionDTO,
  CreateTemplateTaskDTO, UpdateTemplateTaskDTO,
} from "./OnboardingTemplate.dto.js";
import { NotFoundError, ValidationError } from "../../../core/types/index.js";

export class OnboardingTemplateService {
  private readonly repo = new OnboardingTemplateRepository();

  // ── Templates ────────────────────────────────────────────────────────────────

  async listAll(): Promise<OnboardingTemplateDTO[]> {
    return (await this.repo.findAll()).map(t => this.toDTO(t));
  }

  async getById(id: string): Promise<OnboardingTemplateDTO> {
    const tpl = await this.repo.findById(id);
    if (!tpl) throw new NotFoundError("Onboarding template", id);
    const sections = await this.repo.findSections(id);
    const allTasks = await this.repo.findAllTasksByTemplate(id);
    const allAssignees = await this.repo.findAllAssigneesByTemplate(id);
    const tasksBySection = new Map<string, TemplateTaskRow[]>();
    for (const t of allTasks) {
      if (!tasksBySection.has(t.section_id)) tasksBySection.set(t.section_id, []);
      tasksBySection.get(t.section_id)!.push(t);
    }
    const assigneesBySection = new Map<string, TemplateSectionAssigneeRow[]>();
    for (const a of allAssignees) {
      if (!assigneesBySection.has(a.section_id)) assigneesBySection.set(a.section_id, []);
      assigneesBySection.get(a.section_id)!.push(a);
    }
    return {
      ...this.toDTO(tpl),
      sections: sections.map(s => this.toSectionDTO(
        s,
        tasksBySection.get(s.id) ?? [],
        assigneesBySection.get(s.id) ?? [],
      )),
    };
  }

  async create(dto: CreateTemplateDTO, createdById: string | null): Promise<OnboardingTemplateDTO> {
    if (!dto.name?.trim()) throw new ValidationError("Template name is required");
    const tpl = await this.repo.create(dto.name.trim(), dto.description?.trim() ?? null, dto.department?.trim() ?? null, createdById);
    return { ...this.toDTO(tpl), sections: [] };
  }

  async update(id: string, dto: UpdateTemplateDTO): Promise<OnboardingTemplateDTO> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("Onboarding template", id);
    const updated = await this.repo.update(id, {
      name:        dto.name?.trim(),
      description: dto.description !== undefined ? (dto.description?.trim() ?? null) : undefined,
      department:  dto.department  !== undefined ? (dto.department?.trim()  ?? null) : undefined,
      is_active:   dto.isActive,
    });
    return this.toDTO(updated!);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("Onboarding template", id);
    await this.repo.softDelete(id);
  }

  // ── Sections ─────────────────────────────────────────────────────────────────

  async addSection(templateId: string, dto: CreateTemplateSectionDTO): Promise<TemplateSectionDTO> {
    const tpl = await this.repo.findById(templateId);
    if (!tpl) throw new NotFoundError("Onboarding template", templateId);
    if (!dto.name?.trim()) throw new ValidationError("Section name is required");
    const sortOrder = dto.sortOrder ?? (await this.repo.getNextSectionSortOrder(templateId));
    const section = await this.repo.createSection(templateId, dto.name.trim(), dto.description?.trim() ?? null, sortOrder);
    return this.toSectionDTO(section, []);
  }

  async updateSection(templateId: string, sectionId: string, dto: UpdateTemplateSectionDTO): Promise<TemplateSectionDTO> {
    const section = await this.repo.findSectionById(sectionId);
    if (!section || section.template_id !== templateId) throw new NotFoundError("Template section", sectionId);
    const updated = await this.repo.updateSection(sectionId, {
      name:        dto.name?.trim(),
      description: dto.description !== undefined ? (dto.description?.trim() ?? null) : undefined,
      sort_order:  dto.sortOrder,
    });
    const tasks = await this.repo.findTasks(sectionId);
    const assignees = await this.repo.findAssigneesBySection(sectionId);
    return this.toSectionDTO(updated!, tasks, assignees);
  }

  async removeSection(templateId: string, sectionId: string): Promise<void> {
    const section = await this.repo.findSectionById(sectionId);
    if (!section || section.template_id !== templateId) throw new NotFoundError("Template section", sectionId);
    await this.repo.deleteSection(sectionId);
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────────

  async addTask(templateId: string, sectionId: string, dto: CreateTemplateTaskDTO): Promise<TemplateTaskDTO> {
    const section = await this.repo.findSectionById(sectionId);
    if (!section || section.template_id !== templateId) throw new NotFoundError("Template section", sectionId);
    if (!dto.taskName?.trim()) throw new ValidationError("Task name is required");
    const sortOrder = dto.sortOrder ?? (await this.repo.getNextTaskSortOrder(sectionId));
    const requiresAssignment = dto.requiresAssignment === true;
    const task = await this.repo.createTask(sectionId, dto.taskName.trim(), sortOrder, requiresAssignment);
    return this.toTaskDTO(task);
  }

  async updateTask(templateId: string, sectionId: string, taskId: string, dto: UpdateTemplateTaskDTO): Promise<TemplateTaskDTO> {
    const section = await this.repo.findSectionById(sectionId);
    if (!section || section.template_id !== templateId) throw new NotFoundError("Template section", sectionId);
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.section_id !== sectionId) throw new NotFoundError("Template task", taskId);
    const updated = await this.repo.updateTask(taskId, {
      task_name:  dto.taskName?.trim(),
      sort_order: dto.sortOrder,
      requires_assignment: dto.requiresAssignment,
    });
    return this.toTaskDTO(updated!);
  }

  async removeTask(templateId: string, sectionId: string, taskId: string): Promise<void> {
    const section = await this.repo.findSectionById(sectionId);
    if (!section || section.template_id !== templateId) throw new NotFoundError("Template section", sectionId);
    const task = await this.repo.findTaskById(taskId);
    if (!task || task.section_id !== sectionId) throw new NotFoundError("Template task", taskId);
    await this.repo.deleteTask(taskId);
  }

  // ── Section default assignees ─────────────────────────────────────────────────

  async addSectionAssignee(templateId: string, sectionId: string, employeeId: string): Promise<TemplateSectionAssigneeDTO> {
    const section = await this.repo.findSectionById(sectionId);
    if (!section || section.template_id !== templateId) throw new NotFoundError("Template section", sectionId);
    if (!employeeId?.trim()) throw new ValidationError("employeeId is required");
    await this.repo.addSectionAssignee(sectionId, employeeId.trim());
    const assignees = await this.repo.findAssigneesBySection(sectionId);
    const added = assignees.find(a => a.employee_id === employeeId.trim());
    if (!added) throw new NotFoundError("Employee", employeeId);
    return this.toAssigneeDTO(added);
  }

  async removeSectionAssignee(templateId: string, sectionId: string, employeeId: string): Promise<void> {
    const section = await this.repo.findSectionById(sectionId);
    if (!section || section.template_id !== templateId) throw new NotFoundError("Template section", sectionId);
    await this.repo.removeSectionAssignee(sectionId, employeeId);
  }

  // ── Mappers ──────────────────────────────────────────────────────────────────

  private toDTO(t: TemplateRow): OnboardingTemplateDTO {
    return {
      id: t.id, name: t.name, description: t.description, department: t.department,
      isActive: t.is_active, createdById: t.created_by_id,
      createdAt: t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at),
      updatedAt: t.updated_at instanceof Date ? t.updated_at.toISOString() : String(t.updated_at),
    };
  }

  private toSectionDTO(s: TemplateSectionRow, tasks: TemplateTaskRow[], assignees: TemplateSectionAssigneeRow[] = []): TemplateSectionDTO {
    return {
      id: s.id, templateId: s.template_id, name: s.name, description: s.description,
      sortOrder: s.sort_order,
      createdAt: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at),
      assignees: assignees.map(a => this.toAssigneeDTO(a)),
      tasks: tasks.map(t => this.toTaskDTO(t)),
    };
  }

  private toAssigneeDTO(a: TemplateSectionAssigneeRow): TemplateSectionAssigneeDTO {
    return {
      employeeId: a.employee_id,
      firstName: a.first_name,
      lastName: a.last_name,
      avatar: a.avatar,
    };
  }

  private toTaskDTO(t: TemplateTaskRow): TemplateTaskDTO {
    return {
      id: t.id, sectionId: t.section_id, taskName: t.task_name, sortOrder: t.sort_order,
      requiresAssignment: t.requires_assignment === true || (t.requires_assignment as unknown) === "true",
      createdAt: t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at),
    };
  }
}

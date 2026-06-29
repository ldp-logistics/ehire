export interface TemplateSectionAssigneeDTO {
  employeeId: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
}

export interface TemplateTaskDTO {
  id: string;
  sectionId: string;
  taskName: string;
  sortOrder: number;
  requiresAssignment: boolean;
  createdAt: string;
}

export interface TemplateSectionDTO {
  id: string;
  templateId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  assignees: TemplateSectionAssigneeDTO[];
  tasks: TemplateTaskDTO[];
}

export interface OnboardingTemplateDTO {
  id: string;
  name: string;
  description: string | null;
  department: string | null;
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  sections?: TemplateSectionDTO[];
}

export interface CreateTemplateDTO {
  name: string;
  description?: string;
  department?: string;
}

export interface UpdateTemplateDTO {
  name?: string;
  description?: string;
  department?: string;
  isActive?: boolean;
}

export interface CreateTemplateSectionDTO {
  name: string;
  description?: string;
  sortOrder?: number;
}

export interface UpdateTemplateSectionDTO {
  name?: string;
  description?: string;
  sortOrder?: number;
}

export interface CreateTemplateTaskDTO {
  taskName: string;
  sortOrder?: number;
  requiresAssignment?: boolean;
}

export interface UpdateTemplateTaskDTO {
  taskName?: string;
  sortOrder?: number;
  requiresAssignment?: boolean;
}

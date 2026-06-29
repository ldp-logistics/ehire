export interface CreateOnboardingDTO { employeeId: string; }
export interface UpdateOnboardingDTO { status?: string; completedAt?: string | null; }
export interface UpdateOnboardingTaskDTO { completed?: boolean; assignmentDetails?: string; }
export interface CreateOnboardingTaskDTO { taskName: string; sectionId?: string | null; }

export interface InitiateSectionTaskDTO {
  taskName: string;
  requiresAssignment?: boolean;
}
export interface InitiateSectionDTO {
  templateSectionId?: string | null;
  name: string;
  description?: string | null;
  sortOrder?: number;
  assigneeIds: string[];
  tasks: InitiateSectionTaskDTO[] | string[];
}
export interface InitiateOnboardingDTO {
  employeeId: string;
  templateId?: string | null;
  sections: InitiateSectionDTO[];
}

export interface OnboardingSectionAssigneeDTO {
  id: string; sectionId: string; employeeId: string;
  firstName: string; lastName: string; avatar: string | null;
}
export interface OnboardingRecordSectionDTO {
  id: string; recordId: string; name: string; description: string | null; sortOrder: number;
  assignees: OnboardingSectionAssigneeDTO[];
  tasks: OnboardingTaskDTO[];
}
export interface OnboardingTaskDTO {
  id: string; onboardingRecordId: string; taskName: string; category: string;
  sectionId: string | null;
  completed: boolean; assignmentDetails: string | null; completedAt: string | null;
  sortOrder: number; createdAt: string; updatedAt: string;
  requiresAssignment: boolean;
}
export interface OnboardingResponseDTO {
  id: string; employeeId: string; ownerId: string; status: string;
  templateId: string | null;
  templateName: string | null;
  checklistReopenedAt: string | null;
  completedAt: string | null; createdAt: string; updatedAt: string;
  firstName: string; lastName: string; workEmail: string; jobTitle: string | null;
  department: string | null; joinDate: string | null;
  hireName: string; hireRole: string | null; hireDepartment: string | null;
  hireEmail: string; startDate: string | null;
  taskCount: number; completedCount: number;
  tasks?: OnboardingTaskDTO[];
  sections?: OnboardingRecordSectionDTO[];
}

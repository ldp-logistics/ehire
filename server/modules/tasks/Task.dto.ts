export interface CreateTaskDTO {
  title: string;
  description?: string;
  category?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  dueDate?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  watcherIds?: string[];
}

export interface UpdateTaskDTO {
  title?: string;
  description?: string;
  category?: string;
  status?: string;
  priority?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  progress?: number;
  watcherIds?: string[];
}

export interface CreateTaskCommentDTO {
  content: string;
}

export interface TaskResponseDTO {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  priority: string;
  createdBy: string;
  createdByName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeFirstName: string | null;
  assigneeLastName: string | null;
  assigneeAvatar: string | null;
  assigneeDepartment: string | null;
  dueDate: string | null;
  progress: number;
  commentCount: number;
  watcherIds: string[];
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  comments?: TaskCommentDTO[];
}

export interface TaskCommentDTO {
  id: string;
  taskId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface TaskStatsDTO {
  total: number;
  todo: number;
  in_progress: number;
  review: number;
  done: number;
  cancelled: number;
  overdue: number;
}

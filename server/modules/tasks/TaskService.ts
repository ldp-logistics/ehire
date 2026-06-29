import { TaskRepository } from "./TaskRepository.js";
import type { TaskRow, TaskCommentRow, VisibilityParams, TaskFilters } from "./TaskRepository.js";
import type { TaskResponseDTO, TaskCommentDTO, TaskStatsDTO } from "./Task.dto.js";
import type { CreateTaskInput, UpdateTaskInput, CreateTaskCommentInput } from "./Task.validators.js";
import { NotFoundError, ForbiddenError } from "../../core/types/index.js";
import { effectiveRegionsFor, getEmployeeRegion } from "../../lib/regionAccess.js";
import type { ModuleRegionCtx } from "../../lib/moduleRegionCtx.js";
import { emitRefreshAll } from "../../lib/notificationEvents.js";
import { notifyTaskAssigned, notifyTaskCompleted, notifyTaskComment } from "./taskNotifications.js";

export class TaskService {
  private readonly repo = new TaskRepository();

  private regionsFor(ctx?: ModuleRegionCtx): string[] | null {
    return ctx ? effectiveRegionsFor(ctx, ctx.requestedRegion) : null;
  }

  private async assertEmployeeInScope(ctx: ModuleRegionCtx | undefined, employeeId: string | null | undefined): Promise<void> {
    if (!employeeId || !ctx) return;
    const regions = this.regionsFor(ctx);
    if (regions === null) return;
    const empRegion = await getEmployeeRegion(employeeId);
    if (regions.length === 0 || !empRegion || !regions.includes(empRegion)) {
      throw new ForbiddenError("This employee belongs to a different region.");
    }
  }

  private async assertTaskInScope(ctx: ModuleRegionCtx | undefined, taskId: string): Promise<void> {
    const row = await this.repo.findById(taskId);
    if (!row) return;
    if (row.assignee_id) {
      await this.assertEmployeeInScope(ctx, row.assignee_id);
      return;
    }
    const creatorEmp = await this.repo.getCreatorEmployeeId(row.created_by);
    if (creatorEmp) await this.assertEmployeeInScope(ctx, creatorEmp);
  }

  async listTasks(visibility: VisibilityParams, filters: TaskFilters, ctx?: ModuleRegionCtx): Promise<TaskResponseDTO[]> {
    const rows = await this.repo.findAll(visibility, filters, this.regionsFor(ctx));
    return rows.map((row) => this.toDTO(row));
  }

  async getStats(visibility: VisibilityParams, ctx?: ModuleRegionCtx): Promise<TaskStatsDTO> {
    return this.repo.getStats(visibility, this.regionsFor(ctx));
  }

  async getTask(id: string, ctx?: ModuleRegionCtx): Promise<TaskResponseDTO> {
    await this.assertTaskInScope(ctx, id);
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError("Task", id);
    const comments = await this.repo.getComments(id);
    return { ...this.toDTO(row), comments: comments.map((c) => this.toCommentDTO(c)) };
  }

  async createTask(data: CreateTaskInput, createdBy: string, ctx?: ModuleRegionCtx): Promise<TaskResponseDTO> {
    if (data.assigneeId) await this.assertEmployeeInScope(ctx, data.assigneeId);
    const assigneeName = data.assigneeId ? await this.repo.resolveEmployeeName(data.assigneeId) : null;
    const row = await this.repo.create(data, createdBy, assigneeName);
    const full = await this.repo.findById(row.id);
    const taskRow = full ?? row;
    if (data.assigneeId) {
      void notifyTaskAssigned(taskRow, data.assigneeId, createdBy).catch((e) =>
        console.error("[tasks] notifyTaskAssigned failed", e),
      );
    }
    emitRefreshAll();
    return this.toDTO(taskRow);
  }

  async updateTask(id: string, data: UpdateTaskInput, updatedByUserId?: string, ctx?: ModuleRegionCtx): Promise<TaskResponseDTO> {
    await this.assertTaskInScope(ctx, id);
    if (data.assigneeId !== undefined && data.assigneeId) await this.assertEmployeeInScope(ctx, data.assigneeId);
    const current = await this.repo.findById(id);
    if (!current) throw new NotFoundError("Task", id);
    let assigneeName = current.assignee_name;
    const assigneeChanged =
      data.assigneeId !== undefined && data.assigneeId !== current.assignee_id;
    if (data.assigneeId !== undefined) {
      assigneeName = data.assigneeId ? await this.repo.resolveEmployeeName(data.assigneeId) : null;
    }
    const wasDone = current.status === "done";
    const updated = await this.repo.update(id, current, data, assigneeName);

    if (assigneeChanged && data.assigneeId && updatedByUserId) {
      void notifyTaskAssigned(updated, data.assigneeId, updatedByUserId).catch((e) =>
        console.error("[tasks] notifyTaskAssigned failed", e),
      );
    }
    if (!wasDone && updated.status === "done" && updatedByUserId) {
      void notifyTaskCompleted(updated, updatedByUserId).catch((e) =>
        console.error("[tasks] notifyTaskCompleted failed", e),
      );
    }
    emitRefreshAll();
    return this.toDTO(updated);
  }

  async deleteTask(id: string, requestingUser: { id: string; role: string }, ctx?: ModuleRegionCtx): Promise<void> {
    await this.assertTaskInScope(ctx, id);
    const task = await this.repo.findById(id);
    if (!task) throw new NotFoundError("Task", id);
    if (requestingUser.role !== "admin" && requestingUser.role !== "hr" && task.created_by !== requestingUser.id) {
      throw new ForbiddenError("You can only delete tasks you created");
    }
    await this.repo.delete(id);
  }

  async addComment(taskId: string, authorId: string, data: CreateTaskCommentInput, ctx?: ModuleRegionCtx): Promise<TaskCommentDTO> {
    await this.assertTaskInScope(ctx, taskId);
    const task = await this.repo.findById(taskId);
    if (!task) throw new NotFoundError("Task", taskId);
    const authorName = await this.repo.resolveUserName(authorId);
    const comment = await this.repo.addComment(taskId, authorId, authorName, data);
    void notifyTaskComment(task, {
      content: data.content,
      authorId,
      authorName,
    }).catch((e) => console.error("[tasks] notifyTaskComment failed", e));
    emitRefreshAll();
    return this.toCommentDTO(comment);
  }

  async deleteComment(taskId: string, commentId: string, requestingUser: { id: string; role: string }, ctx?: ModuleRegionCtx): Promise<void> {
    await this.assertTaskInScope(ctx, taskId);
    const comment = await this.repo.findCommentById(commentId, taskId);
    if (!comment) throw new NotFoundError("Comment", commentId);
    if (comment.author_id !== requestingUser.id && requestingUser.role !== "admin") {
      throw new ForbiddenError("You can only delete your own comments");
    }
    await this.repo.deleteComment(taskId, commentId);
  }

  private resolveCreatorName(row: TaskRow): string | null {
    if (row.creator_first_name) {
      return `${row.creator_first_name}${row.creator_last_name ? ` ${row.creator_last_name}` : ""}`.trim();
    }
    return row.creator_email ?? null;
  }

  private toDTO(row: TaskRow): TaskResponseDTO {
    return {
      id: row.id, title: row.title, description: row.description, category: row.category,
      status: row.status, priority: row.priority, createdBy: row.created_by,
      createdByName: this.resolveCreatorName(row),
      assigneeId: row.assignee_id, assigneeName: row.assignee_name,
      assigneeFirstName: row.assignee_first_name ?? null,
      assigneeLastName: row.assignee_last_name ?? null,
      assigneeAvatar: row.assignee_avatar ?? null,
      assigneeDepartment: row.assignee_department ?? null,
      dueDate: row.due_date, progress: row.progress, commentCount: row.comment_count,
      watcherIds: Array.isArray(row.watcher_ids) ? row.watcher_ids : [],
      relatedEntityType: row.related_entity_type, relatedEntityId: row.related_entity_id,
      completedAt: row.completed_at,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }

  private toCommentDTO(row: TaskCommentRow): TaskCommentDTO {
    return {
      id: row.id, taskId: row.task_id, authorId: row.author_id, authorName: row.author_name,
      content: row.content,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
  }
}

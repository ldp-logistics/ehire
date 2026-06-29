import { BaseRepository } from "../../core/base/BaseRepository.js";
import type { CreateTaskInput, UpdateTaskInput, CreateTaskCommentInput } from "./Task.validators.js";
import { hasOrgDerivedManagerScope } from "../../lib/rbac.js";
import { appendEffectiveRegionFilter, sqlEmployeeEffectiveRegion } from "../../lib/employeeRegionSql.js";

export interface TaskRow {
  id: string; title: string; description: string | null; category: string;
  status: string; priority: string; created_by: string; assignee_id: string | null;
  assignee_name: string | null; due_date: string | null; progress: number;
  comment_count: number; watcher_ids: string[]; related_entity_type: string | null;
  related_entity_id: string | null; completed_at: string | null;
  created_at: Date; updated_at: Date;
  assignee_first_name?: string | null; assignee_last_name?: string | null;
  assignee_avatar?: string | null; assignee_department?: string | null;
  creator_first_name?: string | null; creator_last_name?: string | null;
  creator_email?: string | null;
}
export interface TaskCommentRow {
  id: string; task_id: string; author_id: string; author_name: string;
  content: string; created_at: Date;
}
export interface TaskStatsRow {
  total: number; todo: number; in_progress: number; review: number;
  done: number; cancelled: number; overdue: number;
}
export interface VisibilityParams { userId: string; role: string; employeeId: string | null; roles?: string[] | null; }
export interface TaskFilters {
  status?: string; priority?: string; category?: string;
  assigneeId?: string; search?: string; limit?: number; offset?: number;
  /** Tasks created by the current user with an assignee (delegated work). */
  createdByMe?: boolean;
}

export class TaskRepository extends BaseRepository {
  private appendTaskRegionFilter(regions: string[] | null | undefined, conds: string[], params: unknown[]): void {
    if (regions == null) return;
    if (regions.length === 0) {
      conds.push("1=0");
      return;
    }
    params.push(regions);
    const idx = params.length;
    const eff = sqlEmployeeEffectiveRegion;
    conds.push(`(
      (t.assignee_id IS NOT NULL AND ${eff("e", "b")} = ANY($${idx}))
      OR (t.assignee_id IS NULL AND ${eff("ce", "cb")} = ANY($${idx}))
    )`);
  }

  async findAll(visibility: VisibilityParams, filters: TaskFilters, regions?: string[] | null): Promise<TaskRow[]> {
    const { userId, role, employeeId, roles: userRoles } = visibility;
    const { status, priority, category, assigneeId, search, limit = 200, offset = 0, createdByMe } = filters;
    const isAdminOrHR = role === "admin" || role === "hr";
    const teamTaskScope = hasOrgDerivedManagerScope(role, userRoles);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (createdByMe) {
      params.push(userId);
      conditions.push(`t.created_by = $${params.length}`);
      conditions.push(`t.assignee_id IS NOT NULL`);
    } else if (!isAdminOrHR) {
      const visConds: string[] = [];
      params.push(userId); visConds.push(`t.created_by = $${params.length}`);
      if (employeeId) {
        params.push(employeeId); visConds.push(`t.assignee_id = $${params.length}`);
        params.push(employeeId); visConds.push(`t.watcher_ids @> to_jsonb($${params.length}::text)`);
        if (teamTaskScope) {
          params.push(employeeId);
          visConds.push(`t.assignee_id IN (SELECT id FROM employees WHERE manager_id = $${params.length})`);
        }
      }
      conditions.push(`(${visConds.join(" OR ")})`);
    }

    if (status && status !== "all") { params.push(status); conditions.push(`t.status = $${params.length}`); }
    if (priority && priority !== "all") { params.push(priority); conditions.push(`t.priority = $${params.length}`); }
    if (category && category !== "all") { params.push(category); conditions.push(`t.category = $${params.length}`); }
    if (assigneeId) { params.push(assigneeId); conditions.push(`t.assignee_id = $${params.length}`); }
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      conditions.push(`(LOWER(t.title) LIKE $${params.length} OR LOWER(t.description) LIKE $${params.length})`);
    }

    if (isAdminOrHR) this.appendTaskRegionFilter(regions, conditions, params);

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit, offset);

    return this.sql(`
      SELECT t.id, t.title, t.description, t.category, t.status, t.priority,
             t.created_by, t.assignee_id, t.assignee_name, t.due_date, t.progress,
             t.comment_count, t.watcher_ids, t.related_entity_type, t.related_entity_id,
             t.completed_at, t.created_at, t.updated_at,
             e.first_name as assignee_first_name, e.last_name as assignee_last_name,
             e.avatar as assignee_avatar, e.department as assignee_department,
             ce.first_name as creator_first_name, ce.last_name as creator_last_name,
             cu.email as creator_email
      FROM tasks t
      LEFT JOIN employees e ON t.assignee_id = e.id
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN users cu ON t.created_by = cu.id
      LEFT JOIN employees ce ON cu.employee_id = ce.id
      LEFT JOIN branches cb ON cb.id = ce.branch_id
      ${where}
      ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
               t.due_date ASC NULLS LAST, t.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params) as unknown as Promise<TaskRow[]>;
  }

  async getStats(visibility: VisibilityParams, regions?: string[] | null): Promise<TaskStatsRow> {
    const { userId, role, employeeId, roles: userRoles } = visibility;
    const isAdminOrHR = role === "admin" || role === "hr";
    const teamTaskScope = hasOrgDerivedManagerScope(role, userRoles);
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!isAdminOrHR) {
      const visConds: string[] = [];
      params.push(userId); visConds.push(`t.created_by = $${params.length}`);
      if (employeeId) {
        params.push(employeeId); visConds.push(`t.assignee_id = $${params.length}`);
        params.push(employeeId); visConds.push(`t.watcher_ids @> to_jsonb($${params.length}::text)`);
        if (teamTaskScope) {
          params.push(employeeId);
          visConds.push(`t.assignee_id IN (SELECT id FROM employees WHERE manager_id = $${params.length})`);
        }
      }
      conditions.push(`(${visConds.join(" OR ")})`);
    } else {
      this.appendTaskRegionFilter(regions, conditions, params);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await this.sql(`
      SELECT COUNT(*)::int as total,
             COUNT(*) FILTER (WHERE t.status = 'todo')::int as todo,
             COUNT(*) FILTER (WHERE t.status = 'in_progress')::int as in_progress,
             COUNT(*) FILTER (WHERE t.status = 'review')::int as review,
             COUNT(*) FILTER (WHERE t.status = 'done')::int as done,
             COUNT(*) FILTER (WHERE t.status = 'cancelled')::int as cancelled,
             COUNT(*) FILTER (WHERE t.due_date < NOW() AND t.status NOT IN ('done','cancelled'))::int as overdue
      FROM tasks t
      LEFT JOIN employees e ON t.assignee_id = e.id
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN users cu ON t.created_by = cu.id
      LEFT JOIN employees ce ON cu.employee_id = ce.id
      LEFT JOIN branches cb ON cb.id = ce.branch_id
      ${where}
    `, params) as TaskStatsRow[];
    return rows[0] ?? { total: 0, todo: 0, in_progress: 0, review: 0, done: 0, cancelled: 0, overdue: 0 };
  }

  async findById(id: string): Promise<TaskRow | null> {
    const rows = await this.sql`
      SELECT t.*, e.first_name as assignee_first_name, e.last_name as assignee_last_name,
             e.avatar as assignee_avatar, e.department as assignee_department,
             ce.first_name as creator_first_name, ce.last_name as creator_last_name,
             cu.email as creator_email
      FROM tasks t
      LEFT JOIN employees e ON t.assignee_id = e.id
      LEFT JOIN users cu ON t.created_by = cu.id
      LEFT JOIN employees ce ON cu.employee_id = ce.id
      WHERE t.id = ${id}
    ` as TaskRow[];
    return rows[0] ?? null;
  }

  async getComments(taskId: string): Promise<TaskCommentRow[]> {
    return this.sql`
      SELECT * FROM task_comments WHERE task_id = ${taskId} ORDER BY created_at ASC
    ` as unknown as Promise<TaskCommentRow[]>;
  }

  async resolveEmployeeName(employeeId: string): Promise<string> {
    const rows = await this.sql`SELECT first_name, last_name FROM employees WHERE id = ${employeeId}` as any[];
    return rows[0] ? `${rows[0].first_name} ${rows[0].last_name}` : "Unknown";
  }

  async resolveUserName(userId: string): Promise<string> {
    const rows = await this.sql`
      SELECT u.email, e.first_name, e.last_name FROM users u
      LEFT JOIN employees e ON u.employee_id = e.id WHERE u.id = ${userId}
    ` as any[];
    if (!rows[0]) return "Unknown";
    return rows[0].first_name ? `${rows[0].first_name} ${rows[0].last_name}` : rows[0].email;
  }

  async create(data: CreateTaskInput, createdBy: string, assigneeName: string | null): Promise<TaskRow> {
    const rows = await this.sql`
      INSERT INTO tasks (title, description, category, status, priority, created_by, assignee_id,
        assignee_name, due_date, related_entity_type, related_entity_id, watcher_ids)
      VALUES (
        ${data.title}, ${data.description ?? null}, ${data.category ?? "general"},
        ${data.status ?? "todo"}, ${data.priority ?? "medium"}, ${createdBy},
        ${data.assigneeId ?? null}, ${assigneeName},
        ${data.dueDate ? new Date(data.dueDate).toISOString() : null},
        ${data.relatedEntityType ?? null}, ${data.relatedEntityId ?? null},
        ${JSON.stringify(data.watcherIds ?? [])}::jsonb
      ) RETURNING *
    ` as TaskRow[];
    return rows[0];
  }

  async update(id: string, current: TaskRow, data: UpdateTaskInput, assigneeName: string | null): Promise<TaskRow> {
    const newStatus = data.status ?? current.status;
    const completedAt = newStatus === "done" && current.status !== "done"
      ? new Date().toISOString()
      : (newStatus !== "done" ? null : current.completed_at);
    const autoProgress = newStatus === "done" ? 100 : (data.progress !== undefined ? Math.min(100, Math.max(0, data.progress)) : current.progress);

    await this.sql`
      UPDATE tasks SET
        title        = ${data.title ?? current.title},
        description  = ${data.description !== undefined ? data.description : current.description},
        category     = ${data.category ?? current.category},
        status       = ${newStatus},
        priority     = ${data.priority ?? current.priority},
        assignee_id  = ${data.assigneeId !== undefined ? (data.assigneeId ?? null) : current.assignee_id},
        assignee_name= ${assigneeName ?? current.assignee_name},
        due_date     = ${data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate).toISOString() : null) : current.due_date},
        progress     = ${autoProgress},
        watcher_ids  = ${data.watcherIds !== undefined ? JSON.stringify(data.watcherIds) : JSON.stringify(current.watcher_ids)}::jsonb,
        completed_at = ${completedAt},
        updated_at   = NOW()
      WHERE id = ${id}
    `;
    return (await this.findById(id))!;
  }

  async delete(id: string): Promise<void> {
    await this.sql`DELETE FROM tasks WHERE id = ${id}`;
  }

  async addComment(taskId: string, authorId: string, authorName: string, data: CreateTaskCommentInput): Promise<TaskCommentRow> {
    const rows = await this.sql`
      INSERT INTO task_comments (task_id, author_id, author_name, content)
      VALUES (${taskId}, ${authorId}, ${authorName}, ${data.content}) RETURNING *
    ` as TaskCommentRow[];
    await this.sql`UPDATE tasks SET comment_count = comment_count + 1, updated_at = NOW() WHERE id = ${taskId}`;
    return rows[0];
  }

  async deleteComment(taskId: string, commentId: string): Promise<void> {
    await this.sql`DELETE FROM task_comments WHERE id = ${commentId}`;
    await this.sql`UPDATE tasks SET comment_count = GREATEST(comment_count - 1, 0), updated_at = NOW() WHERE id = ${taskId}`;
  }

  async findCommentById(commentId: string, taskId: string): Promise<{ id: string; author_id: string } | null> {
    const rows = await this.sql`SELECT id, author_id FROM task_comments WHERE id = ${commentId} AND task_id = ${taskId}` as any[];
    return rows[0] ?? null;
  }

  async getUserRecipient(userId: string): Promise<{ email: string; name: string } | null> {
    const rows = await this.sql`
      SELECT u.email,
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), ''), u.email) AS name
      FROM users u
      LEFT JOIN employees e ON e.id = u.employee_id
      WHERE u.id = ${userId} AND u.email IS NOT NULL AND TRIM(u.email) <> ''
      LIMIT 1
    ` as { email: string; name: string }[];
    return rows[0] ?? null;
  }

  async getUserIdForEmployee(employeeId: string): Promise<string | null> {
    const rows = await this.sql`
      SELECT id FROM users WHERE employee_id = ${employeeId} AND is_active = true LIMIT 1
    ` as { id: string }[];
    return rows[0]?.id ?? null;
  }

  async getCreatorEmployeeId(userId: string): Promise<string | null> {
    const rows = await this.sql`SELECT employee_id FROM users WHERE id = ${userId} LIMIT 1` as { employee_id: string | null }[];
    return rows[0]?.employee_id ?? null;
  }
}

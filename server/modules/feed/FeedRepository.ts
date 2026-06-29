/**
 * FeedRepository — database interactions for company feed.
 * No business logic. No HTTP concerns.
 */

import { BaseRepository } from "../../core/base/BaseRepository.js";
import { appendEffectiveRegionFilter } from "../../lib/employeeRegionSql.js";

export interface PostRow {
  id: string;
  author_employee_id: string;
  content: string;
  is_pinned: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AttachmentRow {
  id: string;
  post_id: string;
  file_name: string;
  mime_type: string;
  file_url: string;
  created_at: Date;
}

export interface ReactionRow {
  id: string;
  post_id: string;
  employee_id: string;
  emoji: string;
  reactor_first_name?: string | null;
  reactor_last_name?: string | null;
  created_at: Date;
}

export interface MentionRow {
  employee_id: string;
  first_name: string;
  last_name: string;
}

export interface PostWithDetails extends PostRow {
  author_first_name: string;
  author_last_name: string;
  author_job_title: string | null;
  author_department: string | null;
  attachments: AttachmentRow[];
  reactions: ReactionRow[];
  mentions: MentionRow[];
}

export interface MentionableEmployee {
  id: string;
  first_name: string;
  last_name: string;
  work_email: string | null;
  job_title: string | null;
}

export class FeedRepository extends BaseRepository {
  private authorRegionExistsSql(regions: string[] | null | undefined): { clause: string; params: unknown[] } {
    if (regions == null) return { clause: "", params: [] };
    if (regions.length === 0) return { clause: " AND 1=0", params: [] };
    const conds: string[] = [];
    const params: unknown[] = [];
    appendEffectiveRegionFilter(regions, "e", "b", conds, params);
    return {
      clause: ` AND EXISTS (SELECT 1 FROM employees e LEFT JOIN branches b ON b.id = e.branch_id WHERE e.id = p.author_employee_id AND ${conds.join(" AND ")})`,
      params,
    };
  }

  async countPosts(regions?: string[] | null): Promise<number> {
    const { clause, params } = this.authorRegionExistsSql(regions);
    const rows = (await this.sql(
      `SELECT COUNT(*)::int AS total FROM feed_posts p WHERE 1=1${clause}`,
      params,
    )) as [{ total: number }];
    return rows[0]?.total ?? 0;
  }

  async listPostsWithDetails(
    limit: number,
    offset: number,
    regions?: string[] | null,
  ): Promise<PostWithDetails[]> {
    const { clause, params: regionParams } = this.authorRegionExistsSql(regions);
    const params = [...regionParams, limit, offset];
    const limIdx = params.length - 1;
    const offIdx = params.length;
    const rows = (await this.sql(
      `SELECT
        p.id,
        p.author_employee_id,
        p.content,
        p.is_pinned,
        p.created_at,
        p.updated_at,
        e.first_name  AS author_first_name,
        e.last_name   AS author_last_name,
        e.job_title   AS author_job_title,
        e.department  AS author_department,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id',        a.id,
            'post_id',   a.post_id,
            'file_name', a.file_name,
            'mime_type', a.mime_type,
            'file_url',  a.file_url,
            'created_at',a.created_at
          )) FILTER (WHERE a.id IS NOT NULL),
          '[]'
        ) AS attachments,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id',          r.id,
            'post_id',     r.post_id,
            'employee_id', r.employee_id,
            'emoji',       r.emoji,
            'reactor_first_name', er.first_name,
            'reactor_last_name',  er.last_name,
            'created_at',  r.created_at
          )) FILTER (WHERE r.id IS NOT NULL),
          '[]'
        ) AS reactions,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'employee_id', m.employee_id,
            'first_name',  me.first_name,
            'last_name',   me.last_name
          )) FILTER (WHERE m.employee_id IS NOT NULL),
          '[]'
        ) AS mentions
      FROM feed_posts p
      JOIN employees e ON e.id = p.author_employee_id
      LEFT JOIN feed_attachments a ON a.post_id = p.id
      LEFT JOIN feed_reactions r ON r.post_id = p.id
      LEFT JOIN employees er ON er.id = r.employee_id
      LEFT JOIN feed_post_mentions m ON m.post_id = p.id
      LEFT JOIN employees me ON me.id = m.employee_id
      WHERE 1=1${clause}
      GROUP BY p.id, e.first_name, e.last_name, e.job_title, e.department
      ORDER BY p.is_pinned DESC, p.created_at DESC
      LIMIT $${limIdx} OFFSET $${offIdx}`,
      params,
    )) as any[];

    return rows.map((row) => ({
      ...row,
      attachments: typeof row.attachments === "string" ? JSON.parse(row.attachments) : row.attachments ?? [],
      reactions:   typeof row.reactions   === "string" ? JSON.parse(row.reactions)   : row.reactions   ?? [],
      mentions:    typeof row.mentions    === "string" ? JSON.parse(row.mentions)    : row.mentions    ?? [],
    }));
  }

  async searchMentionable(q: string, limit: number, regions?: string[] | null): Promise<MentionableEmployee[]> {
    const needle = q.trim().toLowerCase();
    const safeLimit = Math.min(25, Math.max(1, limit));
    const conds = ["employment_status IN ('active', 'onboarding', 'on_leave')"];
    const params: unknown[] = [];
    appendEffectiveRegionFilter(regions, "employees", "b", conds, params);
    const regionWhere = conds.length > 1 ? ` AND ${conds.slice(1).join(" AND ")}` : (regions != null && regions.length === 0 ? " AND 1=0" : "");
    if (!needle) {
      return this.sql(
        `SELECT employees.id, employees.first_name, employees.last_name, employees.work_email, employees.job_title
         FROM employees
         LEFT JOIN branches b ON b.id = employees.branch_id
         WHERE ${conds[0]}${regionWhere}
         ORDER BY first_name, last_name
         LIMIT $${params.length + 1}`,
        [...params, safeLimit],
      ) as unknown as Promise<MentionableEmployee[]>;
    }
    const pattern = `%${needle}%`;
    params.push(pattern);
    const patIdx = params.length;
    params.push(safeLimit);
    return this.sql(
      `SELECT employees.id, employees.first_name, employees.last_name, employees.work_email, employees.job_title
       FROM employees
       LEFT JOIN branches b ON b.id = employees.branch_id
       WHERE ${conds[0]}${regionWhere}
         AND (
           LOWER(first_name) LIKE $${patIdx}
           OR LOWER(last_name) LIKE $${patIdx}
           OR LOWER(TRIM(CONCAT_WS(' ', first_name, last_name))) LIKE $${patIdx}
           OR LOWER(COALESCE(work_email, '')) LIKE $${patIdx}
         )
       ORDER BY first_name, last_name
       LIMIT $${params.length}`,
      params,
    ) as unknown as Promise<MentionableEmployee[]>;
  }

  async findActiveEmployeeIds(ids: string[], regions?: string[] | null): Promise<string[]> {
    if (!ids.length) return [];
    if (regions != null && regions.length === 0) return [];
    const unique = [...new Set(ids)];
    const conds = ["employees.id = ANY($1)"];
    const params: unknown[] = [unique];
    appendEffectiveRegionFilter(regions, "employees", "b", conds, params);
    const rows = (await this.sql(
      `SELECT employees.id FROM employees
       LEFT JOIN branches b ON b.id = employees.branch_id
       WHERE ${conds.join(" AND ")}
         AND employment_status IN ('active', 'onboarding', 'on_leave')`,
      params,
    )) as { id: string }[];
    return rows.map((r) => r.id);
  }

  async addMentions(postId: string, employeeIds: string[]): Promise<void> {
    const unique = [...new Set(employeeIds)];
    for (const employeeId of unique) {
      await this.sql`
        INSERT INTO feed_post_mentions (post_id, employee_id)
        VALUES (${postId}, ${employeeId})
        ON CONFLICT DO NOTHING
      `;
    }
  }

  async findPostById(id: string): Promise<PostRow | null> {
    const rows = (await this.sql`
      SELECT id, author_employee_id, content, is_pinned, created_at, updated_at
      FROM feed_posts WHERE id = ${id} LIMIT 1
    `) as PostRow[];
    return rows[0] ?? null;
  }

  async createPost(
    authorEmployeeId: string,
    content: string,
    isPinned: boolean
  ): Promise<PostRow> {
    const rows = (await this.sql`
      INSERT INTO feed_posts (author_employee_id, content, is_pinned)
      VALUES (${authorEmployeeId}, ${content}, ${isPinned})
      RETURNING id, author_employee_id, content, is_pinned, created_at, updated_at
    `) as PostRow[];
    return rows[0];
  }

  async deletePost(id: string): Promise<boolean> {
    const rows = (await this.sql`
      DELETE FROM feed_posts WHERE id = ${id} RETURNING id
    `) as { id: string }[];
    return rows.length > 0;
  }

  async findAttachmentById(id: string): Promise<AttachmentRow | null> {
    const rows = (await this.sql`
      SELECT id, post_id, file_name, mime_type, file_url, created_at
      FROM feed_attachments
      WHERE id = ${id}
      LIMIT 1
    `) as AttachmentRow[];
    return rows[0] ?? null;
  }

  async addAttachment(
    postId: string,
    fileName: string,
    mimeType: string,
    fileUrl: string
  ): Promise<AttachmentRow> {
    const rows = (await this.sql`
      INSERT INTO feed_attachments (post_id, file_name, mime_type, file_url)
      VALUES (${postId}, ${fileName}, ${mimeType}, ${fileUrl})
      RETURNING id, post_id, file_name, mime_type, file_url, created_at
    `) as AttachmentRow[];
    return rows[0];
  }

  /** Upsert reaction — if already exists, treat as toggle (remove it). Returns true if added, false if removed. */
  async toggleReaction(
    postId: string,
    employeeId: string,
    emoji: string
  ): Promise<"added" | "removed"> {
    const existing = (await this.sql`
      SELECT id FROM feed_reactions
      WHERE post_id = ${postId} AND employee_id = ${employeeId} AND emoji = ${emoji}
      LIMIT 1
    `) as { id: string }[];

    if (existing.length > 0) {
      await this.sql`
        DELETE FROM feed_reactions
        WHERE post_id = ${postId} AND employee_id = ${employeeId} AND emoji = ${emoji}
      `;
      return "removed";
    }

    await this.sql`
      INSERT INTO feed_reactions (post_id, employee_id, emoji)
      VALUES (${postId}, ${employeeId}, ${emoji})
      ON CONFLICT (post_id, employee_id, emoji) DO NOTHING
    `;
    return "added";
  }
}

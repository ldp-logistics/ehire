/**
 * FeedService — business logic for company feed.
 * No req/res/next. 100% HTTP-free.
 */

import { FeedRepository } from "./FeedRepository.js";
import type { PostWithDetails } from "./FeedRepository.js";
import type { CreatePostInput } from "./Feed.validators.js";
import { NotFoundError, ForbiddenError } from "../../core/types/index.js";
import {
  parseDataUrl,
  uploadFileToSharePoint,
  isSharePointAvatarConfigured,
  getAvatarContentBySharingUrl,
} from "../../lib/sharepoint.js";
import { memCache } from "../../lib/perf.js";
import { emitRefreshAll } from "../../lib/notificationEvents.js";
import {
  notifyEmail,
  getAllActiveEmployeeEmails,
  getEmployeeEmail,
  getEmployeeNotificationRecipient,
  resolvePublicAppUrlForTemplates,
} from "../../lib/emailNotifications.js";
import { formatEmployeeLegalName } from "../../../shared/employeeDisplayName.js";

const ALLOWED_POSTER_ROLES = ["admin", "hr"];

/** Browser-safe URL for feed attachment bytes (SharePoint sharing links cannot be used in img src). */
export function feedAttachmentContentUrl(attachmentId: string): string {
  return `/api/feed/attachments/${attachmentId}/content`;
}

export interface FeedPostDTO {
  id: string;
  authorEmployeeId: string;
  authorName: string;
  authorJobTitle: string | null;
  authorDepartment: string | null;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  attachments: AttachmentDTO[];
  reactions: ReactionDTO[];
  mentions: MentionDTO[];
}

export interface MentionDTO {
  employeeId: string;
  name: string;
}

export interface MentionableUserDTO {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  displayName: string;
}

export interface AttachmentDTO {
  id: string;
  fileName: string;
  mimeType: string;
  fileUrl: string;
}

export interface ReactionDTO {
  id: string;
  employeeId: string;
  emoji: string;
  reactorName: string;
}

export interface FeedListResult {
  posts: FeedPostDTO[];
  total: number;
  page: number;
  limit: number;
}

export class FeedService {
  private readonly repo: FeedRepository;

  constructor() {
    this.repo = new FeedRepository();
  }

  async listMentionable(query: string): Promise<MentionableUserDTO[]> {
    const rows = await this.repo.searchMentionable(query, 20, null);
    return rows.map((e) => ({
      id: e.id,
      firstName: e.first_name ?? "",
      lastName: e.last_name ?? "",
      email: e.work_email ?? "",
      jobTitle: e.job_title ?? null,
      displayName: formatEmployeeLegalName(e.first_name, e.last_name),
    }));
  }

  async listPosts(page: number, limit: number): Promise<FeedListResult> {
    const safePage  = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const offset    = (safePage - 1) * safeLimit;

    const [posts, total] = await Promise.all([
      this.repo.listPostsWithDetails(safeLimit, offset, null),
      this.repo.countPosts(null),
    ]);

    return {
      posts: posts.map((p) => this.toDTO(p)),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async createPost(
    authorEmployeeId: string,
    authorRole: string,
    input: CreatePostInput,
  ): Promise<FeedPostDTO> {
    if (!ALLOWED_POSTER_ROLES.includes(authorRole.toLowerCase())) {
      throw new ForbiddenError("Only admins and HR can create feed posts");
    }

    const post = await this.repo.createPost(
      authorEmployeeId,
      input.content,
      input.isPinned ?? false
    );

    // Upload each attachment to SharePoint
    for (const att of input.attachments ?? []) {
      let fileUrl = att.dataUrl;

      if (att.dataUrl.startsWith("data:") && isSharePointAvatarConfigured()) {
        const parsed = parseDataUrl(att.dataUrl);
        if (parsed) {
          try {
            const url = await uploadFileToSharePoint(
              "Feed/Attachments",
              att.fileName,
              parsed.buffer,
              parsed.contentType
            );
            if (url) fileUrl = url;
          } catch (e) {
            console.warn("[feed] SharePoint upload failed:", (e as Error)?.message);
            // Keep base64 data URL as fallback (will be large but functional)
          }
        }
      }

      await this.repo.addAttachment(post.id, att.fileName, att.mimeType, fileUrl);
    }

    const mentionIds = input.mentionedEmployeeIds ?? [];
    if (mentionIds.length) {
      const validIds = await this.repo.findActiveEmployeeIds(mentionIds, null);
      if (validIds.length) {
        await this.repo.addMentions(post.id, validIds);
        this.notifyMentions(validIds, post.id, authorEmployeeId, input.content).catch(() => {});
      }
    }

    // Fetch with full details to return complete DTO
    const detailed = await this.repo.listPostsWithDetails(1, 0, null);
    const created = detailed.find((p) => p.id === post.id);
    if (!created) {
      emitRefreshAll();
      return {
        id: post.id,
        authorEmployeeId: post.author_employee_id,
        authorName: "",
        authorJobTitle: null,
        authorDepartment: null,
        content: post.content,
        isPinned: post.is_pinned,
        createdAt: post.created_at instanceof Date ? post.created_at.toISOString() : String(post.created_at),
        updatedAt: post.updated_at instanceof Date ? post.updated_at.toISOString() : String(post.updated_at),
        attachments: [],
        reactions: [],
        mentions: [],
      };
    }
    emitRefreshAll();
    // Email: notify all active employees when a post is pinned as important
    if (input.isPinned) {
      (async()=>{try{const authorRec=await getEmployeeEmail(authorEmployeeId);const all=await getAllActiveEmployeeEmails();if(all.length)await notifyEmail("company.feed.post_pinned",{doer_name:authorRec?.name||"HR",post_id:String(post.id)},[...all]);}catch{}})();
    }
    return this.toDTO(created);
  }

  async deletePost(
    postId: string,
    requestorEmployeeId: string,
    requestorRole: string,
  ): Promise<void> {
    const post = await this.repo.findPostById(postId);
    if (!post) throw new NotFoundError("Post", postId);

    const isAdmin = ALLOWED_POSTER_ROLES.includes(requestorRole.toLowerCase());
    const isOwner = post.author_employee_id === requestorEmployeeId;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenError("You can only delete your own posts");
    }

    await this.repo.deletePost(postId);
  }

  async toggleReaction(
    postId: string,
    employeeId: string,
    emoji: string,
  ): Promise<{ action: "added" | "removed" }> {
    const post = await this.repo.findPostById(postId);
    if (!post) throw new NotFoundError("Post", postId);

    const action = await this.repo.toggleReaction(postId, employeeId, emoji);
    return { action };
  }

  /** Fetch attachment bytes for GET …/attachments/:id/content (SharePoint, data URL, or https). */
  async getAttachmentBinary(
    attachmentId: string,
  ): Promise<{ buffer: Buffer; contentType: string; fileName: string } | null> {
    const cacheKey = `feed:att:${attachmentId}`;
    const cached = memCache.get<{ buffer: Buffer; contentType: string; fileName: string }>(cacheKey);
    if (cached) return cached;

    const att = await this.repo.findAttachmentById(attachmentId);
    if (!att) return null;
    const raw = String(att.file_url ?? "").trim();
    if (!raw) return null;

    const fileName = att.file_name;
    let result: { buffer: Buffer; contentType: string; fileName: string } | null = null;

    if (raw.startsWith("data:")) {
      const parsed = parseDataUrl(raw);
      if (parsed) {
        const contentType = parsed.contentType.split(";")[0].trim() || att.mime_type || "application/octet-stream";
        result = { buffer: parsed.buffer, contentType, fileName };
      }
    } else if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const sp = await getAvatarContentBySharingUrl(raw);
      if (sp) {
        result = { buffer: sp.buffer, contentType: sp.contentType || att.mime_type, fileName };
      } else {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 15000);
          const r = await fetch(raw, { signal: ctrl.signal });
          clearTimeout(t);
          if (r.ok) {
            const contentType = r.headers.get("Content-Type") || att.mime_type || "application/octet-stream";
            const buffer = Buffer.from(await r.arrayBuffer());
            if (buffer.length > 0) result = { buffer, contentType, fileName };
          }
        } catch {
          /* ignore */
        }
      }
    }

    if (result) memCache.set(cacheKey, result, 10 * 60 * 1000);
    return result;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async notifyMentions(
    employeeIds: string[],
    postId: string,
    authorEmployeeId: string,
    content: string
  ): Promise<void> {
    const authorRec = await getEmployeeEmail(authorEmployeeId);
    const authorName = authorRec?.name?.trim() || "HR";
    const snippet = content.trim().slice(0, 280);
    const appUrl = resolvePublicAppUrlForTemplates();

    for (const employeeId of employeeIds) {
      if (employeeId === authorEmployeeId) continue;
      try {
        const target = await getEmployeeNotificationRecipient(employeeId);
        if (!target?.email) continue;
        await notifyEmail(
          "company.feed.mention",
          {
            mentioned_name: target.name || "there",
            author_name: authorName,
            post_snippet: snippet,
            post_id: String(postId),
            app_url: appUrl,
          },
          [target]
        );
      } catch {
        /* best-effort */
      }
    }
  }

  private attachmentClientUrl(att: { id: string; mime_type: string; file_url: string }): string {
    const raw = String(att.file_url ?? "").trim();
    if (!raw) return "";
    if (raw.startsWith("data:") || raw.startsWith("http://") || raw.startsWith("https://")) {
      return feedAttachmentContentUrl(att.id);
    }
    return raw;
  }

  private toDTO(row: PostWithDetails): FeedPostDTO {
    return {
      id: row.id,
      authorEmployeeId: row.author_employee_id,
      authorName: `${row.author_first_name} ${row.author_last_name}`.trim(),
      authorJobTitle: row.author_job_title ?? null,
      authorDepartment: row.author_department ?? null,
      content: row.content,
      isPinned: row.is_pinned,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      attachments: (row.attachments ?? []).map((a) => ({
        id: a.id,
        fileName: a.file_name,
        mimeType: a.mime_type,
        fileUrl: this.attachmentClientUrl(a),
      })),
      reactions: (row.reactions ?? []).map((r) => ({
        id: r.id,
        employeeId: r.employee_id,
        emoji: r.emoji,
        reactorName: `${r.reactor_first_name ?? ""} ${r.reactor_last_name ?? ""}`.trim(),
      })),
      mentions: (row.mentions ?? []).map((m) => ({
        employeeId: m.employee_id,
        name: formatEmployeeLegalName(m.first_name, m.last_name),
      })),
    };
  }
}

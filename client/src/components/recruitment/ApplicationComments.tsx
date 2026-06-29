/**
 * ApplicationComments
 *
 * Full comments panel for an applicant:
 *  - List comments (public / private) with author, timestamp, attachments
 *  - Compose: rich textarea + @mention typeahead + file attachments + visibility toggle
 *  - Upload attachments to server (SharePoint behind the scenes) before posting
 *  - Mention → email notification fired server-side
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Lock, Globe, Paperclip, Send, Trash2, X, FileText, Image as ImageIcon,
  AtSign, ChevronDown, Check, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

// ── types ─────────────────────────────────────────────────────────────────────

interface Attachment { name: string; url: string; mime: string; size: number; }

interface MentionUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url?: string | null;
}

interface Comment {
  id: string;
  application_id: string;
  author_id: string;
  body: string;
  visibility: "public" | "private";
  attachments: Attachment[] | null;
  mentions: string[] | null;
  created_at: string;
  author_email: string;
  author_first_name: string | null;
  author_last_name: string | null;
  author_avatar: string | null;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function initials(c: Comment) {
  const f = c.author_first_name?.[0] ?? "";
  const l = c.author_last_name?.[0] ?? "";
  return (f + l).toUpperCase() || c.author_email?.[0]?.toUpperCase() || "?";
}

function displayName(c: Comment) {
  if (c.author_first_name || c.author_last_name) {
    return `${c.author_first_name ?? ""} ${c.author_last_name ?? ""}`.trim();
  }
  return c.author_email;
}

function fileIcon(mime: string) {
  if (mime.startsWith("image/")) return <ImageIcon className="h-3.5 w-3.5 shrink-0" />;
  return <FileText className="h-3.5 w-3.5 shrink-0" />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── mention tokeniser helpers ─────────────────────────────────────────────────

/** Returns the @-token being typed at the current cursor position, or null. */
function getMentionQuery(text: string, cursor: number): string | null {
  const safeCursor = Math.min(Math.max(0, cursor), text.length);
  const before = text.slice(0, safeCursor);
  const match = before.match(/@([^\s@]*)$/);
  return match ? match[1] : null;
}

function matchesMentionQuery(u: MentionUser, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const email = (u.email ?? "").toLowerCase();
  const local = email.includes("@") ? email.split("@")[0] : email;
  const first = (u.first_name ?? "").toLowerCase();
  const last = (u.last_name ?? "").toLowerCase();
  const full = `${first} ${last}`.trim();
  const compact = `${first}${last}`;
  return (
    full.includes(needle)
    || compact.includes(needle)
    || first.startsWith(needle)
    || last.startsWith(needle)
    || email.includes(needle)
    || local.includes(needle)
  );
}

/** Replace the active @token with the resolved mention label. */
function replaceMentionToken(text: string, cursor: number, name: string): [string, number] {
  const before = text.slice(0, cursor);
  const after = text.slice(cursor);
  const replaced = before.replace(/@([^\s@]*)$/, `@${name} `);
  return [replaced + after, replaced.length];
}

// ── subcomponents ─────────────────────────────────────────────────────────────

function AttachmentChip({
  att,
  onRemove,
}: { att: Attachment; onRemove?: () => void }) {
  return (
    <a
      href={att.url || undefined}
      target={att.url ? "_blank" : undefined}
      rel="noopener noreferrer"
      onClick={att.url ? undefined : (e) => e.preventDefault()}
      className="inline-flex items-center gap-1.5 max-w-[200px] px-2 py-1 rounded bg-muted text-xs text-foreground hover:bg-muted/80 transition-colors"
    >
      {fileIcon(att.mime)}
      <span className="truncate">{att.name}</span>
      <span className="text-muted-foreground shrink-0">({formatBytes(att.size)})</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
          className="ml-0.5 text-muted-foreground hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </a>
  );
}

function CommentBubble({
  comment,
  currentUserId,
  onDelete,
}: { comment: Comment; currentUserId: string | undefined; onDelete: () => void }) {
  const isOwn = comment.author_id === currentUserId;
  const atts: Attachment[] = Array.isArray(comment.attachments) ? comment.attachments : [];

  // Render @mentions in body as highlighted spans
  const renderBody = (body: string) => {
    const parts = body.split(/(@\S+)/g);
    return parts.map((part, i) =>
      part.startsWith("@")
        ? <span key={i} className="text-primary font-medium">{part}</span>
        : <span key={i}>{part}</span>
    );
  };

  return (
    <div className="group flex gap-3">
      <Avatar className="h-8 w-8 shrink-0 mt-0.5">
        <AvatarFallback className="text-[11px]">{initials(comment)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-medium">{displayName(comment)}</span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
          </span>
          {comment.visibility === "private" && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-0.5 border-amber-300 text-amber-600">
              <Lock className="h-2.5 w-2.5" /> Private
            </Badge>
          )}
          {comment.visibility === "public" && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-0.5 border-teal-300 text-teal-600">
              <Globe className="h-2.5 w-2.5" /> Public
            </Badge>
          )}
          {isOwn && (
            <button
              type="button"
              onClick={onDelete}
              className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              title="Delete comment"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">
          {renderBody(comment.body)}
        </div>
        {atts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {atts.map((att, i) => <AttachmentChip key={i} att={att} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function ApplicationComments({ applicationId }: { applicationId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadedAtts, setUploadedAtts] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const commentsKey = [`/api/recruitment/applications/${applicationId}/comments`];
  const mentionableKey = [`/api/recruitment/applications/${applicationId}/mentionable`];

  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: commentsKey,
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/recruitment/applications/${applicationId}/comments`);
      return r.json();
    },
    refetchInterval: 15_000,
  });

  const { data: mentionableUsers = [], isFetched: mentionableFetched } = useQuery<MentionUser[]>({
    queryKey: mentionableKey,
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/recruitment/applications/${applicationId}/mentionable`);
      return r.json();
    },
    staleTime: 60_000,
  });

  // Auto-scroll to bottom when new comments load
  useEffect(() => {
    if (listEndRef.current) listEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  // Filter mention candidates based on query
  const filteredMentions =
    mentionQuery !== null
      ? mentionableUsers.filter((u) => matchesMentionQuery(u, mentionQuery)).slice(0, 8)
      : [];

  const postMutation = useMutation({
    mutationFn: async (payload: {
      body: string;
      visibility: string;
      attachments: Attachment[];
      mentions: string[];
    }) => {
      const r = await apiRequest("POST", `/api/recruitment/applications/${applicationId}/comments`, payload);
      if (!r.ok) throw new Error((await r.json())?.error || "Failed to post");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsKey });
      setBody("");
      setPendingFiles([]);
      setUploadedAtts([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const r = await apiRequest("DELETE", `/api/recruitment/applications/${applicationId}/comments/${commentId}`);
      if (!r.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commentsKey }),
    onError: () => toast.error("Failed to delete comment"),
  });

  /** Upload all pending files then return Attachment list */
  const uploadFiles = useCallback(async (files: File[]): Promise<Attachment[]> => {
    const results: Attachment[] = [];
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch(`/api/recruitment/applications/${applicationId}/comment-attachment`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!r.ok) throw new Error(`Upload failed: ${file.name}`);
      const att = await r.json() as Attachment;
      results.push(att);
    }
    return results;
  }, [applicationId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const MAX = 5;
    const combined = [...pendingFiles, ...files].slice(0, MAX);
    setPendingFiles(combined);
    e.target.value = "";
  };

  const removePendingFile = (i: number) => {
    setPendingFiles((prev) => prev.filter((_, idx) => idx !== i));
  };

  /** Extract @mention user IDs from body text */
  const extractMentionIds = useCallback((text: string): string[] => {
    const tokens = text.match(/@([^\s]+)/g) ?? [];
    const ids: string[] = [];
    for (const token of tokens) {
      const name = token.slice(1).toLowerCase();
      const match = mentionableUsers.find((u) => {
        const full = `${u.first_name ?? ""}_${u.last_name ?? ""}`.toLowerCase();
        const email = u.email.toLowerCase();
        return full.includes(name) || email.startsWith(name);
      });
      if (match && !ids.includes(match.id)) ids.push(match.id);
    }
    return ids;
  }, [mentionableUsers]);

  const handleSubmit = async () => {
    if (!body.trim() && !pendingFiles.length) return;
    setUploading(true);
    try {
      const newAtts = pendingFiles.length ? await uploadFiles(pendingFiles) : [];
      const allAtts = [...uploadedAtts, ...newAtts];
      const mentions = extractMentionIds(body);
      await postMutation.mutateAsync({ body: body.trim(), visibility, attachments: allAtts, mentions });
    } catch (e: any) {
      toast.error(e?.message || "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  /** Re-read caret after React commits — avoids wrong selectionStart in controlled textarea. */
  const syncMentionFromCaret = useCallback((text: string) => {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? text.length;
    setCursorPos(cursor);
    const query = getMentionQuery(text, cursor);
    setMentionQuery(query);
    setMentionOpen(query !== null);
  }, []);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setBody(val);
    const cursor = e.target.selectionStart ?? val.length;
    setCursorPos(cursor);
    const query = getMentionQuery(val, cursor);
    setMentionQuery(query);
    setMentionOpen(query !== null);
    // After React applies value to DOM, caret can be wrong for one frame — re-sync mention token
    queueMicrotask(() => {
      const el = textareaRef.current;
      if (el) syncMentionFromCaret(el.value);
    });
  };

  const handleTextareaSelect = () => {
    if (!textareaRef.current) return;
    syncMentionFromCaret(textareaRef.current.value);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && e.key === "Escape") {
      setMentionOpen(false);
      setMentionQuery(null);
      e.preventDefault();
      return;
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSubmit();
      e.preventDefault();
    }
  };

  const pickMention = (u: MentionUser) => {
    const cur = textareaRef.current?.selectionStart ?? cursorPos;
    const name = u.first_name ? `${u.first_name}${u.last_name ? `_${u.last_name}` : ""}` : u.email;
    const [newBody, newCursor] = replaceMentionToken(body, cur, name);
    setBody(newBody);
    setMentionOpen(false);
    setMentionQuery(null);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 0);
  };

  const isEmpty = !body.trim() && !pendingFiles.length;
  const isBusy = uploading || postMutation.isPending;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── comment list ── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
        {isLoading && (
          <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
            Loading comments…
          </div>
        )}
        {!isLoading && comments.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <AtSign className="h-5 w-5" />
            </div>
            <p className="text-sm">Start a discussion with panel members</p>
          </div>
        )}
        {comments.map((c) => (
          <CommentBubble
            key={c.id}
            comment={c}
            currentUserId={user?.id}
            onDelete={() => deleteMutation.mutate(c.id)}
          />
        ))}
        <div ref={listEndRef} />
      </div>

      {/* ── compose area ── */}
      <div className="border-t bg-background shrink-0">
        {/* pending file chips */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3">
            {pendingFiles.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-muted text-xs max-w-[200px]">
                {fileIcon(f.type)}
                <span className="truncate">{f.name}</span>
                <span className="text-muted-foreground">({formatBytes(f.size)})</span>
                <button type="button" onClick={() => removePendingFile(i)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="px-4 pt-3 pb-1 relative">
          {/* @mention popover */}
          {mentionOpen && mentionQuery !== null && (
            <div className="absolute bottom-full left-4 mb-1 z-50 bg-popover border rounded-md shadow-lg w-72 max-h-64 overflow-y-auto">
              {filteredMentions.length === 0 ? (
                <div className="px-3 py-2.5 text-sm text-muted-foreground">
                  {mentionableFetched && mentionableUsers.length === 0
                    ? "No teammates available to mention yet. Add recruiters or hiring managers on the job, or grant users HR/recruiter/hiring-manager roles."
                    : "No matching people. Keep typing a name or email."}
                </div>
              ) : (
                filteredMentions.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pickMention(u); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                  >
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarFallback className="text-[10px]">
                        {((u.first_name?.[0] ?? "") + (u.last_name?.[0] ?? "")).toUpperCase() || u.email[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium truncate">
                      {u.first_name ? `${u.first_name} ${u.last_name ?? ""}`.trim() : u.email}
                    </span>
                    <span className="text-muted-foreground text-xs ml-auto shrink-0">(Hiring Team)</span>
                  </button>
                ))
              )}
            </div>
          )}

          <textarea
            ref={textareaRef}
            rows={3}
            value={body}
            onChange={handleTextareaChange}
            onSelect={handleTextareaSelect}
            onClick={handleTextareaSelect}
            onKeyUp={handleTextareaSelect}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Write a comment… type @ to mention someone"
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* toolbar */}
        <div className="flex items-center gap-2 px-4 pb-3">
          {/* attach file */}
          <button
            type="button"
            title="Attach file"
            onClick={() => fileInputRef.current?.click()}
            className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          {/* visibility toggle */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs rounded-md border px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {visibility === "public"
                  ? <><Globe className="h-3.5 w-3.5 text-teal-600" /> Public</>
                  : <><Lock className="h-3.5 w-3.5 text-amber-600" /> Private</>}
                <ChevronDown className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1" align="start" side="top">
              <button
                type="button"
                onClick={() => setVisibility("public")}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-accent text-left"
              >
                <Globe className="h-4 w-4 text-teal-600" />
                <div className="flex-1">
                  <div className="font-medium">Public</div>
                  <div className="text-xs text-muted-foreground">Visible to the hiring team</div>
                </div>
                {visibility === "public" && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-accent text-left"
              >
                <Lock className="h-4 w-4 text-amber-600" />
                <div className="flex-1">
                  <div className="font-medium">Private</div>
                  <div className="text-xs text-muted-foreground">Visible to specific people</div>
                </div>
                {visibility === "private" && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            </PopoverContent>
          </Popover>

          <div className="flex-1" />

          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isEmpty || isBusy}
            className="gap-1.5"
          >
            {isBusy ? (
              <span className="flex items-center gap-1"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Posting…</span>
            ) : (
              <><Send className="h-3.5 w-3.5" /> Post Comment</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

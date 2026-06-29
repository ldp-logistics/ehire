import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { useSearch, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Paperclip,
  Send,
  Trash2,
  Pin,
  ImageIcon,
  FileText,
  X,
  ChevronDown,
  ChevronUp,
  AtSign,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileUrl: string;
}

interface Reaction {
  id: string;
  employeeId: string;
  emoji: string;
  reactorName: string;
}

interface FeedMention {
  employeeId: string;
  name: string;
}

interface MentionableUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  displayName: string;
}

interface FeedPost {
  id: string;
  authorEmployeeId: string;
  authorName: string;
  authorJobTitle: string | null;
  authorDepartment: string | null;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
  reactions: Reaction[];
  mentions: FeedMention[];
}

interface FeedListResult {
  posts: FeedPost[];
  total: number;
  page: number;
  limit: number;
}

interface PendingAttachment {
  fileName: string;
  mimeType: string;
  dataUrl: string;
  previewUrl: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const AVAILABLE_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉", "👏", "🔥"];
const QUERY_KEY = ["/api/feed"];

// ─── Helper: group reactions by emoji ────────────────────────────────────────

function getMentionQuery(text: string, cursor: number): string | null {
  const safeCursor = Math.min(Math.max(0, cursor), text.length);
  const before = text.slice(0, safeCursor);
  const match = before.match(/@([^\s@]*)$/);
  return match ? match[1] : null;
}

function matchesMentionQuery(u: MentionableUser, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const email = (u.email ?? "").toLowerCase();
  const local = email.includes("@") ? email.split("@")[0] : email;
  const first = (u.firstName ?? "").toLowerCase();
  const last = (u.lastName ?? "").toLowerCase();
  const full = (u.displayName ?? "").toLowerCase();
  return (
    full.includes(needle)
    || first.startsWith(needle)
    || last.startsWith(needle)
    || email.includes(needle)
    || local.includes(needle)
  );
}

function replaceMentionToken(text: string, cursor: number, label: string): [string, number] {
  const before = text.slice(0, cursor);
  const after = text.slice(cursor);
  const replaced = before.replace(/@([^\s@]*)$/, `@${label} `);
  return [replaced + after, replaced.length];
}

function renderPostContent(content: string, mentions: FeedMention[]): ReactNode {
  if (!mentions.length) return content;
  const names = [...mentions]
    .map((m) => m.name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!names.length) return content;
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(@(?:${escaped.join("|")}))`, "g");
  const parts = content.split(re);
  return parts.map((part, i) => {
    if (!part.startsWith("@")) {
      return <span key={i}>{part}</span>;
    }
    const name = part.slice(1);
    const mention = mentions.find((m) => m.name === name);
    if (!mention) {
      return (
        <span key={i} className="text-primary font-medium">
          {part}
        </span>
      );
    }
    return (
      <Link
        key={i}
        href={`/employees/${mention.employeeId}`}
        className="text-primary font-medium hover:underline"
      >
        {part}
      </Link>
    );
  });
}

function groupReactions(reactions: Reaction[]): Record<string, Reaction[]> {
  return reactions.reduce<Record<string, Reaction[]>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r);
    return acc;
  }, {});
}

// ─── PostCard ─────────────────────────────────────────────────────────────────

function PostCard({
  post,
  myEmployeeId,
  myName,
  canDelete,
  onDelete,
  onReact,
}: {
  post: FeedPost;
  myEmployeeId: string | null;
  myName: string;
  canDelete: boolean;
  onDelete: (id: string) => void;
  onReact: (postId: string, emoji: string) => void;
}) {
  const [showEmojis, setShowEmojis] = useState(false);
  const grouped = groupReactions(post.reactions);

  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(post.createdAt), { addSuffix: true });
    } catch {
      return "";
    }
  })();

  const initials = post.authorName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card id={`feed-post-${post.id}`} className="border border-slate-200 shadow-sm overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage
                src={`/api/employees/${post.authorEmployeeId}/avatar`}
              />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-slate-900 text-sm">
                  {post.authorName}
                </h4>
                {post.isPinned && (
                  <Badge
                    variant="secondary"
                    className="text-xs px-1.5 py-0 h-4 gap-1"
                  >
                    <Pin className="h-2.5 w-2.5" /> Pinned
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {[post.authorJobTitle, post.authorDepartment]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                {timeAgo && (
                  <span className="text-slate-400">· {timeAgo}</span>
                )}
              </p>
            </div>
          </div>

          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-red-500 h-8 w-8"
              onClick={() => onDelete(post.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Content */}
        <div className="px-4 pb-3 space-y-2">
          <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
            {renderPostContent(post.content, post.mentions ?? [])}
          </p>
          {(post.mentions ?? []).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">Tagged:</span>
              {(post.mentions ?? []).map((m) => (
                <Link key={m.employeeId} href={`/employees/${m.employeeId}`}>
                  <Badge
                    variant="secondary"
                    className="text-xs font-normal gap-1 hover:bg-primary/10 cursor-pointer"
                  >
                    <AtSign className="h-3 w-3" />
                    {m.name}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Attachments */}
        {post.attachments.length > 0 && (
          <AttachmentsDisplay attachments={post.attachments} />
        )}

        {/* Reactions bar */}
        <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
          {/* Existing grouped reactions */}
          {Object.entries(grouped).map(([emoji, reactions]) => {
            const reacted = myEmployeeId
              ? reactions.some((r) => r.employeeId === myEmployeeId)
              : false;
            const reactedBy = reactions
              .map((r) => r.reactorName || "Unknown")
              .filter(Boolean)
              .join(", ");
            return (
              <Tooltip key={emoji}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => myEmployeeId && onReact(post.id, emoji)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm border transition-colors ${
                      reacted
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span>{emoji}</span>
                    <span className="text-xs font-medium">{reactions.length}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[320px]">
                  <p className="text-xs font-medium mb-1">
                    {emoji} reacted by ({reactions.length})
                  </p>
                  <p className="text-xs text-slate-200">
                    {reactedBy || myName}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* Add reaction button */}
          {myEmployeeId && (
            <div className="relative">
              <Tooltip open={showEmojis} onOpenChange={setShowEmojis}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setShowEmojis((v) => !v)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <span>😊</span>
                    {showEmojis ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="p-2 flex gap-1 bg-white border border-slate-200 shadow-lg rounded-xl"
                >
                  {AVAILABLE_EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        onReact(post.id, e);
                        setShowEmojis(false);
                      }}
                      className="text-xl hover:scale-125 transition-transform p-0.5 rounded"
                    >
                      {e}
                    </button>
                  ))}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── AttachmentsDisplay ───────────────────────────────────────────────────────

function AttachmentsDisplay({ attachments }: { attachments: Attachment[] }) {
  const images = attachments.filter((a) => a.mimeType.startsWith("image/"));
  const files = attachments.filter((a) => !a.mimeType.startsWith("image/"));

  return (
    <div>
      {images.length > 0 && (
        <div
          className={`grid gap-1 ${
            images.length === 1 ? "grid-cols-1" : "grid-cols-2"
          }`}
        >
          {images.map((img) => (
            <a
              key={img.id}
              href={img.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="block bg-slate-100"
            >
              <img
                src={img.fileUrl}
                alt={img.fileName}
                className={`mx-auto w-full object-contain ${
                  images.length === 1
                    ? "h-auto max-h-[min(80vh,56rem)]"
                    : "h-auto max-h-60"
                }`}
                loading="lazy"
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = "none";
                  const fallback = el.nextElementSibling;
                  if (fallback instanceof HTMLElement) fallback.classList.remove("hidden");
                }}
              />
              <div className="hidden px-4 py-6 text-center text-sm text-muted-foreground bg-slate-50">
                Image could not be loaded.{" "}
                <a href={img.fileUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                  Open attachment
                </a>
              </div>
            </a>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="px-4 py-2 space-y-1">
          {files.map((f) => (
            <a
              key={f.id}
              href={f.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              <FileText className="h-4 w-4 text-slate-500 shrink-0" />
              <span className="text-sm text-slate-700 truncate">{f.fileName}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CreatePostForm ───────────────────────────────────────────────────────────

function CreatePostForm({
  myEmployeeId,
  myName,
  onCreate,
  isCreating,
}: {
  myEmployeeId: string;
  myName: string;
  onCreate: (data: {
    content: string;
    isPinned: boolean;
    attachments: PendingAttachment[];
    mentionedEmployeeIds: string[];
  }) => void;
  isCreating: boolean;
}) {
  const [content, setContent] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const [mentionLabels, setMentionLabels] = useState<Record<string, string>>({});
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: mentionableUsers = [], isFetched: mentionableFetched } = useQuery<MentionableUser[]>({
    queryKey: ["/api/feed/mentionable", mentionQuery ?? ""],
    queryFn: async () => {
      const res = await fetch(
        `/api/feed/mentionable?q=${encodeURIComponent(mentionQuery ?? "")}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load people");
      const json = await res.json();
      return (json.data ?? json) as MentionableUser[];
    },
    enabled: mentionOpen,
    staleTime: 30_000,
  });

  const filteredMentions =
    mentionQuery !== null
      ? mentionableUsers.filter((u) => matchesMentionQuery(u, mentionQuery)).slice(0, 8)
      : [];

  const initials = myName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const remaining = 10 - attachments.length;
      Array.from(files)
        .slice(0, remaining)
        .forEach((file) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            setAttachments((prev) => [
              ...prev,
              {
                fileName: file.name,
                mimeType: file.type || "application/octet-stream",
                dataUrl,
                previewUrl: file.type.startsWith("image/") ? dataUrl : null,
              },
            ]);
          };
          reader.readAsDataURL(file);
        });
    },
    [attachments.length]
  );

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

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
    setContent(val);
    const cursor = e.target.selectionStart ?? val.length;
    setCursorPos(cursor);
    const query = getMentionQuery(val, cursor);
    setMentionQuery(query);
    setMentionOpen(query !== null);
    queueMicrotask(() => {
      const el = textareaRef.current;
      if (el) syncMentionFromCaret(el.value);
    });
  };

  const pickMention = (u: MentionableUser) => {
    const cur = textareaRef.current?.selectionStart ?? cursorPos;
    const label = u.displayName || `${u.firstName} ${u.lastName}`.trim() || u.email;
    const [newBody, newCursor] = replaceMentionToken(content, cur, label);
    setContent(newBody);
    setMentionOpen(false);
    setMentionQuery(null);
    setMentionedIds((prev) => (prev.includes(u.id) ? prev : [...prev, u.id]));
    setMentionLabels((prev) => ({ ...prev, [u.id]: label }));
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 0);
  };

  const removeMention = (employeeId: string) => {
    setMentionedIds((prev) => prev.filter((id) => id !== employeeId));
    setMentionLabels((prev) => {
      const next = { ...prev };
      delete next[employeeId];
      return next;
    });
  };

  const handleSubmit = () => {
    if (!content.trim()) return;
    onCreate({
      content: content.trim(),
      isPinned,
      attachments,
      mentionedEmployeeIds: mentionedIds,
    });
    setContent("");
    setIsPinned(false);
    setAttachments([]);
    setMentionedIds([]);
    setMentionLabels({});
    setMentionOpen(false);
    setMentionQuery(null);
  };

  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="flex gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarImage src={`/api/employees/${myEmployeeId}/avatar`} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-3">
            <div className="relative">
              {mentionOpen && mentionQuery !== null && (
                <div className="absolute bottom-full left-0 mb-1 z-50 bg-popover border border-slate-200 rounded-md shadow-lg w-72 max-h-64 overflow-y-auto">
                  {filteredMentions.length === 0 ? (
                    <div className="px-3 py-2.5 text-sm text-muted-foreground">
                      {mentionableFetched && mentionableUsers.length === 0
                        ? "No employees found."
                        : "No matching people. Keep typing a name or email."}
                    </div>
                  ) : (
                    filteredMentions.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickMention(u);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100 text-left"
                      >
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarImage src={`/api/employees/${u.id}/avatar`} />
                          <AvatarFallback className="text-[10px]">
                            {((u.firstName?.[0] ?? "") + (u.lastName?.[0] ?? "")).toUpperCase() ||
                              u.email[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="font-medium truncate block">
                            {u.displayName || u.email}
                          </span>
                          {u.jobTitle && (
                            <span className="text-xs text-slate-500 truncate block">{u.jobTitle}</span>
                          )}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
              <Textarea
                ref={textareaRef}
                placeholder="Share an update… type @ to tag someone (birthday, kudos, etc.)"
                value={content}
                onChange={handleTextareaChange}
                onSelect={() => {
                  if (textareaRef.current) syncMentionFromCaret(textareaRef.current.value);
                }}
                onKeyDown={(e) => {
                  if (mentionOpen && e.key === "Escape") {
                    setMentionOpen(false);
                    setMentionQuery(null);
                    e.preventDefault();
                  }
                }}
                rows={3}
                className="resize-none bg-slate-50 border-slate-200 focus-visible:ring-1 focus-visible:ring-primary/40 text-sm"
              />
            </div>

            {mentionedIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {mentionedIds.map((id) => (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="text-xs font-normal gap-1 pr-1"
                  >
                    <AtSign className="h-3 w-3" />
                    {mentionLabels[id] ?? "Tagged"}
                    <button
                      type="button"
                      onClick={() => removeMention(id)}
                      className="ml-0.5 rounded-full hover:bg-slate-300/80 p-0.5"
                      aria-label="Remove tag"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Attachment previews */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="relative group rounded-lg border border-slate-200 overflow-hidden bg-slate-50"
                  >
                    {att.previewUrl ? (
                      <img
                        src={att.previewUrl}
                        alt={att.fileName}
                        className="h-16 w-16 object-cover"
                      />
                    ) : (
                      <div className="h-16 w-32 flex items-center gap-2 px-3">
                        <FileText className="h-5 w-5 text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-600 truncate">
                          {att.fileName}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => removeAttachment(idx)}
                      className="absolute top-0.5 right-0.5 bg-white rounded-full p-0.5 shadow opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3 text-slate-600" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Toolbar */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-slate-500 hover:text-primary h-8"
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4 mr-1.5" /> Attach
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-slate-500 hover:text-primary h-8"
                  onClick={() => {
                    if (fileRef.current) {
                      fileRef.current.accept = "image/*";
                      fileRef.current.click();
                      fileRef.current.accept =
                        "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip";
                    }
                  }}
                >
                  <ImageIcon className="h-4 w-4 mr-1.5" /> Photo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`h-8 gap-1.5 ${
                    isPinned
                      ? "text-amber-600 hover:text-amber-700"
                      : "text-slate-500 hover:text-amber-600"
                  }`}
                  onClick={() => setIsPinned((v) => !v)}
                >
                  <Pin className="h-4 w-4" />
                  {isPinned ? "Pinned" : "Pin"}
                </Button>
              </div>

              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!content.trim() || isCreating}
                className="h-8 gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                {isCreating ? "Posting…" : "Post"}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NewsFeed() {
  const { user, isAdmin, isHR } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canPost = isAdmin || isHR;
  const myEmployeeId = user?.employeeId ?? null;
  const myName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email?.split("@")[0] || "Me";

  // ── Data fetching ─────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery<{ success: boolean; data: FeedListResult }>({
    queryKey: QUERY_KEY,
    queryFn: () =>
      fetch("/api/feed?page=1&limit=50").then((r) => r.json()),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const posts: FeedPost[] = data?.data?.posts ?? [];

  const search = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(search);
    const postId = params.get("post");
    if (!postId || posts.length === 0 || !posts.some((p) => p.id === postId)) return;
    const t = window.setTimeout(() => {
      document.getElementById(`feed-post-${postId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [search, posts]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (payload: {
      content: string;
      isPinned: boolean;
      attachments: { fileName: string; mimeType: string; dataUrl: string }[];
      mentionedEmployeeIds: string[];
    }) => {
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Failed to create post");
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Post published", description: "Your post is now live." });
    },
    onError: (err: Error) => {
      toast({ title: "Post failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (postId: string) => {
      const res = await fetch(`/api/feed/${postId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete post");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Post deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const reactMutation = useMutation({
    mutationFn: async ({ postId, emoji }: { postId: string; emoji: string }) => {
      const res = await fetch(`/api/feed/${postId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error("Failed to react");
      return res.json() as Promise<{ data: { action: "added" | "removed" } }>;
    },
    onMutate: async ({ postId, emoji }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<{ success: boolean; data: FeedListResult }>(QUERY_KEY);
      if (prev?.data && myEmployeeId) {
        queryClient.setQueryData<{ success: boolean; data: FeedListResult }>(QUERY_KEY, (old) => {
          if (!old) return old;
          return {
            ...old,
            data: {
              ...old.data,
              posts: old.data.posts.map((p) => {
                if (p.id !== postId) return p;
                const alreadyReacted = p.reactions.some(
                  (r) => r.employeeId === myEmployeeId && r.emoji === emoji
                );
                return {
                  ...p,
                  reactions: alreadyReacted
                    ? p.reactions.filter(
                        (r) => !(r.employeeId === myEmployeeId && r.emoji === emoji)
                      )
                    : [...p.reactions, { id: "tmp", employeeId: myEmployeeId, emoji, reactorName: myName }],
                };
              }),
            },
          };
        });
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(QUERY_KEY, context.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleCreate = (payload: {
    content: string;
    isPinned: boolean;
    attachments: PendingAttachment[];
    mentionedEmployeeIds: string[];
  }) => {
    createMutation.mutate({
      content: payload.content,
      isPinned: payload.isPinned,
      mentionedEmployeeIds: payload.mentionedEmployeeIds,
      attachments: payload.attachments.map((a) => ({
        fileName: a.fileName,
        mimeType: a.mimeType,
        dataUrl: a.dataUrl,
      })),
    });
  };

  const handleDelete = (postId: string) => {
    if (confirm("Delete this post?")) deleteMutation.mutate(postId);
  };

  const handleReact = (postId: string, emoji: string) => {
    reactMutation.mutate({ postId, emoji });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Company Feed</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {canPost
                ? "Share updates with your team"
                : "Stay up to date with company news"}
            </p>
          </div>
          {data?.data?.total != null && (
            <span className="text-xs text-slate-400">
              {data.data.total} post{data.data.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Create post (admin/hr only) */}
        {canPost && myEmployeeId && (
          <CreatePostForm
            myEmployeeId={myEmployeeId}
            myName={myName}
            onCreate={handleCreate}
            isCreating={createMutation.isPending}
          />
        )}

        {/* Feed */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border border-slate-200">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <Card className="border border-dashed border-slate-200">
            <CardContent className="py-16 text-center">
              <div className="text-4xl mb-3">📣</div>
              <h3 className="font-semibold text-slate-700">No posts yet</h3>
              <p className="text-sm text-slate-400 mt-1">
                {canPost
                  ? "Be the first to share something with your team!"
                  : "Check back later for company updates."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                myEmployeeId={myEmployeeId}
                myName={myName}
                canDelete={
                  canPost || post.authorEmployeeId === (myEmployeeId ?? "")
                }
                onDelete={handleDelete}
                onReact={handleReact}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

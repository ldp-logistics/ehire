import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  CheckSquare, Plus, MoreHorizontal, Clock, User, AlertCircle, Search,
  Calendar, MessageSquare, Trash2, Edit3, Eye, Filter, BarChart3,
  ListTodo, KanbanSquare, AlertTriangle, CheckCircle2, CircleDot, Circle,
  Send,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { apiRequest, withRegionView, getRegionView } from "@/lib/queryClient";
import { normalizeEmployeeList } from "@/components/EmployeeSelect";
import { useAuth } from "@/hooks/useAuth";
import { format, formatDistanceToNow, isPast, isToday, isTomorrow, isValid } from "date-fns";
import { formatDateTimeDisplay, formatLeaveDisplayDate } from "@/lib/dateUtils";

// ==================== TYPES ====================

interface Task {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  priority: string;
  created_by?: string;
  createdBy?: string;
  created_by_name?: string | null;
  createdByName?: string | null;
  assignee_id?: string | null;
  assigneeId?: string | null;
  assignee_name?: string | null;
  assigneeName?: string | null;
  assignee_first_name?: string | null;
  assignee_last_name?: string | null;
  assigneeFirstName?: string | null;
  assigneeLastName?: string | null;
  assignee_avatar?: string | null;
  assigneeAvatar?: string | null;
  assignee_department?: string | null;
  watcher_ids?: string[];
  watcherIds?: string[];
  due_date?: string | null;
  dueDate?: string | null;
  completed_at?: string | null;
  completedAt?: string | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  progress: number;
  comment_count?: number;
  commentCount?: number;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  comments?: TaskComment[];
}

function taskAssigneeId(t: Task) { return t.assignee_id ?? t.assigneeId ?? null; }
function taskAssigneeFirstName(t: Task) { return t.assignee_first_name ?? t.assigneeFirstName ?? null; }
function taskAssigneeLastName(t: Task) { return t.assignee_last_name ?? t.assigneeLastName ?? null; }
function taskAssigneeName(t: Task) { return t.assignee_name ?? t.assigneeName ?? null; }
function taskAssigneeAvatar(t: Task) { return t.assignee_avatar ?? t.assigneeAvatar ?? null; }
function taskDueDate(t: Task) { return t.due_date ?? t.dueDate ?? null; }
function taskCreatedAt(t: Task) { return t.created_at ?? t.createdAt ?? null; }
function taskCreatedByName(t: Task) { return t.created_by_name ?? t.createdByName ?? null; }
function taskCommentCount(t: Task) { return t.comment_count ?? t.commentCount ?? 0; }

function taskAssigneeDisplayName(t: Task): string {
  const first = taskAssigneeFirstName(t);
  const last = taskAssigneeLastName(t);
  if (first && last) return `${first} ${last}`;
  return taskAssigneeName(t) || "Unassigned";
}

function formatAssignedAt(iso: string | null, tz?: string | null, df?: string | null): string | null {
  if (!iso) return null;
  const s = formatDateTimeDisplay(iso, tz ?? null, df ?? null);
  return s === "—" ? null : s;
}

interface TaskComment {
  id: string;
  task_id?: string;
  taskId?: string;
  author_id?: string;
  authorId?: string;
  author_name?: string | null;
  authorName?: string | null;
  content: string;
  created_at?: string;
  createdAt?: string;
}

function commentAuthorName(c: TaskComment) { return c.author_name ?? c.authorName ?? null; }
function commentCreatedAt(c: TaskComment) { return c.created_at ?? c.createdAt ?? null; }

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!isValid(d)) return "";
  return formatDistanceToNow(d, { addSuffix: true });
}

interface TaskStats {
  total: number;
  todo: number;
  in_progress: number;
  review: number;
  done: number;
  cancelled: number;
  overdue: number;
}

// ==================== CONSTANTS ====================

const STATUSES = [
  { id: "todo", label: "To Do", icon: Circle, color: "bg-slate-400" },
  { id: "in_progress", label: "In Progress", icon: CircleDot, color: "bg-blue-500" },
  { id: "review", label: "Review", icon: Eye, color: "bg-amber-500" },
  { id: "done", label: "Done", icon: CheckCircle2, color: "bg-green-500" },
];

const PRIORITIES = [
  { id: "low", label: "Low", color: "bg-green-100 text-green-700" },
  { id: "medium", label: "Medium", color: "bg-blue-100 text-blue-700" },
  { id: "high", label: "High", color: "bg-orange-100 text-orange-700" },
  { id: "urgent", label: "Urgent", color: "bg-red-100 text-red-700" },
];

const CATEGORIES = [
  { id: "general", label: "General" },
  { id: "onboarding", label: "Onboarding" },
  { id: "offboarding", label: "Offboarding" },
  { id: "recruitment", label: "Recruitment" },
  { id: "compliance", label: "Compliance" },
  { id: "training", label: "Training" },
  { id: "performance", label: "Performance" },
  { id: "payroll", label: "Payroll" },
  { id: "it", label: "IT" },
  { id: "admin", label: "Admin" },
];

function priorityBadge(priority: string) {
  const p = PRIORITIES.find((pr) => pr.id === priority);
  return <Badge className={`${p?.color || "bg-slate-100 text-slate-700"} text-[10px]`}>{p?.label || priority}</Badge>;
}

function formatDue(dueDate: string | null, tz?: string | null, df?: string | null) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  if (isNaN(d.getTime())) return null;
  if (isToday(d)) return { text: "Today", overdue: false, className: "text-amber-600" };
  if (isTomorrow(d)) return { text: "Tomorrow", overdue: false, className: "text-slate-500" };
  const label = formatLeaveDisplayDate(dueDate, tz ?? null, df ?? null);
  if (isPast(d)) return { text: label, overdue: true, className: "text-red-600 font-semibold" };
  return { text: label, overdue: false, className: "text-slate-500" };
}

// ==================== TASK DIALOG ====================

function TaskDialog({
  open, onClose, task, employees, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  task: Task | null; // null = create
  employees: Array<{ id: string; first_name: string; last_name: string; department?: string; work_email?: string }>;
  onCreated?: (task: Task) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("todo");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);

  // Reset form when opening
  const resetForm = () => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setCategory(task.category);
      setPriority(task.priority);
      setStatus(task.status);
      setAssigneeId(taskAssigneeId(task) || "");
      setDueDate(taskDueDate(task) ? format(new Date(taskDueDate(task)!), "yyyy-MM-dd") : "");
    } else {
      setTitle(""); setDescription(""); setCategory("general"); setPriority("medium"); setStatus("todo"); setAssigneeId(""); setDueDate("");
    }
  };

  // Reset when dialog opens
  useState(() => { resetForm(); });
  // Also reset when task changes
  const [lastTaskId, setLastTaskId] = useState<string | null>(null);
  if ((task?.id || null) !== lastTaskId) {
    setLastTaskId(task?.id || null);
    resetForm();
  }

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setLoading(true);
    try {
      if (task) {
        await apiRequest("PATCH", `/api/tasks/${task.id}`, {
          title, description: description || null, category, priority, status,
          assigneeId: assigneeId || null,
          dueDate: dueDate || null,
        });
        toast.success("Task updated");
      } else {
        const r = await apiRequest("POST", "/api/tasks", {
          title, description: description || null, category, priority, status,
          assigneeId: assigneeId || null,
          dueDate: dueDate || null,
        });
        const json = await r.json();
        const created = (json?.data ?? json) as Task;
        toast.success("Task created");
        onCreated?.(created);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save task");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{task ? "Edit Task" : "Create Task"}</DialogTitle>
          <DialogDescription>
            {task ? "Update the task details." : "Assign an HR task to a team member."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Review compliance documents" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details about the task..." rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Assign To</Label>
            <Select value={assigneeId || "__none__"} onValueChange={(v) => setAssigneeId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.first_name} {e.last_name}{e.department ? ` · ${e.department}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading || !title.trim()}>
            {loading ? "Saving..." : task ? "Update" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== TASK DETAIL DIALOG ====================

function TaskDetailDialog({
  open, onClose, taskId,
}: {
  open: boolean;
  onClose: () => void;
  taskId: string | null;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [comment, setComment] = useState("");

  const { data: task } = useQuery<Task>({
    queryKey: ["/api/tasks", taskId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/tasks/${taskId}`);
      const json = await r.json();
      return json?.data ?? json;
    },
    enabled: !!taskId && open,
  });

  const commentMutation = useMutation({
    mutationFn: async (content: string) => {
      const r = await apiRequest("POST", `/api/tasks/${taskId}/comments`, { content });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setComment("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      const r = await apiRequest("PATCH", `/api/tasks/${taskId}`, { status });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast.success("Status updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!task) return null;

  const due = formatDue(taskDueDate(task), user?.timeZone ?? null, user?.dateFormat ?? null);
  const assigneeName = taskAssigneeDisplayName(task);
  const assignedBy = taskCreatedByName(task);
  const assignedAt = formatAssignedAt(taskCreatedAt(task), user?.timeZone ?? null, user?.dateFormat ?? null);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <DialogTitle className="text-lg">{task.title}</DialogTitle>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {priorityBadge(task.priority)}
                <Badge variant="outline" className="text-[10px]">{CATEGORIES.find((c) => c.id === task.category)?.label || task.category}</Badge>
                {due && <span className={`text-xs flex items-center gap-1 ${due.className}`}><Clock className="h-3 w-3" /> {due.text}</span>}
              </div>
              {assignedBy && assignedAt && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <User className="h-3 w-3 shrink-0" />
                  Assigned by <span className="font-medium text-foreground">{assignedBy}</span> on {assignedAt}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 pb-4">
            {task.description && (
              <div>
                <Label className="text-xs text-muted-foreground">Description</Label>
                <p className="text-sm mt-1 whitespace-pre-wrap">{task.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Assigned To</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Avatar className="h-6 w-6">
                    {taskAssigneeAvatar(task) && taskAssigneeId(task) && <AvatarImage src={`/api/employees/${taskAssigneeId(task)}/avatar`} />}
                    <AvatarFallback className="text-[10px]">{assigneeName.split(" ").map((n) => n[0]).join("").slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{assigneeName}</span>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={task.status} onValueChange={(v) => statusMutation.mutate(v)}>
                  <SelectTrigger className="h-8 mt-1 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {task.progress > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Progress</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Progress value={task.progress} className="h-2 flex-1" />
                  <span className="text-xs text-muted-foreground">{task.progress}%</span>
                </div>
              </div>
            )}

            <Separator />

            {/* Comments */}
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Comments ({task.comments?.length || 0})</Label>
              <div className="space-y-3 mt-2">
                {(task.comments || []).map((c) => {
                  const relativeTime = formatRelativeTime(commentCreatedAt(c));
                  return (
                  <div key={c.id} className="flex gap-2">
                    <Avatar className="h-6 w-6 mt-0.5">
                      <AvatarFallback className="text-[10px]">{(commentAuthorName(c) || "?").split(" ").map((n) => n[0]).join("").slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{commentAuthorName(c) || "Unknown"}</span>
                        {relativeTime && (
                          <span className="text-[10px] text-muted-foreground">{relativeTime}</span>
                        )}
                      </div>
                      <p className="text-sm mt-0.5">{c.content}</p>
                    </div>
                  </div>
                  );
                })}
              </div>

              <div className="flex gap-2 mt-3">
                <Input
                  placeholder="Add a comment..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && comment.trim()) commentMutation.mutate(comment.trim()); }}
                  className="text-sm"
                />
                <Button size="sm" disabled={!comment.trim() || commentMutation.isPending} onClick={() => commentMutation.mutate(comment.trim())}>
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ==================== KANBAN CARD ====================

function TaskCard({ task, onEdit, onView, onDelete, onStatusChange }: {
  task: Task;
  onEdit: () => void;
  onView: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
}) {
  const { user } = useAuth();
  const due = formatDue(taskDueDate(task), user?.timeZone ?? null, user?.dateFormat ?? null);
  const assigneeName = taskAssigneeDisplayName(task);
  const assigneeOnly = taskAssigneeId(task) ? assigneeName : null;
  const initials = assigneeOnly ? assigneeOnly.split(" ").map((n) => n[0]).join("").slice(0, 2) : "?";
  const assignedBy = taskCreatedByName(task);
  const assignedAt = formatAssignedAt(taskCreatedAt(task), user?.timeZone ?? null, user?.dateFormat ?? null);

  return (
    <Card className="border shadow-sm hover:shadow-md cursor-pointer hover:border-blue-300 transition-all group" onClick={onView}>
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-2">
          {priorityBadge(task.priority)}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={onEdit}><Edit3 className="h-3.5 w-3.5 mr-2" /> Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={onView}><Eye className="h-3.5 w-3.5 mr-2" /> View Details</DropdownMenuItem>
              <DropdownMenuSeparator />
              {STATUSES.filter((s) => s.id !== task.status).map((s) => (
                <DropdownMenuItem key={s.id} onClick={() => onStatusChange(s.id)}>
                  <s.icon className="h-3.5 w-3.5 mr-2" /> Move to {s.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-red-600"><Trash2 className="h-3.5 w-3.5 mr-2" /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <h4 className="font-semibold text-sm text-foreground mb-1 line-clamp-2">{task.title}</h4>

        {task.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{task.description}</p>}

        <Badge variant="outline" className="text-[10px] mb-2">{CATEGORIES.find((c) => c.id === task.category)?.label || task.category}</Badge>

        {assignedBy && assignedAt && (
          <p className="text-[10px] text-muted-foreground mb-2 line-clamp-2">
            Assigned by <span className="font-medium">{assignedBy}</span> · {assignedAt}
          </p>
        )}

        {task.progress > 0 && task.status !== "done" && (
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5">
              <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${task.progress}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground">{task.progress}%</span>
          </div>
        )}

        <div className="flex justify-between items-center pt-1">
          <div className="flex items-center gap-1.5">
            {assigneeOnly && (
              <div className="flex items-center gap-1">
                <Avatar className="h-5 w-5">
                  {taskAssigneeAvatar(task) && taskAssigneeId(task) && <AvatarImage src={`/api/employees/${taskAssigneeId(task)}/avatar`} />}
                  <AvatarFallback className="text-[8px]">{initials}</AvatarFallback>
                </Avatar>
                <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{assigneeOnly.split(" ")[0]}</span>
              </div>
            )}
            {taskCommentCount(task) > 0 && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MessageSquare className="h-3 w-3" /> {taskCommentCount(task)}</span>
            )}
          </div>
          {due && (
            <span className={`text-[10px] flex items-center gap-0.5 ${due.className}`}>
              {due.overdue && <AlertTriangle className="h-3 w-3" />}
              <Clock className="h-3 w-3" /> {due.text}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== MAIN PAGE ====================

export default function Tasks() {
  const queryClient = useQueryClient();
  const { user, effectiveRole } = useAuth();
  const [, setLocation] = useLocation();
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; taskId: string | null }>({ open: false, taskId: null });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get("task")?.trim();
    if (!taskId) return;
    setDetailDialog({ open: true, taskId });
    params.delete("task");
    const qs = params.toString();
    const next = `/tasks${qs ? `?${qs}` : ""}`;
    window.history.replaceState(null, "", next);
    setLocation(next);
  }, [setLocation]);

  // Fetch tasks (API returns { success, data: Task[] })
  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["/api/tasks", getRegionView(), filterStatus, filterPriority, filterCategory, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterPriority !== "all") params.set("priority", filterPriority);
      if (filterCategory !== "all") params.set("category", filterCategory);
      if (searchTerm) params.set("search", searchTerm);
      const qs = params.toString();
      const r = await fetch(withRegionView(qs ? `/api/tasks?${qs}` : "/api/tasks"), { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch tasks");
      const json = await r.json();
      return Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    },
    refetchInterval: 15000,
    placeholderData: keepPreviousData,
  });

  const { data: stats } = useQuery<TaskStats>({
    queryKey: ["/api/tasks/stats", getRegionView()],
    queryFn: async () => {
      const r = await fetch(withRegionView("/api/tasks/stats"), { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch task stats");
      const json = await r.json();
      const raw = json?.data ?? json;
      return raw && typeof raw === "object" ? raw as TaskStats : { total: 0, todo: 0, in_progress: 0, review: 0, done: 0, cancelled: 0, overdue: 0 };
    },
    refetchInterval: 15000,
  });

  const { data: employeesRaw } = useQuery({
    queryKey: ["/api/employees", getRegionView()],
    queryFn: async () => {
      const r = await fetch(withRegionView("/api/employees"), { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch employees");
      return r.json();
    },
  });
  const employees = normalizeEmployeeList(employeesRaw);

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast.success("Task deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // Optimistic update
      queryClient.setQueryData<Task[]>(["/api/tasks", getRegionView(), filterStatus, filterPriority, filterCategory, searchTerm], (prev) => {
        if (!prev) return prev;
        return prev.map((t) => (t.id === id ? { ...t, status, progress: status === "done" ? 100 : t.progress } : t));
      });
      await apiRequest("PATCH", `/api/tasks/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast.error(err.message);
    },
  });

  const handleDelete = (id: string) => {
    if (confirm("Delete this task?")) deleteMutation.mutate(id);
  };

  // Board columns
  const boardStatuses = STATUSES;
  const taskList = Array.isArray(tasks) ? tasks : [];
  const boardTasks = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const s of boardStatuses) map[s.id] = [];
    for (const t of taskList) {
      if (map[t.status]) map[t.status].push(t);
    }
    return map;
  }, [taskList]);

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Task Management</h1>
          <p className="text-muted-foreground text-sm">Track HR projects, assignments, and daily to-dos.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setTaskDialog({ open: true, task: null })}>
            <Plus className="h-4 w-4 mr-2" /> Create Task
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Card className="border">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg"><ListTodo className="h-4 w-4 text-slate-600" /></div>
              <div><p className="text-lg font-bold">{stats.total}</p><p className="text-[10px] text-muted-foreground">Total</p></div>
            </CardContent>
          </Card>
          <Card className="border">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg"><CircleDot className="h-4 w-4 text-blue-600" /></div>
              <div><p className="text-lg font-bold">{stats.in_progress}</p><p className="text-[10px] text-muted-foreground">In Progress</p></div>
            </CardContent>
          </Card>
          <Card className="border">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg"><Eye className="h-4 w-4 text-amber-600" /></div>
              <div><p className="text-lg font-bold">{stats.review}</p><p className="text-[10px] text-muted-foreground">Review</p></div>
            </CardContent>
          </Card>
          <Card className="border">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg"><CheckCircle2 className="h-4 w-4 text-green-600" /></div>
              <div><p className="text-lg font-bold">{stats.done}</p><p className="text-[10px] text-muted-foreground">Done</p></div>
            </CardContent>
          </Card>
          {stats.overdue > 0 && (
            <Card className="border border-red-200 dark:border-red-800">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg"><AlertTriangle className="h-4 w-4 text-red-600" /></div>
                <div><p className="text-lg font-bold text-red-600">{stats.overdue}</p><p className="text-[10px] text-muted-foreground">Overdue</p></div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Filters & View Toggle */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search tasks..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            {PRIORITIES.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-1">
          <Button variant={viewMode === "board" ? "default" : "outline"} size="sm" onClick={() => setViewMode("board")}>
            <KanbanSquare className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === "list" ? "default" : "outline"} size="sm" onClick={() => setViewMode("list")}>
            <ListTodo className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Board View — fixed height + min-h-0 so columns don't break when one has many cards */}
      {viewMode === "board" && (
        <div className="flex gap-4 overflow-x-auto overflow-y-hidden pb-4" style={{ height: "calc(100vh - 380px)", scrollbarGutter: "stable" }}>
          {boardStatuses.map((col) => {
            const colTasks = boardTasks[col.id] || [];
            return (
              <div key={col.id} className="flex-shrink-0 w-72 flex h-full min-h-0 flex-col bg-muted/30 rounded-xl border">
                <div className="p-3 flex items-center justify-between border-b bg-muted/50 rounded-t-xl flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
                    <h3 className="font-semibold text-sm">{col.label}</h3>
                  </div>
                  <Badge variant="secondary" className="text-xs">{colTasks.length}</Badge>
                </div>
                <ScrollArea className="flex-1 min-h-0 p-2">
                  <div className="space-y-2">
                    {colTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onEdit={() => setTaskDialog({ open: true, task })}
                        onView={() => setDetailDialog({ open: true, taskId: task.id })}
                        onDelete={() => handleDelete(task.id)}
                        onStatusChange={(status) => statusMutation.mutate({ id: task.id, status })}
                      />
                    ))}
                    {colTasks.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-8">No tasks</p>
                    )}
                  </div>
                </ScrollArea>
                <div className="p-2 border-t flex-shrink-0">
                  <Button variant="ghost" size="sm" className="w-full text-muted-foreground text-xs" onClick={() => setTaskDialog({ open: true, task: null })}>
                    <Plus className="h-3 w-3 mr-1" /> Add Task
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Task</th>
                    <th className="text-left p-3 font-medium">Assignee</th>
                    <th className="text-left p-3 font-medium">Assigned By</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Priority</th>
                    <th className="text-left p-3 font-medium">Category</th>
                    <th className="text-left p-3 font-medium">Due Date</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {taskList.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">No tasks found</td></tr>
                  )}
                  {taskList.map((task) => {
                    const due = formatDue(taskDueDate(task), user?.timeZone ?? null, user?.dateFormat ?? null);
                    const assigneeName = taskAssigneeDisplayName(task);
                    const assignedBy = taskCreatedByName(task);
                    const assignedAt = formatAssignedAt(taskCreatedAt(task), user?.timeZone ?? null, user?.dateFormat ?? null);
                    const statusInfo = STATUSES.find((s) => s.id === task.status);
                    return (
                      <tr key={task.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setDetailDialog({ open: true, taskId: task.id })}>
                        <td className="p-3">
                          <div className="font-medium">{task.title}</div>
                          {task.description && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{task.description}</p>}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              {taskAssigneeAvatar(task) && taskAssigneeId(task) && <AvatarImage src={`/api/employees/${taskAssigneeId(task)}/avatar`} />}
                              <AvatarFallback className="text-[9px]">{assigneeName.split(" ").map((n) => n[0]).join("").slice(0, 2)}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{assigneeName}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          {assignedBy ? (
                            <div>
                              <p className="text-sm">{assignedBy}</p>
                              {assignedAt && <p className="text-[10px] text-muted-foreground">{assignedAt}</p>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-[10px]">
                            {statusInfo && <statusInfo.icon className="h-3 w-3 mr-1" />}
                            {statusInfo?.label || task.status}
                          </Badge>
                        </td>
                        <td className="p-3">{priorityBadge(task.priority)}</td>
                        <td className="p-3"><Badge variant="outline" className="text-[10px]">{CATEGORIES.find((c) => c.id === task.category)?.label || task.category}</Badge></td>
                        <td className="p-3">
                          {due ? <span className={`text-xs ${due.className}`}>{due.overdue && <AlertTriangle className="h-3 w-3 inline mr-1" />}{due.text}</span> : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setTaskDialog({ open: true, task })}><Edit3 className="h-3.5 w-3.5 mr-2" /> Edit</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {STATUSES.filter((s) => s.id !== task.status).map((s) => (
                                <DropdownMenuItem key={s.id} onClick={() => statusMutation.mutate({ id: task.id, status: s.id })}>
                                  <s.icon className="h-3.5 w-3.5 mr-2" /> {s.label}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleDelete(task.id)} className="text-red-600"><Trash2 className="h-3.5 w-3.5 mr-2" /> Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <TaskDialog
        open={taskDialog.open}
        onClose={() => setTaskDialog({ open: false, task: null })}
        task={taskDialog.task}
        employees={employees}
        onCreated={(created) => setDetailDialog({ open: true, taskId: created.id })}
      />
      <TaskDetailDialog open={detailDialog.open} onClose={() => setDetailDialog({ open: false, taskId: null })} taskId={detailDialog.taskId} />
    </Layout>
  );
}

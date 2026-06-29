import type { TaskRow } from "./TaskRepository.js";
import { TaskRepository } from "./TaskRepository.js";
import {
  notifyEmail,
  getEmployeeEmail,
  getEmployeeNotificationRecipient,
  dedupeRecipientsByEmail,
  resolveActorDisplayForEmail,
  type Recipient,
} from "../../lib/emailNotifications.js";
import { taskDetailDeepLink } from "../../../shared/notificationDeepLinks.js";

const repo = new TaskRepository();

function resolvePublicAppUrl(): string {
  const base = (
    process.env.APP_PUBLIC_URL ??
    process.env.APP_URL ??
    process.env.VITE_APP_URL ??
    "http://localhost:5000"
  ).replace(/\/$/, "");
  return base;
}

function taskUrl(taskId: string): string {
  return `${resolvePublicAppUrl()}${taskDetailDeepLink(taskId)}`;
}

function formatDueDate(due: string | null | undefined): string {
  if (!due) return "—";
  try {
    const d = new Date(due);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function truncateComment(content: string, max = 240): string {
  const t = content.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

async function resolveTaskParticipantRecipients(
  task: TaskRow,
  excludeUserId: string,
): Promise<Recipient[]> {
  const out: Recipient[] = [];

  if (task.created_by && task.created_by !== excludeUserId) {
    const creator = await repo.getUserRecipient(task.created_by);
    if (creator) out.push(creator);
  }

  if (task.assignee_id) {
    const assigneeUserId = await repo.getUserIdForEmployee(task.assignee_id);
    if (assigneeUserId !== excludeUserId) {
      const assignee = await getEmployeeEmail(task.assignee_id);
      if (assignee) out.push(assignee);
    }
  }

  const watchers = Array.isArray(task.watcher_ids) ? task.watcher_ids : [];
  for (const empId of watchers) {
    if (!empId || empId === task.assignee_id) continue;
    const watcherUserId = await repo.getUserIdForEmployee(empId);
    if (watcherUserId === excludeUserId) continue;
    const w = await getEmployeeNotificationRecipient(empId);
    if (w) out.push(w);
  }

  return dedupeRecipientsByEmail(out);
}

export async function notifyTaskAssigned(
  task: TaskRow,
  assigneeEmployeeId: string,
  assignedByUserId: string,
): Promise<void> {
  const assigneeUserId = await repo.getUserIdForEmployee(assigneeEmployeeId);
  if (assigneeUserId === assignedByUserId) return;

  const recipient = await getEmployeeEmail(assigneeEmployeeId);
  if (!recipient) return;

  const doerName = await resolveActorDisplayForEmail(assignedByUserId);
  await notifyEmail(
    "task.assigned",
    {
      task_name: task.title,
      due_date: formatDueDate(task.due_date),
      priority: task.priority,
      doer_name: doerName,
      task_notes: task.description?.trim() || "—",
      task_url: taskUrl(task.id),
    },
    [recipient],
  );
}

export async function notifyTaskCompleted(
  task: TaskRow,
  completedByUserId: string,
): Promise<void> {
  if (!task.created_by || task.created_by === completedByUserId) return;
  const recipient = await repo.getUserRecipient(task.created_by);
  if (!recipient) return;

  const doerName = await resolveActorDisplayForEmail(completedByUserId);
  await notifyEmail(
    "task.completed",
    {
      task_name: task.title,
      doer_name: doerName,
      task_url: taskUrl(task.id),
    },
    [recipient],
  );
}

export async function notifyTaskComment(
  task: TaskRow,
  comment: { content: string; authorId: string; authorName: string },
): Promise<void> {
  const recipients = await resolveTaskParticipantRecipients(task, comment.authorId);
  if (!recipients.length) return;

  await notifyEmail(
    "task.comment",
    {
      task_name: task.title,
      commenter_name: comment.authorName,
      comment_preview: truncateComment(comment.content),
      task_url: taskUrl(task.id),
    },
    recipients,
  );
}

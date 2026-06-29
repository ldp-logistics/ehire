import { z } from "zod";

export const TASK_STATUSES = ["todo", "in_progress", "review", "done", "cancelled"] as const;
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const TASK_CATEGORIES = [
  "general", "onboarding", "offboarding", "payroll", "it", "admin",
  "compliance", "recruitment", "other",
] as const;

export const CreateTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  description: z.string().trim().max(5000).optional(),
  category: z.enum(TASK_CATEGORIES).optional().default("general"),
  status: z.enum(TASK_STATUSES).optional().default("todo"),
  priority: z.enum(TASK_PRIORITIES).optional().default("medium"),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
  watcherIds: z.array(z.string()).optional().default([]),
});

export const UpdateTaskSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  category: z.enum(TASK_CATEGORIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  watcherIds: z.array(z.string()).optional(),
});

export const CreateTaskCommentSchema = z.object({
  content: z.string().trim().min(1, "Comment content is required").max(5000),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type CreateTaskCommentInput = z.infer<typeof CreateTaskCommentSchema>;

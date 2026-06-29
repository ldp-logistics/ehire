import { sql } from "drizzle-orm";
import { pgTable, varchar, text, timestamp, pgEnum, integer, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./users";
import { employees } from "./employees";

// Enums
export const taskStatusEnum = pgEnum("task_status", ["todo", "in_progress", "review", "done", "cancelled"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high", "urgent"]);
export const taskCategoryEnum = pgEnum("task_category", [
  "general",
  "onboarding",
  "offboarding",
  "recruitment",
  "compliance",
  "training",
  "performance",
  "payroll",
  "it",
  "admin",
]);

export const tasks = pgTable(
  "tasks",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),

    // Core fields
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    category: taskCategoryEnum("category").notNull().default("general"),
    status: taskStatusEnum("status").notNull().default("todo"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),

    // Assignment
    createdBy: varchar("created_by", { length: 255 }).notNull().references(() => users.id, { onDelete: "restrict" }), // user ID who created
    assigneeId: varchar("assignee_id", { length: 255 }).references(() => employees.id, { onDelete: "set null" }), // employee ID
    assigneeName: varchar("assignee_name", { length: 255 }), // denormalized for fast display
    /** Additional watchers / collaborators (employee IDs) */
    watcherIds: jsonb("watcher_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),

    // Dates
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    // Optional link to a related entity (e.g. onboarding record, employee, job posting)
    relatedEntityType: varchar("related_entity_type", { length: 50 }), // 'employee' | 'onboarding' | 'job' | etc.
    relatedEntityId: varchar("related_entity_id", { length: 255 }),

    // Progress (0-100)
    progress: integer("progress").notNull().default(0),

    // Comments count (denormalized)
    commentCount: integer("comment_count").notNull().default(0),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    assigneeIdx: index("tasks_assignee_id_idx").on(table.assigneeId),
    createdByIdx: index("tasks_created_by_idx").on(table.createdBy),
    statusIdx: index("tasks_status_idx").on(table.status),
    dueDateIdx: index("tasks_due_date_idx").on(table.dueDate),
    categoryIdx: index("tasks_category_idx").on(table.category),
  })
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    taskId: varchar("task_id", { length: 255 }).notNull().references(() => tasks.id, { onDelete: "cascade" }),
    authorId: varchar("author_id", { length: 255 }).notNull().references(() => users.id, { onDelete: "restrict" }), // user ID
    authorName: varchar("author_name", { length: 255 }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskIdx: index("task_comments_task_id_idx").on(table.taskId),
  })
);

// Zod schemas
export const insertTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  category: z.enum(["general", "onboarding", "offboarding", "recruitment", "compliance", "training", "performance", "payroll", "it", "admin"]).optional(),
  status: z.enum(["todo", "in_progress", "review", "done", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  relatedEntityType: z.string().optional().nullable(),
  relatedEntityId: z.string().optional().nullable(),
  watcherIds: z.array(z.string()).optional(),
});

export const insertTaskCommentSchema = z.object({
  content: z.string().min(1),
});

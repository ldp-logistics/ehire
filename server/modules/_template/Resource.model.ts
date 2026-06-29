/**
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO USE THIS TEMPLATE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Copy the entire `_template` folder to `server/modules/<your-module-name>/`
 * 2. Find-and-replace across all copied files:
 *      "Resource"   → "YourEntity"       (PascalCase, e.g. "LeaveType")
 *      "resource"   → "yourEntity"       (camelCase,  e.g. "leaveType")
 *      "resources"  → "yourEntities"     (plural,     e.g. "leaveTypes")
 *      "resource"   → "your_table_name"  (snake_case in SQL)
 * 3. Update the Drizzle table definition below.
 * 4. Write the SQL migration file in migrations/.
 * 5. Register the new router in server/routes.ts.
 * 6. Delete this comment block.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Resource.model.ts — Drizzle ORM schema for the `resources` table.
 */

import { sql } from "drizzle-orm";
import { pgTable, varchar, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { z } from "zod";

// ─── Table ────────────────────────────────────────────────────────────────────

export const resources = pgTable("resources", {
  id: varchar("id", { length: 255 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Drizzle-Zod schemas (auto-generated) ────────────────────────────────────

export const insertResourceSchema = createInsertSchema(resources, {
  name: (s) => s.min(1).max(200),
});

export const selectResourceSchema = createSelectSchema(resources);

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type ResourceInsert = z.infer<typeof insertResourceSchema>;
export type ResourceSelect = z.infer<typeof selectResourceSchema>;

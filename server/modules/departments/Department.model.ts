/**
 * Department.model.ts — Drizzle ORM schema for the departments table.
 *
 * The departments table already exists in the DB (managed via orgStructure migrations).
 * This file re-exports the schema for use in this module and defines the TypeScript
 * row types derived from Drizzle's infer helpers.
 *
 * If you need to extend the schema (add a column), add it here AND write a new migration.
 */

import { sql } from "drizzle-orm";
import { pgTable, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { z } from "zod";

// ─── Table definition ─────────────────────────────────────────────────────────

export const departments = pgTable(
  "departments",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    freshteamId: varchar("freshteam_id", { length: 32 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    freshteamIdIdx: index("departments_freshteam_id_idx").on(table.freshteamId),
  }),
);

// ─── Derived Zod schemas (auto-generated from the table definition) ───────────

export const insertDepartmentSchema = createInsertSchema(departments, {
  name: (s) => s.min(1, "Name is required").max(150),
});

export const selectDepartmentSchema = createSelectSchema(departments);

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type DepartmentInsert = z.infer<typeof insertDepartmentSchema>;
export type DepartmentSelect = z.infer<typeof selectDepartmentSchema>;

/**
 * Organization structure synced from FreshTeam (branches → location, departments, teams, etc.).
 * Employees reference these by text (department, location, primary_team, etc.); these tables
 * provide canonical lists for dropdowns and for idempotent sync via freshteam_id.
 */
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, index, boolean } from "drizzle-orm/pg-core";

const freshteamIdLength = 32;

export const branches = pgTable(
  "branches",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    freshteamId: varchar("freshteam_id", { length: freshteamIdLength }),
    city: text("city"),
    state: text("state"),
    countryCode: varchar("country_code", { length: 10 }),
    /** Region key for multi-region access control: 'PK' | 'US' | 'IN-N' | 'IN-S'. */
    regionCode: text("region_code"),
    timeZone: text("time_zone"),
    /** Display hint for leave/profile dates, e.g. dd/MM/yyyy, MM/dd/yyyy */
    dateFormat: varchar("date_format", { length: 32 }),
    currency: varchar("currency", { length: 10 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    freshteamIdIdx: index("branches_freshteam_id_idx").on(table.freshteamId),
  })
);

export const departments = pgTable(
  "departments",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    freshteamId: varchar("freshteam_id", { length: freshteamIdLength }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    freshteamIdIdx: index("departments_freshteam_id_idx").on(table.freshteamId),
  })
);

export const subDepartments = pgTable(
  "sub_departments",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    freshteamId: varchar("freshteam_id", { length: freshteamIdLength }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    freshteamIdIdx: index("sub_departments_freshteam_id_idx").on(table.freshteamId),
  })
);

export const businessUnits = pgTable(
  "business_units",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    description: text("description"),
    freshteamId: varchar("freshteam_id", { length: freshteamIdLength }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    freshteamIdIdx: index("business_units_freshteam_id_idx").on(table.freshteamId),
  })
);

export const teams = pgTable(
  "teams",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    freshteamId: varchar("freshteam_id", { length: freshteamIdLength }),
    managerId: varchar("manager_id", { length: 255 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    freshteamIdIdx: index("teams_freshteam_id_idx").on(table.freshteamId),
  })
);

export const levels = pgTable(
  "levels",
  {
    id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    freshteamId: varchar("freshteam_id", { length: freshteamIdLength }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    freshteamIdIdx: index("levels_freshteam_id_idx").on(table.freshteamId),
  })
);

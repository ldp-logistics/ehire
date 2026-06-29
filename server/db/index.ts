import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as employeesSchema from "./schema/employees";
import * as assetsSchema from "./schema/assets";
import * as onboardingSchema from "./schema/onboarding";

// Load .env file if not already loaded
config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema: { ...employeesSchema, ...assetsSchema, ...onboardingSchema } });

// Re-export schema for convenience
export * from "./schema/employees";
export * from "./schema/assets";
export * from "./schema/onboarding";

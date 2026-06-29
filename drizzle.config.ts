import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: [
    "./server/db/schema/employees.ts",
    "./server/db/schema/users.ts",
    "./server/db/schema/changeRequests.ts",
    "./server/db/schema/assets.ts",
    "./server/db/schema/onboarding.ts",
    "./server/db/schema/recruitment.ts",
    "./server/db/schema/attendance.ts",
    "./server/db/schema/tentative.ts",
    "./server/db/schema/offboarding.ts",
    "./server/db/schema/leave.ts",
    "./server/db/schema/orgStructure.ts",
    "./server/db/schema/tasks.ts",
    "./server/db/schema/compensation.ts",
    "./server/db/schema/employeeDocuments.ts",
    "./server/db/schema/employeeProfileChanges.ts",
  ],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});

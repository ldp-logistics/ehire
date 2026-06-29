/**
 * Apply stock_items region migration (0131).
 * Usage: node scripts/apply-stock-region-migration.mjs
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

config();
const sql = neon(process.env.DATABASE_URL);

const mig = readFileSync("migrations/0131_stock_items_region.sql", "utf8");
for (const stmt of mig.split(";").map((s) => s.trim()).filter(Boolean)) {
  await sql(stmt);
}

const rows = await sql`
  SELECT region_code, COUNT(*)::int AS n FROM stock_items GROUP BY region_code ORDER BY region_code
`;
console.log("stock_items by region:", rows);

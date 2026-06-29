import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
config();
const sql = neon(process.env.DATABASE_URL);

const nullRegion = await sql`SELECT COUNT(*)::int as cnt FROM job_postings WHERE region_code IS NULL`;
const byRegion = await sql`SELECT region_code, COUNT(*)::int as cnt FROM job_postings GROUP BY region_code ORDER BY cnt DESC`;
console.log("Jobs with NULL region_code:", nullRegion[0]?.cnt);
console.log("Jobs by region:", byRegion);
console.log("Total jobs:", byRegion.reduce((s, r) => s + r.cnt, 0));

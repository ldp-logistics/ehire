import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
config();
const sql = neon(process.env.DATABASE_URL);
const branches = await sql`SELECT id, name, region_code FROM branches ORDER BY name`;
console.log(branches);

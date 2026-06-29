import { config } from "dotenv";
import { getJobPosting } from "../lib/freshteamApi.js";

config();

async function main() {
  const j = await getJobPosting(5000145187);
  console.log("keys:", Object.keys(j).sort().join(", "));
  const inspect = [
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "recruiter",
    "hiringManager",
    "hiring_manager",
    "user",
    "creator",
    "owner",
    "last_updated_by",
    "published_on",
    "requisitions",
  ];
  for (const k of inspect) {
    const v = (j as Record<string, unknown>)[k];
    if (v !== undefined) {
      console.log("\n---", k, "---");
      console.log(JSON.stringify(v, null, 2).slice(0, 800));
    }
  }
}

main().catch(console.error);

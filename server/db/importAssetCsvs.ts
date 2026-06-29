/**
 * Import asset management data from three CSVs:
 * 1. Stock CSV → stock_items
 * 2. System Inventory CSV → assigned_systems (laptops/systems), linked to employees by name
 * 3. New Inventory Assigned CSV → assigned_systems (peripherals), linked to employees by name
 *
 * Clears existing asset data at the start so re-runs do not hit duplicate key errors.
 *
 * Usage:
 *   npx tsx server/db/importAssetCsvs.ts <stock.csv> <system-inventory.csv> <new-inventory-assigned.csv>
 */

import { config } from "dotenv";
config();

import { neon } from "@neondatabase/serverless";
import * as fs from "fs";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// ----- CSV parsing (handles quoted fields) -----
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      current += c;
    } else if (c === ",") {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(filePath: string): string[][] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((l) => parseCsvLine(l));
}

// ----- Normalize name for matching -----
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// ----- Map stock item name to category -----
const CATEGORY_MAP: Record<string, string> = {
  laptop: "Systems",
  lcd: "Display",
  monitor: "Display",
  ram: "Components",
  hdd: "Storage",
  ssd: "Storage",
  motherboard: "Components",
  cpu: "Hardware",
  router: "Network",
  rj45: "Network",
  microtik: "Network",
  archer: "Network",
  mouse: "Peripherals",
  keyboard: "Peripherals",
  headphone: "Peripherals",
  "usb hub": "Peripherals",
  "mouse pad": "Peripherals",
  "power coat": "Peripherals",
  led: "Display",
  ddr: "Components",
};

function inferCategory(name: string): string {
  const n = normalizeName(name);
  for (const [key, cat] of Object.entries(CATEGORY_MAP)) {
    if (n.includes(key)) return cat;
  }
  return "Other";
}

function parseDate(dateStr: string): string | null {
  if (!dateStr || !dateStr.trim()) return null;
  const cleaned = dateStr.trim();
  const m = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, day, month, year] = m;
    return new Date(parseInt(year!, 10), parseInt(month!, 10) - 1, parseInt(day!, 10)).toISOString();
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("Usage: npx tsx server/db/importAssetCsvs.ts <stock.csv> <system-inventory.csv> <new-inventory-assigned.csv>");
    process.exit(1);
  }

  const [stockPath, systemInvPath, newInvPath] = args;
  for (const p of [stockPath, systemInvPath, newInvPath]) {
    if (!fs.existsSync(p)) {
      console.error(`❌ File not found: ${p}`);
      process.exit(1);
    }
  }

  console.log("🗑️ Clearing existing asset data (so re-run is safe)...");
  await sql`TRUNCATE TABLE ticket_comments, support_tickets, assigned_systems, stock_items, asset_audit_log CASCADE`;
  console.log("   Done.\n");

  console.log("📂 Loading employees for name resolution...");
  const employees = (await sql`
    SELECT id, first_name, last_name, work_email
    FROM employees
  `) as { id: string; first_name: string; last_name: string; work_email: string }[];

  const nameToEmployee = new Map<string, { id: string; first_name: string; last_name: string; work_email: string }>();
  for (const e of employees) {
    const full = normalizeName(`${e.first_name} ${e.last_name}`);
    nameToEmployee.set(full, e);
  }
  console.log(`   Found ${employees.length} employees\n`);

  function resolveEmployee(userName: string): { id: string; first_name: string; last_name: string; work_email: string } | null {
    const n = normalizeName(userName);
    if (nameToEmployee.has(n)) return nameToEmployee.get(n)!;
    const parts = n.split(/\s+/);
    if (parts.length >= 2) {
      const full = parts.join(" ");
      if (nameToEmployee.has(full)) return nameToEmployee.get(full)!;
    }
    // Aliases: CSV uses "Arbaz HR", "Kundan Sir", "Neil sanders", "Blake relay", etc. — match by first name or known variant
    const aliasToFirstName: Record<string, string> = {
      "arbaz hr": "arbaz",
      "kundan sir": "kundan",
      "neil sanders": "neil",
      "blake relay": "blake",
      "blake rilay": "blake",
      "osama": "osama",
      "will evans": "will",
      "james perry": "james",
      "jamie martinez": "jamie",
      "marcus gold": "marcus",
    };
    const firstPart = aliasToFirstName[n] || parts[0];
    if (firstPart) {
      for (const e of employees) {
        const eFirst = normalizeName(e.first_name);
        const eFull = normalizeName(`${e.first_name} ${e.last_name}`);
        if (eFirst === firstPart || eFull.startsWith(firstPart + " ") || eFull.includes(n)) return e;
      }
    }
    for (const e of employees) {
      const eFull = normalizeName(`${e.first_name} ${e.last_name}`);
      if (eFull === n) return e;
      if (n.includes(eFull) || eFull.includes(n)) return e;
      if (parts.length === 1 && normalizeName(e.first_name) === parts[0]) return e;
      if (parts.length >= 2 && normalizeName(e.first_name) === parts[0] && normalizeName(e.last_name).startsWith(parts[1]!)) return e;
      if (parts.length >= 2 && normalizeName(e.first_name).startsWith(parts[0]!) && normalizeName(e.last_name).startsWith(parts[1]!)) return e;
    }
    return null;
  }

  // ----- 1. Stock CSV -----
  console.log("📦 Importing Stock CSV...");
  const stockRows = parseCsv(stockPath);
  const stockDataRows = stockRows.slice(1).filter((row) => row.some((c) => c.trim()));

  let stockIndex = 0;
  for (const row of stockDataRows) {
    const name = (row[0] || "").trim();
    const qtyStr = (row[2] ?? row[1] ?? "").trim();
    const quantity = Math.max(0, parseInt(qtyStr, 10) || 0);
    const description = (row[3] || "").trim() || null;
    if (!name) continue;

    stockIndex += 1;
    const assetId = `STOCK-${String(stockIndex).padStart(5, "0")}`;
    const category = inferCategory(name);
    await sql`
      INSERT INTO stock_items (asset_id, name, category, product_type, quantity, available, description, location)
      VALUES (${assetId}, ${name}, ${category}, ${null}, ${quantity}, ${quantity}, ${description}, ${"IT Storage"})
    `;
    console.log(`   ✓ ${assetId} ${name} (${quantity})`);
  }
  console.log(`   Total: ${stockDataRows.length} stock items\n`);

  // ----- 2. System Inventory CSV -----
  console.log("💻 Importing System Inventory (assigned systems)...");
  const sysRows = parseCsv(systemInvPath);
  const sysDataRows = sysRows.slice(1).filter((row) => (row[0] || "").trim());

  let sysIndex = 0;
  for (const row of sysDataRows) {
    const user = (row[0] || "").trim();
    if (!user) continue;
    const ram = (row[1] || "").trim() || null;
    const storage = (row[2] || "").trim() || null;
    const processor = (row[3] || "").trim() || null;
    const generation = (row[4] || "").trim() || null;
    const led = (row[5] || "").trim();
    const notes = led ? `LED: ${led}` : null;

    const emp = resolveEmployee(user);
    const assetId = `SYS-${new Date().getFullYear()}-${String(++sysIndex).padStart(3, "0")}`;
    await sql`
      INSERT INTO assigned_systems (asset_id, user_id, user_name, user_email, ram, storage, processor, generation, notes)
      VALUES (
        ${assetId},
        ${emp?.id ?? null},
        ${user},
        ${emp?.work_email ?? null},
        ${ram},
        ${storage},
        ${processor},
        ${generation},
        ${notes}
      )
    `;
    console.log(`   ✓ ${assetId} → ${user}${emp ? " (linked)" : " (no employee match)"}`);
  }
  console.log(`   Total: ${sysDataRows.length} systems\n`);

  // ----- 3. New Inventory Assigned CSV -----
  console.log("🖱️ Importing New Inventory Assigned (peripherals)...");
  const invRows = parseCsv(newInvPath);
  const invDataRows = invRows.slice(1).filter((row) => (row[0] || "").trim() && (row[1] || "").trim());

  let invIndex = 0;
  for (const row of invDataRows) {
    const item = (row[0] || "").trim();
    const user = (row[1] || "").trim();
    const dateStr = (row[2] || "").trim();
    if (!user) continue;

    const emp = resolveEmployee(user);
    const assetId = `PERIPH-${new Date().getFullYear()}-${String(++invIndex).padStart(3, "0")}`;
    const notes = [item, dateStr ? `Assigned: ${dateStr}` : null].filter(Boolean).join(" | ");
    await sql`
      INSERT INTO assigned_systems (asset_id, user_id, user_name, user_email, ram, storage, processor, generation, notes)
      VALUES (
        ${assetId},
        ${emp?.id ?? null},
        ${user},
        ${emp?.work_email ?? null},
        ${null},
        ${null},
        ${null},
        ${null},
        ${notes}
      )
    `;
    console.log(`   ✓ ${assetId} → ${user} (${item})${emp ? " (linked)" : " (no employee match)"}`);
  }
  console.log(`   Total: ${invDataRows.length} peripherals\n`);

  console.log("═══════════════════════════════════════════════════");
  console.log("✅ Asset CSV import completed.");
  console.log("═══════════════════════════════════════════════════");
  console.log(`   📦 Stock items:    ${stockDataRows.length}`);
  console.log(`   💻 Systems:        ${sysDataRows.length}`);
  console.log(`   🖱️ Peripherals:    ${invDataRows.length}`);
  console.log("═══════════════════════════════════════════════════\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Import failed:", err);
  process.exit(1);
});

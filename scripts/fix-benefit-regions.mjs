/**
 * Fix benefit_cards region tagging + show current state.
 *
 * Usage:
 *   node scripts/fix-benefit-regions.mjs              # dry-run (report only)
 *   node scripts/fix-benefit-regions.mjs --apply       # move mis-tagged PK cards to PK
 *   node scripts/fix-benefit-regions.mjs --apply --delete-in-n  # also delete IN-N cards (if none should exist yet)
 *
 * Requires DATABASE_URL in .env
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config();

const APPLY = process.argv.includes("--apply");
const DELETE_IN_N = process.argv.includes("--delete-in-n");

const sql = neon(process.env.DATABASE_URL);

console.log("\n=== benefit_cards by region ===");
const byRegion = await sql`
  SELECT region_code, COUNT(*)::int AS count
  FROM benefit_cards
  GROUP BY region_code
  ORDER BY region_code
`;
console.table(byRegion);

console.log("\n=== all benefit_cards ===");
const cards = await sql`
  SELECT id, title, category, region_code, created_by_name, created_at
  FROM benefit_cards
  ORDER BY created_at
`;
console.table(cards);

console.log("\n=== assignments (card region vs employee region) ===");
const assignments = await sql`
  SELECT
    bc.id AS card_id,
    bc.title,
    bc.region_code AS card_region,
    e.first_name || ' ' || e.last_name AS employee,
    COALESCE(b.region_code, 'NULL') AS employee_branch_region
  FROM benefit_card_assignments bca
  JOIN benefit_cards bc ON bc.id = bca.benefit_card_id
  JOIN employees e ON e.id = bca.employee_id
  LEFT JOIN branches b ON b.id = e.branch_id
  WHERE bca.status = 'active'
  ORDER BY bc.title, e.first_name
`;
console.table(assignments);

if (!APPLY) {
  console.log("\nDry-run only. To fix PK benefits tagged as IN-N:");
  console.log("  node scripts/fix-benefit-regions.mjs --apply");
  console.log("\nTo delete all IN-N benefit cards (only if India North should have none):");
  console.log("  node scripts/fix-benefit-regions.mjs --apply --delete-in-n");
  process.exit(0);
}

// 1) IN-N cards where every active assignee is PK → PK
const toPkByAssignees = await sql`
  UPDATE benefit_cards bc
  SET region_code = 'PK', updated_at = NOW()
  WHERE bc.region_code = 'IN-N'
    AND EXISTS (
      SELECT 1 FROM benefit_card_assignments bca
      WHERE bca.benefit_card_id = bc.id AND bca.status = 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM benefit_card_assignments bca
      JOIN employees e ON e.id = bca.employee_id
      JOIN branches b ON b.id = e.branch_id
      WHERE bca.benefit_card_id = bc.id
        AND bca.status = 'active'
        AND COALESCE(b.region_code, '') <> 'PK'
    )
  RETURNING id, title, region_code
`;
console.log("\nMoved to PK (all assignees are PK):", toPkByAssignees);

// 2) Legacy: Ehire admin cards still on IN-N
const toPkLegacy = await sql`
  UPDATE benefit_cards
  SET region_code = 'PK', updated_at = NOW()
  WHERE region_code = 'IN-N'
    AND (
      created_by_name ILIKE '%ehire%'
      OR created_by_name ILIKE '%administrator%'
    )
  RETURNING id, title, region_code
`;
console.log("Moved to PK (creator admin):", toPkLegacy);

if (DELETE_IN_N) {
  const deleted = await sql`
    DELETE FROM benefit_cards
    WHERE region_code = 'IN-N'
    RETURNING id, title
  `;
  console.log("Deleted IN-N cards:", deleted);
}

console.log("\n=== after fix ===");
const after = await sql`
  SELECT id, title, region_code FROM benefit_cards ORDER BY region_code, title
`;
console.table(after);
console.log("Done.\n");

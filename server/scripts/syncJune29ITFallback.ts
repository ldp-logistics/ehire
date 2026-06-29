import { config } from "dotenv";
import { DateTime } from "luxon";
import { neon } from "@neondatabase/serverless";

config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const sql = neon(process.env.DATABASE_URL);
const WORK_DATE = "2026-06-29";

const IT_TARGETS = [
  { name: "Arbaz Ahmed Khan", preferredEmpCode: "326", checkIn: "09:37" },
  { name: "Sohail Ahmad", preferredEmpCode: "357", checkIn: "09:12" },
  { name: "Muhammad Hasan", preferredEmpCode: "477", checkIn: "08:55" },
] as const;

function toUtcIso(workDate: string, hhmm: string, zone: string): string {
  const dt = DateTime.fromFormat(`${workDate} ${hhmm}`, "yyyy-MM-dd HH:mm", { zone });
  if (!dt.isValid) throw new Error(`Invalid date/time: ${workDate} ${hhmm} (${zone})`);
  return dt.toUTC().toISO({ suppressMilliseconds: true })!;
}

function normalizeName(v: string): string {
  return v.toLowerCase().replace(/\s+/g, " ").trim();
}

async function findEmployeeByNameOrCode(name: string, preferredEmpCode: string) {
  const byCode = await sql`
    SELECT id, employee_id, first_name, last_name, department
    FROM employees
    WHERE employee_id = ${preferredEmpCode}
    LIMIT 1
  `;
  if (byCode[0]) return byCode[0] as { id: string; employee_id: string; first_name: string | null; last_name: string | null; department: string | null };

  const all = await sql`
    SELECT id, employee_id, first_name, last_name, department
    FROM employees
    WHERE employment_status = 'active'
  `;
  const target = normalizeName(name);
  const hit = (all as Array<{ id: string; employee_id: string; first_name: string | null; last_name: string | null; department: string | null }>).find((e) => {
    const full = normalizeName(`${e.first_name ?? ""} ${e.last_name ?? ""}`);
    return full === target;
  });
  return hit ?? null;
}

async function main() {
  const tzRows = await sql`SELECT policy_timezone FROM org_timesheet_policy WHERE id = 1`;
  const policyTz = String(tzRows[0]?.policy_timezone || "America/New_York");
  console.log(`Using policy timezone: ${policyTz}`);

  for (const target of IT_TARGETS) {
    const emp = await findEmployeeByNameOrCode(target.name, target.preferredEmpCode);
    if (!emp) {
      console.warn(`Employee not found: ${target.name} (${target.preferredEmpCode})`);
      continue;
    }

    const checkInIso = toUtcIso(WORK_DATE, target.checkIn, policyTz);
    const remarks = `Synced IT row from attendance sheet (${WORK_DATE}) - ${target.name}`;

    await sql`
      INSERT INTO attendance_records (
        employee_id, date, check_in_time, check_out_time, source, status, remarks, created_by
      )
      VALUES (
        ${emp.id},
        ${WORK_DATE}::date,
        ${checkInIso}::timestamptz,
        NULL,
        'manual',
        'present',
        ${remarks},
        NULL
      )
      ON CONFLICT (employee_id, date) WHERE deleted_at IS NULL
      DO UPDATE SET
        check_in_time = EXCLUDED.check_in_time,
        check_out_time = NULL,
        source = 'manual',
        status = 'present',
        remarks = EXCLUDED.remarks,
        deleted_at = NULL,
        deleted_by_user_id = NULL,
        updated_at = NOW()
    `;

    const fullName = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();
    console.log(`Upserted IT row: ${emp.employee_id} ${fullName} (${emp.department ?? "—"}) @ ${target.checkIn}`);
  }

  const verify = await sql`
    SELECT
      e.employee_id AS emp_code,
      concat_ws(' ', e.first_name, e.last_name) AS employee_name,
      e.department,
      to_char(ar.check_in_time AT TIME ZONE ${policyTz}, 'HH12:MI AM') AS check_in_local
    FROM attendance_records ar
    JOIN employees e ON e.id = ar.employee_id
    WHERE ar.date = ${WORK_DATE}::date
      AND ar.deleted_at IS NULL
      AND (
        lower(concat_ws(' ', e.first_name, e.last_name)) = lower('Arbaz Ahmed Khan')
        OR lower(concat_ws(' ', e.first_name, e.last_name)) = lower('Sohail Ahmad')
        OR lower(concat_ws(' ', e.first_name, e.last_name)) = lower('Muhammad Hasan')
      )
    ORDER BY e.employee_id
  `;

  console.log("\nIT verification rows:");
  for (const row of verify as Array<{ emp_code: string; employee_name: string; department: string; check_in_local: string }>) {
    console.log(`${row.emp_code} | ${row.employee_name} | ${row.department ?? "—"} | ${row.check_in_local ?? "—"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


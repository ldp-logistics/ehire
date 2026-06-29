import { config } from "dotenv";
import { DateTime } from "luxon";
import { neon } from "@neondatabase/serverless";

config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const sql = neon(process.env.DATABASE_URL);
const WORK_DATE = "2026-06-29";

const IT_MEMBERS = [
  { empCode: "326", firstName: "Arbaz", lastName: "Ahmed Khan", checkIn: "09:37" },
  { empCode: "357", firstName: "Sohail", lastName: "Ahmad", checkIn: "09:12" },
  { empCode: "477", firstName: "Muhammad", lastName: "Hasan", checkIn: "08:55" },
] as const;

function toUtcIso(workDate: string, hhmm: string, zone: string): string {
  const dt = DateTime.fromFormat(`${workDate} ${hhmm}`, "yyyy-MM-dd HH:mm", { zone });
  if (!dt.isValid) throw new Error(`Invalid date/time: ${workDate} ${hhmm} (${zone})`);
  return dt.toUTC().toISO({ suppressMilliseconds: true })!;
}

async function ensureEmployee(member: (typeof IT_MEMBERS)[number]): Promise<string> {
  const existing = await sql`
    SELECT id
    FROM employees
    WHERE employee_id = ${member.empCode}
    LIMIT 1
  `;
  if (existing[0]?.id) {
    const employeeId = String(existing[0].id);
    await sql`
      UPDATE employees
      SET
        first_name = ${member.firstName},
        last_name = ${member.lastName},
        department = 'Information Technology',
        job_title = COALESCE(NULLIF(job_title, ''), 'IT Specialist'),
        employment_status = 'active',
        updated_at = NOW()
      WHERE id = ${employeeId}
    `;
    return employeeId;
  }

  const workEmail = `${member.empCode}.it@ldplogistics.local`;
  const inserted = await sql`
    INSERT INTO employees (
      employee_id,
      work_email,
      first_name,
      last_name,
      job_title,
      department,
      join_date,
      source,
      employment_status
    )
    VALUES (
      ${member.empCode},
      ${workEmail},
      ${member.firstName},
      ${member.lastName},
      'IT Specialist',
      'Information Technology',
      NOW(),
      'manual',
      'active'
    )
    RETURNING id
  `;
  return String(inserted[0].id);
}

async function upsertAttendance(employeeId: string, member: (typeof IT_MEMBERS)[number], policyTz: string) {
  const checkInIso = toUtcIso(WORK_DATE, member.checkIn, policyTz);
  const remarks = `Forced IT sync (${WORK_DATE}) - ${member.firstName} ${member.lastName}`;

  await sql`
    INSERT INTO attendance_records (
      employee_id, date, check_in_time, check_out_time, source, status, remarks, created_by
    )
    VALUES (
      ${employeeId},
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
}

async function main() {
  const tzRows = await sql`SELECT policy_timezone FROM org_timesheet_policy WHERE id = 1`;
  const policyTz = String(tzRows[0]?.policy_timezone || "America/New_York");
  console.log(`Using policy timezone: ${policyTz}`);

  for (const m of IT_MEMBERS) {
    const employeePk = await ensureEmployee(m);
    await upsertAttendance(employeePk, m, policyTz);
    console.log(`Synced IT member ${m.empCode} ${m.firstName} ${m.lastName} @ ${m.checkIn}`);
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
      AND e.employee_id IN ('326', '357', '477')
    ORDER BY e.employee_id
  `;

  console.log("\nIT records now:");
  for (const row of verify as Array<{ emp_code: string; employee_name: string; department: string; check_in_local: string }>) {
    console.log(`${row.emp_code} | ${row.employee_name} | ${row.department} | ${row.check_in_local}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


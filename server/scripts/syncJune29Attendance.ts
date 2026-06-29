import { config } from "dotenv";
import { DateTime } from "luxon";
import { neon } from "@neondatabase/serverless";

config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const sql = neon(process.env.DATABASE_URL);
const WORK_DATE = "2026-06-29";

const ENTRIES = [
  { empCode: "235", checkIn: "06:25", expectedDepartment: "HR", expectedName: "Arbaz Jan" },
  { empCode: "305", checkIn: "09:34", expectedDepartment: "Compliance", expectedName: "Neil Sanders" },
  { empCode: "286", checkIn: "09:46", expectedDepartment: "Customs", expectedName: "Kahf Khan" },
  { empCode: "463", checkIn: "09:12", expectedDepartment: "Customs", expectedName: "Osama Ramzan" },
  { empCode: "242", checkIn: "09:54", expectedDepartment: "Domestic Operations", expectedName: "Jubair Javed" },
  { empCode: "281", checkIn: "09:10", expectedDepartment: "Domestic Operations", expectedName: "Dean West" },
  { empCode: "312", checkIn: "09:54", expectedDepartment: "Domestic Operations", expectedName: "Liam Brooks" },
  { empCode: "340", checkIn: "09:48", expectedDepartment: "Domestic Operations", expectedName: "Marcus Gold" },
  { empCode: "343", checkIn: "09:10", expectedDepartment: "Domestic Operations", expectedName: "Jamie Martinez" },
  { empCode: "346", checkIn: "09:14", expectedDepartment: "Domestic Operations", expectedName: "Elijah Arthur" },
  { empCode: "455", checkIn: "09:36", expectedDepartment: "Domestic Operations", expectedName: "Blake Riley" },
  { empCode: "460", checkIn: "09:41", expectedDepartment: "Domestic Operations", expectedName: "James Perry" },
  { empCode: "478", checkIn: "09:54", expectedDepartment: "Domestic Operations", expectedName: "Joshua Murphy" },
  { empCode: "123", checkIn: "09:47", expectedDepartment: "Finance", expectedName: "Gavin Rosales" },
  { empCode: "260", checkIn: "10:03", expectedDepartment: "Finance", expectedName: "Troy Garcia" },
  { empCode: "308", checkIn: "09:29", expectedDepartment: "Finance", expectedName: "Choi Hill" },
  { empCode: "475", checkIn: "08:53", expectedDepartment: "Finance", expectedName: "Jordan Perez" },
  { empCode: "476", checkIn: "09:22", expectedDepartment: "Finance", expectedName: "Ben Hunter" },
  { empCode: "326", checkIn: "09:37", expectedDepartment: "IT", expectedName: "Arbaz Ahmed Khan" },
  { empCode: "357", checkIn: "09:12", expectedDepartment: "IT", expectedName: "Sohail Ahmed" },
  { empCode: "477", checkIn: "08:55", expectedDepartment: "IT", expectedName: "Muhammad Hasan" },
  { empCode: "52", checkIn: "09:47", expectedDepartment: "Sales", expectedName: "Alian Gilbert" },
  { empCode: "329", checkIn: "09:29", expectedDepartment: "Sales", expectedName: "Nate Bishop" },
  { empCode: "334", checkIn: "10:04", expectedDepartment: "Marketing", expectedName: "Saad Suhzvari" },
  { empCode: "63", checkIn: "07:26", expectedDepartment: "Admin", expectedName: "Muhammad Faisal Dehbi" },
  { empCode: "185", checkIn: "09:06", expectedDepartment: "Admin", expectedName: "Javed Khan" },
] as const;

function toUtcIso(workDate: string, hhmm: string, zone: string): string {
  const dt = DateTime.fromFormat(`${workDate} ${hhmm}`, "yyyy-MM-dd HH:mm", { zone });
  if (!dt.isValid) throw new Error(`Invalid date/time: ${workDate} ${hhmm} (${zone})`);
  return dt.toUTC().toISO({ suppressMilliseconds: true })!;
}

async function main() {
  const tzRows = await sql`SELECT policy_timezone FROM org_timesheet_policy WHERE id = 1`;
  const policyTz = String(tzRows[0]?.policy_timezone || "Asia/Karachi");
  console.log(`Using policy timezone: ${policyTz}`);

  const missingEmployees: string[] = [];
  const mismatches: string[] = [];

  for (const entry of ENTRIES) {
    const empRows = await sql`
      SELECT id, employee_id, first_name, last_name, department
      FROM employees
      WHERE employee_id = ${entry.empCode}
      LIMIT 1
    `;
    const emp = empRows[0] as
      | {
          id: string;
          employee_id: string;
          first_name: string | null;
          last_name: string | null;
          department: string | null;
        }
      | undefined;

    if (!emp) {
      missingEmployees.push(entry.empCode);
      continue;
    }

    const displayName = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();
    const dbDept = (emp.department ?? "").trim().toLowerCase();
    const expectedDept = entry.expectedDepartment.trim().toLowerCase();
    if (dbDept !== expectedDept) {
      mismatches.push(
        `${entry.empCode}: expected dept "${entry.expectedDepartment}", found "${emp.department ?? ""}"`,
      );
    }

    const checkInIso = toUtcIso(WORK_DATE, entry.checkIn, policyTz);
    const syncRemark = `Synced from attendance sheet (${WORK_DATE}) - ${entry.expectedName}`;

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
        ${syncRemark},
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

    console.log(`Upserted ${entry.empCode} ${displayName} @ ${entry.checkIn}`);
  }

  if (missingEmployees.length > 0) {
    console.warn(`Missing employee IDs: ${missingEmployees.join(", ")}`);
  }
  if (mismatches.length > 0) {
    console.warn("Department mismatches:");
    for (const mm of mismatches) console.warn(`  - ${mm}`);
  }

  const verificationRows = await sql`
    WITH seq(emp_code, seq_no) AS (
      VALUES
        ('235',1),('305',2),('286',3),('463',4),('242',5),('281',6),('312',7),('340',8),('343',9),('346',10),
        ('455',11),('460',12),('478',13),('123',14),('260',15),('308',16),('475',17),('476',18),('326',19),
        ('357',20),('477',21),('52',22),('329',23),('334',24),('63',25),('185',26)
    )
    SELECT
      s.seq_no,
      e.employee_id AS emp_code,
      concat_ws(' ', e.first_name, e.last_name) AS employee_name,
      e.department,
      to_char(ar.check_in_time AT TIME ZONE ${policyTz}, 'HH12:MI AM') AS check_in_local
    FROM seq s
    LEFT JOIN employees e ON e.employee_id = s.emp_code
    LEFT JOIN attendance_records ar
      ON ar.employee_id = e.id
      AND ar.date = ${WORK_DATE}::date
      AND ar.deleted_at IS NULL
    ORDER BY s.seq_no
  `;

  console.log(`\nVerification rows for ${WORK_DATE}:`);
  for (const row of verificationRows as Array<{ seq_no: number; emp_code: string; employee_name: string; department: string; check_in_local: string | null }>) {
    console.log(
      `${String(row.seq_no).padStart(2, "0")}. ${row.emp_code} | ${row.employee_name} | ${row.department ?? "—"} | ${row.check_in_local ?? "—"}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


/**
 * One-off script to import employees from a FreshTeam export CSV file.
 * Usage: npx tsx server/db/importFreshteamCsv.ts <path-to-csv>
 * Example: npx tsx server/db/importFreshteamCsv.ts "C:\Users\TaqiMirza\Downloads\employee_current_data(in).csv"
 *
 * Requires DATABASE_URL in .env. Creates or updates employees by work_email; sets source = 'freshteam'.
 */

import { config } from "dotenv";
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { parseFreshteamEmployeeCSV } from "../lib/freshteamCsv";

config();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set. Create a .env file with DATABASE_URL.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}
function toTimestamp(d: Date): string {
  return d.toISOString();
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: npx tsx server/db/importFreshteamCsv.ts <path-to-csv>");
    process.exit(1);
  }

  let csv: string;
  try {
    csv = readFileSync(csvPath, "utf-8");
  } catch (e) {
    console.error("Failed to read file:", csvPath, (e as Error).message);
    process.exit(1);
  }

  const rows = parseFreshteamEmployeeCSV(csv);
  if (rows.length === 0) {
    console.error("No valid employee rows found. Check CSV has: First Name, Last Name, Official Email, Date Of Joining");
    process.exit(1);
  }

  console.log(`Parsed ${rows.length} employee(s) from CSV.`);

  let created = 0;
  let updated = 0;

  for (const e of rows) {
    const joinDateStr = toTimestamp(e.joinDate);
    const probationStartStr = e.probationStartDate ? toTimestamp(e.probationStartDate) : null;
    const probationEndStr = e.probationEndDate ? toTimestamp(e.probationEndDate) : null;
    const dobStr = e.dob ? toDateStr(e.dob) : null;
    const terminationDateStr = e.terminationDate ? toTimestamp(e.terminationDate) : null;

    const existing = await sql`SELECT id FROM employees WHERE work_email = ${e.workEmail}`;

    if (existing.length > 0) {
      await sql`
        UPDATE employees SET
          first_name = ${e.firstName}, last_name = ${e.lastName}, middle_name = ${e.middleName}, nickname = ${e.nickname},
          job_title = ${e.jobTitle}, department = ${e.department}, sub_department = ${e.subDepartment},
          business_unit = ${e.businessUnit}, primary_team = ${e.primaryTeam}, cost_center = ${e.costCenter},
          grade = ${e.grade}, job_category = ${e.jobCategory}, location = ${e.location},
          manager_email = ${e.managerEmail}, hr_email = ${e.hrEmail},
          employment_status = ${e.employmentStatus}, employee_type = ${e.employeeType}, shift = ${e.shift},
          join_date = ${joinDateStr}, probation_start_date = ${probationStartStr}, probation_end_date = ${probationEndStr},
          notice_period = ${e.noticePeriod}, resignation_reason = ${e.resignationReason},
          exit_date = ${terminationDateStr}, exit_type = ${e.exitType},
          personal_email = ${e.personalEmail}, personal_phone = ${e.personalPhone}, work_phone = ${e.workPhone},
          dob = ${dobStr}, gender = ${e.gender}, marital_status = ${e.maritalStatus},
          street = ${e.street}, city = ${e.city}, state = ${e.state}, country = ${e.country}, zip_code = ${e.zipCode},
          comm_street = ${e.commStreet}, comm_city = ${e.commCity}, comm_state = ${e.commState},
          comm_country = ${e.commCountry}, comm_zip_code = ${e.commZipCode},
          custom_field_1 = ${e.customField1}, custom_field_2 = ${e.customField2},
          source = 'freshteam', updated_at = NOW()
        WHERE id = ${existing[0].id}
      `;
      updated++;
      console.log("Updated:", e.workEmail);
    } else {
      try {
        await sql`
          INSERT INTO employees (
            employee_id, work_email, first_name, middle_name, last_name, nickname,
            job_title, department, sub_department, business_unit, primary_team, cost_center, grade, job_category,
            location, manager_email, hr_email, employment_status, employee_type, shift,
            join_date, probation_start_date, probation_end_date, notice_period,
            resignation_reason, exit_date, exit_type,
            personal_email, personal_phone, work_phone, dob, gender, marital_status,
            street, city, state, country, zip_code,
            comm_street, comm_city, comm_state, comm_country, comm_zip_code,
            custom_field_1, custom_field_2, source
          ) VALUES (
            ${e.employeeId}, ${e.workEmail}, ${e.firstName}, ${e.middleName}, ${e.lastName}, ${e.nickname},
            ${e.jobTitle}, ${e.department}, ${e.subDepartment}, ${e.businessUnit}, ${e.primaryTeam},
            ${e.costCenter}, ${e.grade}, ${e.jobCategory}, ${e.location}, ${e.managerEmail}, ${e.hrEmail},
            ${e.employmentStatus}, ${e.employeeType}, ${e.shift},
            ${joinDateStr}, ${probationStartStr}, ${probationEndStr}, ${e.noticePeriod},
            ${e.resignationReason}, ${terminationDateStr}, ${e.exitType},
            ${e.personalEmail}, ${e.personalPhone}, ${e.workPhone}, ${dobStr}, ${e.gender}, ${e.maritalStatus},
            ${e.street}, ${e.city}, ${e.state}, ${e.country}, ${e.zipCode},
            ${e.commStreet}, ${e.commCity}, ${e.commState}, ${e.commCountry}, ${e.commZipCode},
            ${e.customField1}, ${e.customField2}, 'freshteam'
          )
        `;
        created++;
        console.log("Created:", e.workEmail);
      } catch (err) {
        console.error("Error inserting", e.workEmail, (err as Error).message);
      }
    }
  }

  await sql`
    UPDATE employees e
    SET manager_id = (SELECT id FROM employees m WHERE m.work_email = e.manager_email LIMIT 1),
        updated_at = NOW()
    WHERE e.manager_email IS NOT NULL AND e.manager_email != ''
      AND (e.manager_id IS NULL OR e.manager_id = '')
      AND EXISTS (SELECT 1 FROM employees m WHERE m.work_email = e.manager_email)
  `;

  console.log("\nDone. Created:", created, "Updated:", updated);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

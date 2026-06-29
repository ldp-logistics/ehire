/**
 * Employee profile change log → Timeline "Profile updated" events.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL environment variable is not set");
    _sql = neon(url);
  }
  return _sql;
}

const FIELD_LABELS: Record<string, string> = {
  employee_id: "Employee ID",
  work_email: "Work email",
  first_name: "First name",
  middle_name: "Middle name",
  last_name: "Last name",
  nickname: "Also known as (pseudonym)",
  avatar: "Profile photo",
  job_title: "Job title",
  department: "Department",
  sub_department: "Sub-department",
  business_unit: "Business unit",
  primary_team: "Primary team",
  role: "Role",
  cost_center: "Cost center",
  grade: "Grade",
  job_category: "Job category",
  location: "Location",
  manager_id: "Reporting manager",
  manager_email: "Manager email",
  hr_email: "HR partner email",
  employment_status: "Employment status",
  employee_type: "Employee type",
  shift: "Shift",
  personal_email: "Personal email",
  personal_phone: "Personal phone",
  work_phone: "Work phone",
  dob: "Date of birth",
  gender: "Gender",
  marital_status: "Marital status",
  blood_group: "Blood group",
  street: "Street",
  city: "City",
  state: "State",
  country: "Country",
  zip_code: "ZIP code",
  comm_street: "Communication street",
  comm_city: "Communication city",
  comm_state: "Communication state",
  comm_country: "Communication country",
  comm_zip_code: "Communication ZIP",
  join_date: "Join date",
  probation_start_date: "Probation start",
  probation_end_date: "Probation end",
  confirmation_date: "Confirmation date",
  notice_period: "Notice period",
  resignation_date: "Resignation date",
  exit_date: "Last working day",
  exit_type: "Exit type",
  resignation_reason: "Resignation reason",
  eligible_for_rehire: "Eligible for rehire",
  custom_field_1: "Custom field 1",
  custom_field_2: "Custom field 2",
  source: "Source",
};

/** Profile tab grouping for timeline descriptions */
const FIELD_SECTION: Record<string, "Overview" | "Personal" | "Work"> = {
  employee_id: "Overview",
  work_email: "Overview",
  first_name: "Overview",
  middle_name: "Overview",
  last_name: "Overview",
  nickname: "Overview",
  avatar: "Overview",
  employment_status: "Overview",
  employee_type: "Overview",
  business_unit: "Overview",
  cost_center: "Overview",
  manager_id: "Overview",
  manager_email: "Overview",
  hr_email: "Overview",
  job_title: "Work",
  department: "Work",
  sub_department: "Work",
  primary_team: "Work",
  role: "Work",
  grade: "Work",
  job_category: "Work",
  location: "Work",
  shift: "Work",
  join_date: "Work",
  probation_start_date: "Work",
  probation_end_date: "Work",
  confirmation_date: "Work",
  notice_period: "Work",
  work_phone: "Work",
  resignation_date: "Work",
  exit_date: "Work",
  exit_type: "Work",
  resignation_reason: "Work",
  eligible_for_rehire: "Work",
  dob: "Personal",
  gender: "Personal",
  marital_status: "Personal",
  blood_group: "Personal",
  personal_email: "Personal",
  personal_phone: "Personal",
  street: "Personal",
  city: "Personal",
  state: "Personal",
  country: "Personal",
  zip_code: "Personal",
  comm_street: "Personal",
  comm_city: "Personal",
  comm_state: "Personal",
  comm_country: "Personal",
  comm_zip_code: "Personal",
};

function labelForField(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  return field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build timeline description grouped by Overview / Personal / Work */
export function formatProfileChangeDescription(fields: string[]): string {
  if (fields.length === 0) return "Profile updated";
  const bySection = new Map<string, string[]>();
  for (const f of fields) {
    const section = FIELD_SECTION[f] ?? "Overview";
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section)!.push(labelForField(f));
  }
  const parts: string[] = [];
  for (const section of ["Overview", "Personal", "Work"] as const) {
    const labels = bySection.get(section);
    if (labels?.length) parts.push(`${section}: ${labels.join(", ")}`);
  }
  return parts.join(" · ");
}

/** Keys in `updates` whose values differ from `before` (shallow compare). */
export function getChangedFieldKeys(
  before: Record<string, unknown>,
  updates: Record<string, unknown>,
): string[] {
  const changed: string[] = [];
  for (const key of Object.keys(updates)) {
    const oldVal = before[key];
    const newVal = updates[key];
    const o =
      oldVal === null || oldVal === undefined
        ? ""
        : typeof oldVal === "object"
          ? JSON.stringify(oldVal)
          : String(oldVal).trim();
    const n =
      newVal === null || newVal === undefined
        ? ""
        : typeof newVal === "object"
          ? JSON.stringify(newVal)
          : String(newVal).trim();
    if (o !== n) changed.push(key);
  }
  return changed;
}

export async function recordEmployeeProfileChange(
  employeeId: string,
  changedBy: string,
  fields: string[],
): Promise<void> {
  if (!changedBy || fields.length === 0) return;
  try {
    const sql = getSql();
    await sql`
      INSERT INTO employee_profile_changes (employee_id, changed_by, changed_fields)
      VALUES (${employeeId}, ${changedBy}, ${JSON.stringify(fields)}::jsonb)
    `;
  } catch (e) {
    console.warn("[employee_profile_changes] insert failed:", (e as Error)?.message);
  }
}

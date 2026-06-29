/**
 * Shared employee types for API responses (snake_case).
 * Use these on the frontend for fetch responses and on the server for type consistency.
 * For UI display (camelCase), map from these types in the client.
 */

/** Employee row as returned by GET /api/employees (list) and GET /api/employees/:id (profile). Keys match DB/API snake_case. */
export interface EmployeeRecord {
  id: string;
  employee_id: string;
  work_email: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  nickname?: string | null;
  avatar?: string | null;
  job_title: string;
  department: string;
  sub_department?: string | null;
  business_unit?: string | null;
  primary_team?: string | null;
  role?: string | null;
  cost_center?: string | null;
  grade?: string | null;
  job_category?: string | null;
  location?: string | null;
  manager_id?: string | null;
  manager_email?: string | null;
  hr_email?: string | null;
  employment_status: string;
  employee_type?: string | null;
  shift?: string | null;
  personal_email?: string | null;
  personal_phone?: string | null;
  work_phone?: string | null;
  dob?: string | null;
  gender?: string | null;
  marital_status?: string | null;
  blood_group?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zip_code?: string | null;
  comm_street?: string | null;
  comm_city?: string | null;
  comm_state?: string | null;
  comm_country?: string | null;
  comm_zip_code?: string | null;
  join_date: string;
  probation_start_date?: string | null;
  probation_end_date?: string | null;
  probation_status?: string | null;
  confirmation_date?: string | null;
  notice_period?: string | null;
  resignation_date?: string | null;
  exit_date?: string | null;
  exit_type?: string | null;
  resignation_reason?: string | null;
  eligible_for_rehire?: string | null;
  custom_field_1?: string | null;
  custom_field_2?: string | null;
  source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Subset returned by GET /api/employees list endpoint. Avatar included when present (URL or data URL); otherwise load via GET /api/employees/:id/avatar. */
export type EmployeeListRow = Pick<
  EmployeeRecord,
  | "id"
  | "employee_id"
  | "work_email"
  | "first_name"
  | "middle_name"
  | "last_name"
  | "nickname"
  | "job_title"
  | "department"
  | "sub_department"
  | "business_unit"
  | "location"
  | "grade"
  | "employment_status"
  | "employee_type"
  | "join_date"
  | "manager_id"
  | "city"
  | "state"
  | "country"
  | "avatar"
  | "personal_phone"
  | "work_phone"
>;

/** Valid `employees.employee_type` enum values (PostgreSQL). */
export const EMPLOYEE_TYPE_VALUES = [
  "full_time",
  "part_time",
  "contractor",
  "intern",
  "temporary",
] as const;

export type EmployeeTypeValue = (typeof EMPLOYEE_TYPE_VALUES)[number];

/** Map recruitment/job/offer employment labels to `employees.employee_type`. */
export function mapToEmployeeType(raw: string | null | undefined): EmployeeTypeValue {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (v === "full_time" || v === "fulltime") return "full_time";
  if (v === "part_time" || v === "parttime") return "part_time";
  if (v === "contractor" || v === "contract") return "contractor";
  if (v === "intern" || v === "internship") return "intern";
  if (v === "temporary" || v === "temp") return "temporary";
  return "full_time";
}

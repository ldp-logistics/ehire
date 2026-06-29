/**
 * Parse FreshTeam employee export CSV and map to LDP HRM employee fields.
 * CSV format: header row, then data rows. Quoted fields may contain commas; "" inside quotes = escaped quote.
 */

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** Parse a CSV string into headers and rows. Handles quoted fields and "" escape. */
export function parseCSV(csv: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  const lines = csv.split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const out: string[] = [];
    let i = 0;
    let field = "";
    while (i < line.length) {
      if (line[i] === '"') {
        i++;
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else if (line[i] === '"') {
            i++;
            break;
          } else {
            field += line[i];
            i++;
          }
        }
        out.push(field.trim());
        field = "";
        if (line[i] === ",") i++;
        continue;
      }
      if (line[i] === ",") {
        out.push(field.trim());
        field = "";
        i++;
        continue;
      }
      field += line[i];
      i++;
    }
    out.push(field.trim());
    return out;
  };

  const headers = parseRow(lines[0]);
  for (let r = 1; r < lines.length; r++) {
    const line = lines[r];
    if (!line.trim()) continue;
    rows.push(parseRow(line));
  }
  return { headers, rows };
}

/** Get column value by header name (case-insensitive). */
function get(col: Record<string, string>, key: string): string {
  const k = Object.keys(col).find((x) => x.toLowerCase() === key.toLowerCase());
  return (k ? col[k] : "")?.trim() ?? "";
}

/** Parse FreshTeam date: "Dec-19-1998" (Month-DD-YYYY) or "10/21/1990" (MM/DD/YYYY). */
export function parseFreshteamDate(s: string): Date | null {
  if (!s || !s.trim()) return null;
  const raw = s.trim();
  const parts = raw.split(/[-/]/);
  if (parts.length < 3) return null;
  const monthStr = parts[0].slice(0, 3);
  const month = MONTHS[monthStr];
  if (month != null) {
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(year)) {
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  }
  const m = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (m >= 1 && m <= 12 && !isNaN(day) && !isNaN(year)) {
    const d = new Date(year, m - 1, day);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/** Extract email from "Name" <email> or """Name""" <email>. */
export function extractEmail(s: string): string | null {
  if (!s || !s.trim()) return null;
  const match = s.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())) return s.trim();
  return null;
}

/** Map FreshTeam Employee Status to our employment_status. */
function mapEmploymentStatus(s: string): string {
  const v = s.toLowerCase();
  if (v === "active") return "active";
  if (v === "onboarding" || v === "on boarding") return "onboarding";
  if (v === "on leave" || v === "on_leave") return "on_leave";
  if (v === "terminated" || v === "termination") return "terminated";
  if (v === "resigned" || v === "resignation") return "resigned";
  if (v === "offboarded") return "offboarded";
  return "active";
}

/** Map Gender to our enum. */
function mapGender(s: string): string | null {
  const v = s.toLowerCase();
  if (v === "male") return "male";
  if (v === "female") return "female";
  if (v === "other") return "other";
  if (v === "prefer not to say" || v === "prefer_not_to_say") return "prefer_not_to_say";
  return null;
}

/** Map Marital Status to our enum. */
function mapMaritalStatus(s: string): string | null {
  const v = s.toLowerCase();
  if (v === "single") return "single";
  if (v === "married") return "married";
  if (v === "divorced") return "divorced";
  if (v === "widowed") return "widowed";
  return null;
}

/** Map Employee Type to our enum. */
function mapEmployeeType(s: string): string | null {
  const v = s.toLowerCase().replace(/\s+/g, "_");
  if (v === "full_time" || v === "fulltime") return "full_time";
  if (v === "part_time" || v === "parttime") return "part_time";
  if (v === "contractor" || v === "contract") return "contractor";
  if (v === "intern" || v === "internship") return "intern";
  if (v === "temporary" || v === "temp") return "temporary";
  return "full_time";
}

/** Country code to name (optional). */
const COUNTRY_CODES: Record<string, string> = { PK: "Pakistan", US: "United States", IN: "India", GB: "United Kingdom" };

/**
 * FreshTeam CSV: "First Name" / "Last Name" are pseudonyms; "Nickname" holds legal/real name (this tenant).
 * When Nickname is present: first_name/last_name come from splitting Nickname; nickname column = pseudonym (FT first/middle/last).
 * When Nickname is empty: keep FT first/last as today; nickname stays null.
 */
export function applyFreshteamNameSwap(
  pseudonymFirst: string,
  pseudonymLast: string,
  middleName: string | null,
  ftNicknameRaw: string,
): { firstName: string; lastName: string; nickname: string | null } {
  const raw = (ftNicknameRaw ?? "").trim();
  if (!raw) {
    return {
      firstName: pseudonymFirst.trim(),
      lastName: pseudonymLast.trim(),
      nickname: null,
    };
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  let legalFirst: string;
  let legalLast: string;
  if (parts.length === 1) {
    legalFirst = parts[0];
    legalLast = "";
  } else {
    legalFirst = parts[0];
    legalLast = parts.slice(1).join(" ");
  }
  const pseudoBits = [pseudonymFirst.trim(), (middleName ?? "").trim(), pseudonymLast.trim()].filter((s) => s.length > 0);
  const pseudo = pseudoBits.length > 0 ? pseudoBits.join(" ") : null;
  return { firstName: legalFirst, lastName: legalLast, nickname: pseudo };
}

export interface FreshteamEmployeeRow {
  firstName: string;
  lastName: string;
  workEmail: string;
  middleName: string | null;
  jobTitle: string;
  employeeId: string;
  personalEmail: string | null;
  dob: Date | null;
  joinDate: Date;
  probationStartDate: Date | null;
  probationEndDate: Date | null;
  noticePeriod: string | null;
  terminationDate: Date | null;
  resignationReason: string | null;
  exitType: string | null;
  gender: string | null;
  maritalStatus: string | null;
  location: string | null;
  costCenter: string | null;
  businessUnit: string | null;
  department: string;
  grade: string | null;
  jobCategory: string | null;
  employmentStatus: string;
  subDepartment: string | null;
  primaryTeam: string | null;
  employeeType: string;
  shift: string | null;
  hrEmail: string | null;
  managerEmail: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zipCode: string | null;
  commStreet: string | null;
  commCity: string | null;
  commState: string | null;
  commCountry: string | null;
  commZipCode: string | null;
  /** Work / office line (not personal mobile). */
  workPhone: string | null;
  /** Personal mobile or home (FreshTeam CSV: Mobile Phone, Personal Phone, etc.). */
  personalPhone: string | null;
  /** Pseudonym / office name when swapped from FT first+last; null if FT Nickname was empty. */
  nickname: string | null;
  customField1: string | null;
  customField2: string | null;
}

/**
 * Map a single CSV row (object keyed by header names) to our employee shape.
 * Supports both FreshTeam export formats (employee_current_data and full_blown_user_import).
 */
export function mapFreshteamRowToEmployee(row: Record<string, string>): FreshteamEmployeeRow | null {
  const firstName = get(row, "First Name");
  const lastName = get(row, "Last Name");
  const workEmail = get(row, "Official Email");
  if (!firstName || !lastName || !workEmail) return null;

  const employeeId = get(row, "Employee Id") || workEmail.split("@")[0];
  const joinDate = parseFreshteamDate(get(row, "Date Of Joining"));
  if (!joinDate) return null;

  const hrPartner = get(row, "HR Partner");
  let reportingManager = get(row, "Reporting Manager");
  const doesntReportToAnyone = get(row, "Doesn't Report to Anyone").toLowerCase();
  if (doesntReportToAnyone === "yes" || doesntReportToAnyone === "true" || doesntReportToAnyone === "1") {
    reportingManager = "";
  }
  const countryCode = get(row, "Country Code") || get(row, "Country");
  const country = countryCode ? (COUNTRY_CODES[countryCode.toUpperCase()] ?? countryCode) : null;
  const commCountryCode = get(row, "Communication Country Code") || get(row, "Communication Country");
  const commCountry = commCountryCode ? (COUNTRY_CODES[commCountryCode.toUpperCase()] ?? commCountryCode) : null;

  let employmentStatus = mapEmploymentStatus(get(row, "Employee Status"));
  const terminated = get(row, "Terminated").toLowerCase();
  const deleted = get(row, "Deleted").toLowerCase();
  if (terminated === "yes" || terminated === "true" || deleted === "yes" || deleted === "true") {
    employmentStatus = "terminated";
  }

  const startTime = get(row, "Start Time");
  const endTime = get(row, "End Time");
  const workstationNumber = get(row, "Workstation Number");
  const customField2 = startTime && endTime ? `${startTime} - ${endTime}` : (startTime || endTime || null);
  const middleName = get(row, "Middle Name") || null;
  const nicknameRaw = get(row, "Nickname") || get(row, "Nick Name");
  const nameSwap = applyFreshteamNameSwap(firstName, lastName, middleName, nicknameRaw);

  return {
    firstName: nameSwap.firstName,
    lastName: nameSwap.lastName,
    workEmail,
    middleName,
    jobTitle: get(row, "Designation or Title") || "Employee",
    employeeId,
    personalEmail: get(row, "Personal Email") || null,
    dob: parseFreshteamDate(get(row, "Date of Birth")),
    joinDate,
    probationStartDate: parseFreshteamDate(get(row, "Probation Start Date")),
    probationEndDate: parseFreshteamDate(get(row, "Probation End Date")),
    noticePeriod: get(row, "Notice Period Duration") || null,
    terminationDate: parseFreshteamDate(get(row, "Termination Date")),
    resignationReason: get(row, "Termination Reason") || null,
    exitType: get(row, "Termination Category") || null,
    gender: mapGender(get(row, "Gender")),
    maritalStatus: mapMaritalStatus(get(row, "Marital Status")),
    location: get(row, "Office Location") || null,
    costCenter: get(row, "Cost Center") || null,
    businessUnit: get(row, "Business Unit") || null,
    department: get(row, "Department") || "General",
    grade: get(row, "Grade") || null,
    jobCategory: get(row, "EEO Job Category") || null,
    employmentStatus,
    subDepartment: get(row, "Sub Department") || null,
    primaryTeam: get(row, "Primary Team") || null,
    employeeType: mapEmployeeType(get(row, "Employee Type")) ?? "full_time",
    shift: get(row, "Shift") || null,
    hrEmail: extractEmail(hrPartner),
    managerEmail: reportingManager ? extractEmail(reportingManager) : null,
    street: get(row, "Street") || null,
    city: get(row, "City") || null,
    state: get(row, "State") || null,
    country,
    zipCode: get(row, "Zip Code") || null,
    commStreet: get(row, "Communication Street") || null,
    commCity: get(row, "Communication City") || null,
    commState: get(row, "Communication State") || null,
    commCountry,
    commZipCode: get(row, "Communication Zip Code") || null,
    workPhone:
      get(row, "Work Phone") ||
      get(row, "Office Phone") ||
      get(row, "Desk Phone") ||
      get(row, "Main Phone") ||
      null,
    personalPhone:
      get(row, "Mobile Phone") ||
      get(row, "Personal Phone") ||
      get(row, "Personal Mobile") ||
      get(row, "Cell Phone") ||
      get(row, "Home Phone") ||
      null,
    nickname: nameSwap.nickname,
    customField1: workstationNumber || null,
    customField2,
  };
}

/**
 * Parse full FreshTeam CSV and return array of mapped employee records (skips invalid rows).
 */
export function parseFreshteamEmployeeCSV(csv: string): FreshteamEmployeeRow[] {
  const { headers, rows } = parseCSV(csv);
  const result: FreshteamEmployeeRow[] = [];
  for (const rowCells of rows) {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = rowCells[i] ?? "";
    });
    const mapped = mapFreshteamRowToEmployee(row);
    if (mapped) result.push(mapped);
  }
  return result;
}

// ==================== EMERGENCY CONTACTS ====================
export interface FreshteamEmergencyContactRow {
  workEmail: string;
  fullName: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export function parseFreshteamEmergencyContactsCSV(csv: string): FreshteamEmergencyContactRow[] {
  const { headers, rows } = parseCSV(csv);
  const result: FreshteamEmergencyContactRow[] = [];
  for (const rowCells of rows) {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = rowCells[i] ?? "";
    });
    const workEmail = get(row, "Official Email");
    const fullName = get(row, "Full Name");
    if (!workEmail || !fullName) continue;
    result.push({
      workEmail,
      fullName,
      relationship: get(row, "Relationship") || null,
      phone: get(row, "Emergency Contact Number") || null,
      email: get(row, "Email Address") || null,
      address: get(row, "Address") || null,
    });
  }
  return result;
}

// ==================== COMPENSATIONS (SALARY) ====================
export interface FreshteamCompensationRow {
  workEmail: string;
  effectiveDate: Date;
  currency: string;
  annualSalary: number;
  reason: string | null;
  payRateAmount: number | null;
  duration: string | null;
  payoutFrequency: string | null;
  payGroup: string | null;
  payMethod: string | null;
  eligibleWorkHours: string | null;
  additionalDetails: string | null;
  summaryNotes: string | null;
}

export function parseFreshteamCompensationsCSV(csv: string): FreshteamCompensationRow[] {
  const { headers, rows } = parseCSV(csv);
  const result: FreshteamCompensationRow[] = [];
  for (const rowCells of rows) {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = rowCells[i] ?? "";
    });
    const workEmail = get(row, "Official Email");
    const effectiveDate = parseFreshteamDate(get(row, "Effective Date"));
    const annualSalaryRaw = get(row, "Annual Salary");
    const annualSalary = parseFloat(annualSalaryRaw) || 0;
    if (!workEmail || !effectiveDate) continue;
    result.push({
      workEmail,
      effectiveDate,
      currency: get(row, "Currency") || "USD",
      annualSalary,
      reason: get(row, "Reason") || null,
      payRateAmount: parseFloat(get(row, "Pay Rate Amount")) || null,
      duration: get(row, "Duration") || null,
      payoutFrequency: get(row, "Payout Frequency") || null,
      payGroup: get(row, "Pay Group") || null,
      payMethod: get(row, "Pay Method") || null,
      eligibleWorkHours: get(row, "Eligible Work Hours") || null,
      additionalDetails: get(row, "Additional Details On Compensation") || null,
      summaryNotes: get(row, "Summary Notes") || null,
    });
  }
  return result;
}

// ==================== BANK ACCOUNTS ====================
export interface FreshteamBankAccountRow {
  workEmail: string;
  bankName: string;
  nameOnAccount: string;
  bankCode: string | null;
  accountNumber: string;
}

export function parseFreshteamBankAccountsCSV(csv: string): FreshteamBankAccountRow[] {
  const { headers, rows } = parseCSV(csv);
  const result: FreshteamBankAccountRow[] = [];
  for (const rowCells of rows) {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = rowCells[i] ?? "";
    });
    const workEmail = get(row, "Official Email");
    const bankName = get(row, "Bank Name");
    const nameOnAccount = get(row, "Name As Per Bank Account");
    const accountNumber = get(row, "Account Number");
    if (!workEmail || !bankName || !nameOnAccount || !accountNumber) continue;
    result.push({
      workEmail,
      bankName,
      nameOnAccount,
      bankCode: get(row, "Bank Code") || null,
      accountNumber,
    });
  }
  return result;
}

// ==================== DEPENDENTS ====================
export interface FreshteamDependentRow {
  workEmail: string;
  fullName: string;
  relationship: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
}

export function parseFreshteamDependentsCSV(csv: string): FreshteamDependentRow[] {
  const { headers, rows } = parseCSV(csv);
  const result: FreshteamDependentRow[] = [];
  for (const rowCells of rows) {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = rowCells[i] ?? "";
    });
    const workEmail = get(row, "Official Email");
    const fullName = get(row, "Full Name");
    if (!workEmail || !fullName) continue;
    result.push({
      workEmail,
      fullName,
      relationship: get(row, "Relationship") || null,
      dateOfBirth: parseFreshteamDate(get(row, "Date Of Birth")),
      gender: get(row, "Gender Of Dependant") || null,
    });
  }
  return result;
}

// ==================== STOCKS ====================
export interface FreshteamStockRow {
  workEmail: string;
  grantDate: Date;
  units: number;
  vestingSchedule: string | null;
  notes: string | null;
}

export function parseFreshteamStocksCSV(csv: string): FreshteamStockRow[] {
  const { headers, rows } = parseCSV(csv);
  const result: FreshteamStockRow[] = [];
  for (const rowCells of rows) {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = rowCells[i] ?? "";
    });
    const workEmail = get(row, "Official Email");
    const grantDate = parseFreshteamDate(get(row, "Grant Date"));
    const unitsRaw = get(row, "No Of Stocks");
    const units = parseInt(unitsRaw, 10) || 0;
    if (!workEmail || !grantDate || units <= 0) continue;
    const vestingPeriod = get(row, "Vesting Period");
    const vestingDuration = get(row, "Vesting Duration");
    const vestingFrequency = get(row, "Vesting Frequency");
    const vestingSchedule =
      [vestingPeriod, vestingDuration, vestingFrequency].filter(Boolean).join(" ") || null;
    const summaryNotes = get(row, "Summary Notes");
    const confidentialNotes = get(row, "Confidential Notes");
    const notes = [summaryNotes, confidentialNotes].filter(Boolean).join("; ") || null;
    result.push({
      workEmail,
      grantDate,
      units,
      vestingSchedule,
      notes,
    });
  }
  return result;
}

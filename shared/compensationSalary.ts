/** One additional allowance line on a salary revision (monthly amounts). */
export type AdditionalAllowance = {
  label: string;
  amount: number;
  includeInGross: boolean;
};

export function parseSalaryAmount(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function normalizeAdditionalAllowances(raw: unknown): AdditionalAllowance[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const o = item as Record<string, unknown>;
      const label = String(o.label ?? "").trim();
      const amount = parseSalaryAmount(o.amount);
      const includeInGross = o.includeInGross !== false && o.include_in_gross !== false;
      return { label, amount, includeInGross };
    })
    .filter((a) => a.label.length > 0 || a.amount > 0);
}

/** Monthly gross = base + allowances + additional (where includeInGross). */
export function computeMonthlyGross(
  baseMonthly: number,
  allowancesMonthly: number,
  additional: AdditionalAllowance[],
): number {
  const additionalInGross = additional
    .filter((a) => a.includeInGross)
    .reduce((sum, a) => sum + a.amount, 0);
  return baseMonthly + allowancesMonthly + additionalInGross;
}

/** Row shape from API / DB (snake or camel). */
export type SalaryRecordLike = {
  annual_salary?: string | number | null;
  annualSalary?: string | number | null;
  pay_rate?: string | number | null;
  payRate?: string | number | null;
  base_salary_monthly?: string | number | null;
  baseSalaryMonthly?: string | number | null;
  allowances_monthly?: string | number | null;
  allowancesMonthly?: string | number | null;
  additional_allowances?: unknown;
  additionalAllowances?: unknown;
};

export function salaryRecordHasBreakdown(row: SalaryRecordLike | null | undefined): boolean {
  if (!row) return false;
  const base = row.base_salary_monthly ?? row.baseSalaryMonthly;
  return base != null && base !== "" && !Number.isNaN(parseSalaryAmount(base));
}

/** Monthly gross from structured breakdown, or legacy pay_rate / annual÷12. */
export function getMonthlyGrossFromRecord(row: SalaryRecordLike | null | undefined): number | null {
  if (!row) return null;
  if (salaryRecordHasBreakdown(row)) {
    return computeMonthlyGross(
      parseSalaryAmount(row.base_salary_monthly ?? row.baseSalaryMonthly),
      parseSalaryAmount(row.allowances_monthly ?? row.allowancesMonthly),
      normalizeAdditionalAllowances(row.additional_allowances ?? row.additionalAllowances),
    );
  }
  const payRate = parseSalaryAmount(row.pay_rate ?? row.payRate);
  if (payRate > 0) return payRate;
  const annual = parseSalaryAmount(row.annual_salary ?? row.annualSalary);
  if (annual > 0) return Math.round(annual / 12);
  return null;
}

export function hasBreakdownInput(body: Record<string, unknown>): boolean {
  if (body.useBreakdown === true) return true;
  const base = body.baseSalaryMonthly ?? body.base_salary_monthly;
  const allowances = body.allowancesMonthly ?? body.allowances_monthly;
  if (base != null && String(base).trim() !== "") return true;
  if (allowances != null && String(allowances).trim() !== "") return true;
  const additionals = normalizeAdditionalAllowances(body.additionalAllowances ?? body.additional_allowances);
  return additionals.length > 0;
}

export type NormalizedSalaryAmounts = {
  annualSalary: string;
  payRate: string;
  baseSalaryMonthly: string | null;
  allowancesMonthly: string | null;
  additionalAllowances: AdditionalAllowance[];
  hasBreakdown: boolean;
  monthlyGross: number;
};

/** Normalize API/form payload into stored salary columns + derived annual/pay_rate. */
export function normalizeSalaryPayload(body: Record<string, unknown>): NormalizedSalaryAmounts {
  if (hasBreakdownInput(body)) {
    const base = parseSalaryAmount(body.baseSalaryMonthly ?? body.base_salary_monthly);
    const allowances = parseSalaryAmount(body.allowancesMonthly ?? body.allowances_monthly);
    const additionalAllowances = normalizeAdditionalAllowances(
      body.additionalAllowances ?? body.additional_allowances,
    );
    const monthlyGross = computeMonthlyGross(base, allowances, additionalAllowances);
    if (monthlyGross <= 0) {
      throw new Error("Enter at least one positive monthly amount in the salary breakdown");
    }
    return {
      annualSalary: String(Math.round(monthlyGross * 12)),
      payRate: String(monthlyGross),
      baseSalaryMonthly: String(base),
      allowancesMonthly: String(allowances),
      additionalAllowances,
      hasBreakdown: true,
      monthlyGross,
    };
  }

  const annual = parseSalaryAmount(body.annualSalary ?? body.annual_salary);
  if (annual <= 0) {
    throw new Error("Annual salary is required when no monthly breakdown is provided");
  }
  const payRateRaw = body.payRate ?? body.pay_rate;
  const payRate =
    payRateRaw != null && String(payRateRaw).trim() !== ""
      ? parseSalaryAmount(payRateRaw)
      : Math.round(annual / 12);

  return {
    annualSalary: String(annual),
    payRate: String(payRate),
    baseSalaryMonthly: null,
    allowancesMonthly: null,
    additionalAllowances: [],
    hasBreakdown: false,
    monthlyGross: payRate > 0 ? payRate : Math.round(annual / 12),
  };
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDateOnlyLocal(iso: string): Date | null {
  const s = String(iso ?? "").trim();
  if (!s) return null;
  const d = new Date(s.includes("T") ? s : `${s.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Payable months in a calendar year from join date through December (inclusive). */
export function getCalendarYearPayableMonths(
  joinDateIso: string | null | undefined,
  year: number = new Date().getFullYear(),
): { months: number; startMonth: number; periodLabel: string } {
  const join = parseDateOnlyLocal(joinDateIso ?? "");
  if (!join) {
    return { months: 12, startMonth: 1, periodLabel: `Jan–Dec ${year}` };
  }
  const joinYear = join.getFullYear();
  const joinMonth = join.getMonth() + 1;
  if (joinYear > year) {
    return { months: 0, startMonth: 0, periodLabel: `Not active in ${year}` };
  }
  const startMonth = joinYear < year ? 1 : joinMonth;
  const months = Math.max(0, 12 - startMonth + 1);
  const startName = MONTH_SHORT[startMonth - 1];
  const periodLabel = startMonth === 1 ? `Jan–Dec ${year}` : `${startName}–Dec ${year}`;
  return { months, startMonth, periodLabel };
}

export type CalendarYearCompensationSummary = {
  year: number;
  currency: string;
  monthlyGross: number;
  payableMonths: number;
  periodLabel: string;
  /** Salary portion: monthly gross × payable months this calendar year */
  salaryPortion: number;
  /** Bonuses recorded in this calendar year (same currency) */
  bonusesYtd: number;
  /** salaryPortion + bonusesYtd — what company expects to pay this year */
  totalCompanyCommitment: number;
  /** monthly × 12 — full-year run rate for comparison */
  fullYearRunRate: number;
};

export function sumBonusesInCalendarYear(
  bonuses: Array<{ amount: string | number; currency?: string; bonus_date?: string; bonusDate?: string }>,
  year: number,
  currency: string,
): number {
  const cur = currency.trim().toUpperCase();
  return bonuses.reduce((sum, b) => {
    const d = parseDateOnlyLocal(b.bonus_date ?? b.bonusDate ?? "");
    if (!d || d.getFullYear() !== year) return sum;
    const bCur = String(b.currency ?? cur).trim().toUpperCase();
    if (bCur !== cur) return sum;
    return sum + parseSalaryAmount(b.amount);
  }, 0);
}

export function computeCalendarYearCompensationSummary(params: {
  joinDateIso?: string | null;
  monthlyGross: number | null;
  currency: string;
  bonuses?: Array<{ amount: string | number; currency?: string; bonus_date?: string; bonusDate?: string }>;
  year?: number;
}): CalendarYearCompensationSummary | null {
  const monthlyGross = params.monthlyGross;
  if (monthlyGross == null || monthlyGross <= 0) return null;
  const year = params.year ?? new Date().getFullYear();
  const currency = params.currency || "PKR";
  const { months, periodLabel } = getCalendarYearPayableMonths(params.joinDateIso, year);
  const salaryPortion = Math.round(monthlyGross * months);
  const bonusesYtd = sumBonusesInCalendarYear(params.bonuses ?? [], year, currency);
  return {
    year,
    currency,
    monthlyGross,
    payableMonths: months,
    periodLabel,
    salaryPortion,
    bonusesYtd,
    totalCompanyCommitment: salaryPortion + bonusesYtd,
    fullYearRunRate: Math.round(monthlyGross * 12),
  };
}

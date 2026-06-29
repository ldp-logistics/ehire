/** Supported currencies for loan applications and records. */
export const LOAN_CURRENCIES = ["PKR", "USD", "EUR", "GBP", "AED", "SAR"] as const;

export type LoanCurrency = (typeof LOAN_CURRENCIES)[number];

export const DEFAULT_LOAN_CURRENCY: LoanCurrency = "PKR";

export function normalizeLoanCurrency(currency?: string | null): LoanCurrency {
  const upper = (currency ?? DEFAULT_LOAN_CURRENCY).trim().toUpperCase();
  if ((LOAN_CURRENCIES as readonly string[]).includes(upper)) {
    return upper as LoanCurrency;
  }
  return DEFAULT_LOAN_CURRENCY;
}

export function formatLoanAmount(
  amount: number | string | null | undefined,
  currency?: string | null,
): string {
  const c = normalizeLoanCurrency(currency);
  const v = parseFloat(String(amount ?? 0));
  if (!Number.isFinite(v)) return `${c} 0`;
  return `${c} ${Math.round(v).toLocaleString()}`;
}

/** Sum numeric field grouped by currency (for dashboards with mixed currencies). */
export function sumAmountsByCurrency<T extends { currency?: string | null }>(
  items: readonly T[],
  getAmount: (item: T) => number | string | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const c = normalizeLoanCurrency(item.currency);
    const v = parseFloat(String(getAmount(item) ?? 0));
    if (!Number.isFinite(v)) continue;
    map.set(c, (map.get(c) ?? 0) + v);
  }
  return map;
}

export function formatAmountsByCurrency(map: Map<string, number>): string {
  if (map.size === 0) return "—";
  return [...map.entries()]
    .map(([currency, amount]) => formatLoanAmount(amount, currency))
    .join(" · ");
}

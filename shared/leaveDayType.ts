/** Leave request day_type values (DB enum + legacy). */
export type LeaveDayType = "full" | "half" | "first_half" | "second_half" | string;

export function isHalfDayLeaveType(dayType: unknown): boolean {
  const d = String(dayType ?? "").toLowerCase();
  return d === "half" || d === "first_half" || d === "second_half";
}

/** Human label: 1st Half, 2nd Half, Half day, Full day. */
export function formatLeaveDayTypeLabel(dayType: unknown): string {
  const d = String(dayType ?? "").toLowerCase();
  if (d === "first_half") return "1st Half";
  if (d === "second_half") return "2nd Half";
  if (d === "half") return "Half day";
  return "Full day";
}

/** Duration line for lists and emails, e.g. "0.5 day · 1st Half" or "2 days". */
export function formatLeaveDurationSummary(totalDays: unknown, dayType: unknown): string {
  const td = parseFloat(String(totalDays ?? "0"));
  const n = Number.isFinite(td) ? td : 0;
  const unit = n === 1 ? "day" : "days";
  const base = `${n} ${unit}`;
  if (isHalfDayLeaveType(dayType)) {
    return `${base} · ${formatLeaveDayTypeLabel(dayType)}`;
  }
  return base;
}

/** Compact badge for approval rows, e.g. "0.5d · 1st Half". */
export function formatLeaveDurationCompact(totalDays: unknown, dayType: unknown): string {
  const td = parseFloat(String(totalDays ?? "0"));
  const n = Number.isFinite(td) ? td : 0;
  const base = `${n}d`;
  if (isHalfDayLeaveType(dayType)) {
    return `${base} · ${formatLeaveDayTypeLabel(dayType)}`;
  }
  return base;
}

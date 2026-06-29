/** Shared shape for ordering: balance rows use `type_name`, apply-leave uses `name`. */
export type LeaveSortableRow = {
  type_name?: string;
  name?: string;
  paid?: boolean;
};

/** Row shape for leave balance cards (dashboard + profile). */
export type LeaveBalanceCardRow = LeaveSortableRow & {
  type_name: string;
  id?: string;
  leave_type_id?: string;
  balance?: string;
  used?: string;
  max_balance?: number;
  color?: string;
};

function leaveLabel(b: LeaveSortableRow): string {
  return String(b.type_name ?? b.name ?? "").trim();
}

function rankLeaveSortable(b: LeaveSortableRow): number {
  const n = leaveLabel(b).toLowerCase();
  if (/\bearned\b/i.test(n)) return 0;
  if (b.paid === false || /\blwop\b/i.test(n)) return 1;
  if (/bereavement/i.test(n) || /^b\.?\s*l\.?$/i.test(n.trim())) return 2;
  return 50;
}

/**
 * Preferred order: Earned → LWOP → Bereavement → others (A–Z).
 * Works for balance cards (`type_name`) and apply-leave dropdown (`name`).
 */
export function sortLeaveBalancesByDisplayOrder<T extends LeaveSortableRow>(items: readonly T[]): T[] {
  const out = [...items].sort((a, b) => {
    const d = rankLeaveSortable(a) - rankLeaveSortable(b);
    if (d !== 0) return d;
    return leaveLabel(a).localeCompare(leaveLabel(b), undefined, { sensitivity: "base" });
  });
  return out as T[];
}

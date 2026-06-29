/** Compensation / comp-off leave — flag from DB or legacy name match. */
export function isCompensationLeaveType(
  lt: { is_compensation_leave?: boolean; isCompensationLeave?: boolean; name?: unknown; type_name?: unknown },
): boolean {
  if (lt.is_compensation_leave || lt.isCompensationLeave) return true;
  const n = String(lt.type_name ?? lt.name ?? "").trim().toLowerCase();
  return /compensation|comp[\s-]?off/.test(n);
}

export function isEarnedLeaveTypeName(name: unknown): boolean {
  return /earned|annual|^el$/i.test(String(name ?? "").trim());
}

export function isEarnedLeaveType(
  lt: { name?: unknown; type_name?: unknown; is_compensation_leave?: boolean; isCompensationLeave?: boolean },
): boolean {
  if (isCompensationLeaveType(lt)) return false;
  return isEarnedLeaveTypeName(lt.type_name ?? lt.name);
}

export function allowsManualBalanceCredit(
  lt: { name?: unknown; type_name?: unknown; is_compensation_leave?: boolean; isCompensationLeave?: boolean },
): boolean {
  return isCompensationLeaveType(lt) || isEarnedLeaveType(lt);
}

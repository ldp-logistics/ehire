/** Stable JSON snapshot of an attendance row for legal audit logs. */

export function attendanceRowSnapshot(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null;
  return {
    id: row.id,
    employee_id: row.employee_id,
    date: row.date,
    check_in_time: row.check_in_time,
    check_out_time: row.check_out_time,
    status: row.status,
    source: row.source,
    remarks: row.remarks,
    policy_snapshot: row.policy_snapshot,
    is_auto_checkout: row.is_auto_checkout,
    missed_checkout: row.missed_checkout,
    auto_checkout_at: row.auto_checkout_at,
    is_overtime_approved: row.is_overtime_approved,
    deleted_at: row.deleted_at,
    deleted_by_user_id: row.deleted_by_user_id,
  };
}

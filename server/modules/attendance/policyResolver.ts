/**
 * Future multi-policy: resolve which org policy applies to a principal.
 * Today: always org_timesheet_policy id = 1.
 */
import type { AttendanceRepository } from "./AttendanceRepository.js";
import type { ResolvedOrgPolicy } from "../../lib/attendancePolicy.js";

export async function getPolicyForUser(
  _userId: string,
  repo: AttendanceRepository,
  normaliseRow: (row: Record<string, unknown> | null) => ResolvedOrgPolicy
): Promise<ResolvedOrgPolicy> {
  await repo.ensureOrgTimesheetPolicyRow();
  const row = await repo.getOrgTimesheetPolicy();
  return normaliseRow(row as Record<string, unknown> | null);
}

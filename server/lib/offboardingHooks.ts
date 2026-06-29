import { AssetService } from "../modules/assets/AssetService.js";

function revokeSystemAccess(employee: { id: string; work_email: string; first_name: string; last_name: string }) {
  console.log(`[OFFBOARDING HOOK] revokeSystemAccess: Revoking access for ${employee.first_name} ${employee.last_name} (${employee.work_email}). V2: Disable Microsoft 365, Google Workspace, VPN, SaaS accounts.`);
}

async function returnAssetsToStock(
  employeeId: string,
  workEmail: string | null | undefined,
  offboardingId?: string,
) {
  const assetSvc = new AssetService();
  const { count } = await assetSvc.releaseAllAssetsForEmployee(employeeId, {
    workEmail,
    offboardingId,
    reason: "offboarding_complete",
  });
  console.log(`[OFFBOARDING HOOK] returnAssetsToStock: ${count} asset(s) returned to stock for employee ${employeeId}`);
}

function disableAttendance(employeeId: string) {
  console.log(`[OFFBOARDING HOOK] disableAttendance: Employee ${employeeId} attendance will be blocked. Attendance routes already check employment_status.`);
}

export async function onOffboardingComplete(
  employee: { id: string; work_email: string; first_name: string; last_name: string },
  offboardingId?: string,
) {
  revokeSystemAccess(employee);
  await returnAssetsToStock(employee.id, employee.work_email, offboardingId);
  disableAttendance(employee.id);
}

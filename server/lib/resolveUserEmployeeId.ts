import { AuthRepository } from "../modules/auth/AuthRepository.js";

let authRepo: AuthRepository | null = null;

function repo(): AuthRepository {
  if (!authRepo) authRepo = new AuthRepository();
  return authRepo;
}

/**
 * Resolve the employee record for a login user.
 * Uses users.employee_id first, then matches login email to work/personal email.
 */
export async function resolveUserEmployeeId(params: {
  employeeId?: string | null;
  email?: string | null;
}): Promise<string | null> {
  if (params.employeeId) return params.employeeId;
  const email = params.email?.trim().toLowerCase();
  if (!email) return null;
  const emp = await repo().findEmployeeByEmail(email);
  return emp?.id ?? null;
}

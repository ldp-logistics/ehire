import { CompensationRepository } from "./CompensationRepository.js";
import { NotFoundError, ValidationError } from "../../core/types/index.js";
import {
  getEmployeeEmail,
  getEmailsByRole,
  getEmailsByRolesForRegion,
  resolveActorDisplayForEmail,
  dedupeRecipientsByEmail,
  notifyEmail,
} from "../../lib/emailNotifications.js";
import { getEmployeeRegion } from "../../lib/regionAccess.js";
import { hasBreakdownInput, normalizeSalaryPayload, normalizeAdditionalAllowances } from "../../../shared/compensationSalary.js";

function prepareSalaryData(body: Record<string, unknown>) {
  try {
    const normalized = normalizeSalaryPayload(body);
    return {
      ...body,
      annualSalary: normalized.annualSalary,
      payRate: normalized.payRate,
      payRatePeriod: "Monthly",
      baseSalaryMonthly: normalized.baseSalaryMonthly,
      allowancesMonthly: normalized.allowancesMonthly,
      additionalAllowances: normalized.additionalAllowances,
    };
  } catch (e) {
    throw new ValidationError(e instanceof Error ? e.message : "Invalid salary data");
  }
}

/** Legacy PATCH: preserve existing breakdown when breakdown fields not sent. */
function prepareSalaryUpdate(existing: Record<string, unknown>, body: Record<string, unknown>) {
  if (hasBreakdownInput(body)) return prepareSalaryData(body);
  const annual = body.annualSalary ?? body.annual_salary ?? existing.annual_salary;
  const payRate = body.payRate ?? body.pay_rate ?? existing.pay_rate;
  if (annual == null || String(annual).trim() === "") {
    throw new ValidationError("Annual salary is required when no monthly breakdown is provided");
  }
  return {
    ...body,
    annualSalary: String(annual),
    payRate: payRate != null && String(payRate).trim() !== "" ? String(payRate) : null,
    baseSalaryMonthly: existing.base_salary_monthly != null ? String(existing.base_salary_monthly) : null,
    allowancesMonthly: existing.allowances_monthly != null ? String(existing.allowances_monthly) : null,
    additionalAllowances: normalizeAdditionalAllowances(existing.additional_allowances),
  };
}

function formatEmailDate(value: unknown): string {
  if (value == null || value === "") return "—";
  const s = String(value).trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    }
  }
  return String(value);
}

async function compensationNotifyContext(
  employeeId: string,
  updatedBy: string,
  fields: Record<string, string>
) {
  const doerName = await resolveActorDisplayForEmail(updatedBy);
  return { employee_id: employeeId, doer_name: doerName, ...fields };
}

async function sendCompensationNotify(
  eventKey: "general.compensation.salary_updated" | "general.compensation.bonus_added",
  employeeId: string,
  updatedBy: string,
  fields: Record<string, string>
) {
  const empRec = await getEmployeeEmail(employeeId);
  const empRegion = await getEmployeeRegion(employeeId);
  const scopedHrs = empRegion
    ? await getEmailsByRolesForRegion(["hr", "limited_hr"], empRegion)
    : [];
  const fallbackHrs =
    scopedHrs.length > 0
      ? []
      : [
          ...(await getEmailsByRole("hr")),
          ...(await getEmailsByRole("limited_hr")),
        ];
  const hrs = dedupeRecipientsByEmail([...scopedHrs, ...fallbackHrs]);
  const ctx = await compensationNotifyContext(employeeId, updatedBy, {
    employee_name: empRec?.name || "Employee",
    ...fields,
  });
  if (hrs.length) await notifyEmail(eventKey, ctx, hrs);
}

export class CompensationService {
  private readonly repo = new CompensationRepository();

  async getAllEmergencyContacts() { return this.repo.getAllEmergencyContacts(); }

  // Salary
  async getSalary(employeeId: string) { return this.repo.getSalary(employeeId); }
  async createSalary(employeeId: string, data: any, updatedBy: string) {
    const prepared = prepareSalaryData(data as Record<string, unknown>);
    const row = await this.repo.createSalary(employeeId, prepared, updatedBy);
    (async () => {
      try {
        await sendCompensationNotify("general.compensation.salary_updated", employeeId, updatedBy, {
          start_date: formatEmailDate(data.startDate),
        });
      } catch {}
    })();
    return row;
  }
  async updateSalary(id: string, data: any, updatedBy: string) {
    const existing = await this.repo.getSalaryById(id);
    if (!existing) throw new NotFoundError("Salary record", id);
    const prepared = prepareSalaryUpdate(existing as Record<string, unknown>, data as Record<string, unknown>);
    const row = await this.repo.updateSalary(id, prepared, updatedBy);
    if (!row) throw new NotFoundError("Salary record", id);
    (async () => {
      try {
        await sendCompensationNotify("general.compensation.salary_updated", row.employee_id, updatedBy, {
          start_date: formatEmailDate(data.startDate ?? existing.start_date),
        });
      } catch {}
    })();
    return row;
  }
  async deleteSalary(id: string) {
    const ok = await this.repo.deleteSalary(id);
    if (!ok) throw new NotFoundError("Salary record", id);
  }

  // Banking
  async getBanking(employeeId: string) { return this.repo.getBanking(employeeId); }
  async createBanking(employeeId: string, data: any, updatedBy: string) { return this.repo.createBanking(employeeId, data, updatedBy); }
  async updateBanking(id: string, data: any, updatedBy: string) {
    const row = await this.repo.updateBanking(id, data, updatedBy);
    if (!row) throw new NotFoundError("Banking record", id);
    return row;
  }
  async deleteBanking(id: string) {
    const ok = await this.repo.deleteBanking(id);
    if (!ok) throw new NotFoundError("Banking record", id);
  }

  // Bonuses
  async getBonuses(employeeId: string) { return this.repo.getBonuses(employeeId); }
  async createBonus(employeeId: string, data: any, updatedBy: string) {
    const row = await this.repo.createBonus(employeeId, data, updatedBy);
    (async () => {
      try {
        await sendCompensationNotify("general.compensation.bonus_added", employeeId, updatedBy, {
          bonus_type: data.bonusType || data.type || "Bonus",
          bonus_amount: String(data.amount || data.bonusAmount || "—"),
          currency: data.currency || "PKR",
          date: formatEmailDate(data.bonusDate),
        });
      } catch {}
    })();
    return row;
  }
  async updateBonus(id: string, data: any, updatedBy: string) {
    const row = await this.repo.updateBonus(id, data, updatedBy);
    if (!row) throw new NotFoundError("Bonus record", id);
    return row;
  }
  async deleteBonus(id: string) {
    const ok = await this.repo.deleteBonus(id);
    if (!ok) throw new NotFoundError("Bonus record", id);
  }

  // Stock Grants
  async getStockGrants(employeeId: string) { return this.repo.getStockGrants(employeeId); }
  async createStockGrant(employeeId: string, data: any, updatedBy: string) { return this.repo.createStockGrant(employeeId, data, updatedBy); }
  async updateStockGrant(id: string, data: any, updatedBy: string) {
    const row = await this.repo.updateStockGrant(id, data, updatedBy);
    if (!row) throw new NotFoundError("Stock grant", id);
    return row;
  }
  async deleteStockGrant(id: string) {
    const ok = await this.repo.deleteStockGrant(id);
    if (!ok) throw new NotFoundError("Stock grant", id);
  }
}

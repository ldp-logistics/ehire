import { BenefitsRepository } from "./BenefitsRepository.js";
import { NotFoundError, ValidationError, ConflictError, ForbiddenError } from "../../core/types/index.js";
import { normalizeBenefitCustomFields } from "../../../shared/benefitFields.js";
import { effectiveRegionsFor, getEmployeeRegion, isValidRegionCode } from "../../lib/regionAccess.js";
import type { ModuleRegionCtx } from "../../lib/moduleRegionCtx.js";

export class BenefitsService {
  private readonly repo = new BenefitsRepository();

  /** Benefits are strictly per-region — never return null (no global card list). */
  private benefitRegionsFor(ctx?: ModuleRegionCtx): string[] {
    if (!ctx) return [];
    const effective = effectiveRegionsFor(ctx, ctx.requestedRegion);
    if (effective !== null) return effective;
    // Super admin with "All regions" selected: scope to their own region, not every card.
    if (ctx.regionCode && isValidRegionCode(ctx.regionCode)) return [ctx.regionCode];
    return [];
  }

  private async assertEmployeeInScope(ctx: ModuleRegionCtx | undefined, employeeId: string): Promise<void> {
    if (!ctx) return;
    const regions = this.benefitRegionsFor(ctx);
    if (regions.length === 0) return;
    const empRegion = await getEmployeeRegion(employeeId);
    if (regions.length === 0 || !empRegion || !regions.includes(empRegion)) {
      throw new ForbiddenError("This employee belongs to a different region.");
    }
  }

  private async assertAssignmentInScope(ctx: ModuleRegionCtx | undefined, assignmentId: string): Promise<void> {
    const row = await this.repo.findAssignmentById(assignmentId);
    if (!row?.employee_id) return;
    await this.assertEmployeeInScope(ctx, String(row.employee_id));
  }

  private async assertCardInScope(ctx: ModuleRegionCtx | undefined, cardId: string): Promise<void> {
    const regions = this.benefitRegionsFor(ctx);
    if (regions.length === 0) {
      throw new ForbiddenError("Select a region to access benefit cards.");
    }
    const card = await this.repo.getCard(cardId);
    if (!card?.region_code) {
      throw new ForbiddenError("This benefit card is not assigned to a region.");
    }
    if (!regions.includes(String(card.region_code))) {
      throw new ForbiddenError("This benefit card belongs to a different region.");
    }
  }

  /** Single region to stamp on a newly created benefit card. */
  private resolveCreateRegion(ctx?: ModuleRegionCtx): string {
    const regions = this.benefitRegionsFor(ctx);
    if (regions.length !== 1) {
      throw new ValidationError("Select a region before creating a benefit card.");
    }
    return regions[0];
  }

  // ── Cards ──────────────────────────────────────────────────────────────────

  async listCards(includeInactive = false, ctx?: ModuleRegionCtx) {
    return this.repo.listCards(includeInactive, this.benefitRegionsFor(ctx));
  }

  async getCard(id: string, ctx?: ModuleRegionCtx) {
    await this.assertCardInScope(ctx, id);
    const card = await this.repo.getCard(id);
    if (!card) throw new NotFoundError("Benefit card", id);
    const assignments = await this.repo.getCardAssignments(id, this.benefitRegionsFor(ctx));
    return { ...card, assignments };
  }

  async createCard(data: any, createdBy: string, ctx?: ModuleRegionCtx) {
    if (!data.title?.trim()) throw new ValidationError("Title is required");
    const regionCode = this.resolveCreateRegion(ctx);
    const name = await this.repo.resolveUserName(createdBy);
    return this.repo.createCard({
      title: data.title.trim(),
      category: data.category ?? "medical",
      provider: data.provider?.trim() || null,
      description: data.description?.trim() || null,
      validFrom: data.validFrom || null,
      validUntil: data.validUntil || null,
      documentUrl: data.documentUrl || null,
      customFields: normalizeBenefitCustomFields(data.customFields),
      regionCode,
    }, createdBy, name);
  }

  async updateCard(id: string, data: any, ctx?: ModuleRegionCtx) {
    await this.assertCardInScope(ctx, id);
    const existing = await this.repo.getCard(id);
    if (!existing) throw new NotFoundError("Benefit card", id);
    const row = await this.repo.updateCard(id, {
      title: data.title?.trim() || undefined,
      category: data.category || undefined,
      provider: data.provider !== undefined ? (data.provider?.trim() || null) : undefined,
      description: data.description !== undefined ? (data.description?.trim() || null) : undefined,
      validFrom: data.validFrom !== undefined ? (data.validFrom || null) : undefined,
      validUntil: data.validUntil !== undefined ? (data.validUntil || null) : undefined,
      documentUrl: data.documentUrl !== undefined ? (data.documentUrl || null) : undefined,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : undefined,
      customFields: data.customFields !== undefined ? normalizeBenefitCustomFields(data.customFields) : undefined,
    });
    if (!row) throw new NotFoundError("Benefit card", id);
    return row;
  }

  async deleteCard(id: string, ctx?: ModuleRegionCtx) {
    await this.assertCardInScope(ctx, id);
    const card = await this.repo.getCard(id);
    if (!card) throw new NotFoundError("Benefit card", id);
    const ok = await this.repo.deleteCard(id);
    if (!ok) throw new NotFoundError("Benefit card", id);
  }

  // ── Assignments ────────────────────────────────────────────────────────────

  async getCardAssignments(cardId: string, ctx?: ModuleRegionCtx) {
    await this.assertCardInScope(ctx, cardId);
    const card = await this.repo.getCard(cardId);
    if (!card) throw new NotFoundError("Benefit card", cardId);
    return this.repo.getCardAssignments(cardId, this.benefitRegionsFor(ctx));
  }

  async addAssignment(cardId: string, data: any, assignedBy: string, ctx?: ModuleRegionCtx) {
    await this.assertCardInScope(ctx, cardId);
    const card = await this.repo.getCard(cardId);
    if (!card) throw new NotFoundError("Benefit card", cardId);
    if (!data.employeeId) throw new ValidationError("employeeId is required");
    await this.assertEmployeeInScope(ctx, data.employeeId);
    const empRegion = await getEmployeeRegion(data.employeeId);
    if (card.region_code && empRegion && card.region_code !== empRegion) {
      throw new ForbiddenError("This benefit card cannot be assigned to an employee in a different region.");
    }

    const name = await this.repo.resolveUserName(assignedBy);
    const existing = await this.repo.findAssignment(cardId, data.employeeId);
    if (existing && existing.status === "active") {
      throw new ConflictError("Employee is already assigned to this benefit");
    }

    return this.repo.addAssignment(cardId, data.employeeId, {
      cardNumber: data.cardNumber || null,
      notes: data.notes || null,
    }, assignedBy, name);
  }

  async updateAssignment(id: string, data: any, ctx?: ModuleRegionCtx) {
    await this.assertAssignmentInScope(ctx, id);
    const row = await this.repo.updateAssignment(id, {
      cardNumber: data.cardNumber !== undefined ? (data.cardNumber || null) : undefined,
      notes: data.notes !== undefined ? (data.notes || null) : undefined,
      status: data.status || undefined,
    });
    if (!row) throw new NotFoundError("Assignment", id);
    return row;
  }

  async removeAssignment(id: string, ctx?: ModuleRegionCtx) {
    await this.assertAssignmentInScope(ctx, id);
    const existing = await this.repo.findAssignmentById(id);
    if (!existing) throw new NotFoundError("Assignment", id);
    await this.repo.removeAssignment(id);
  }

  async getEmployeeBenefits(employeeId: string) {
    const empRegion = await getEmployeeRegion(employeeId);
    if (!empRegion) return [];
    return this.repo.getEmployeeBenefits(employeeId, empRegion);
  }

  async getEmployeeBenefitsForUser(
    employeeId: string,
    user: { employeeId?: string | null; role?: string; roles?: string[] },
    ctx?: ModuleRegionCtx,
  ) {
    const roles = new Set([user.role, ...(user.roles ?? [])].filter(Boolean));
    const isHRAdmin = roles.has("admin") || roles.has("hr");
    if (!isHRAdmin && user.employeeId !== employeeId) {
      throw new ForbiddenError("Not allowed to view this employee's benefits");
    }
    if (isHRAdmin) await this.assertEmployeeInScope(ctx, employeeId);
    const empRegion = await getEmployeeRegion(employeeId);
    if (!empRegion) return [];
    return this.repo.getEmployeeBenefits(employeeId, empRegion);
  }
}

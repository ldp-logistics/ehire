/**
 * ResourceService — all business logic for this module.
 *
 * Rules:
 *  • Call repository methods; never write SQL directly.
 *  • Throw AppError subclasses on business-rule violations.
 *  • No req / res / next. 100% HTTP-free.
 *  • Every method is independently unit-testable.
 */

import { ResourceRepository } from "./ResourceRepository.js";
import type { ResourceRow } from "./ResourceRepository.js";
import type { ResourceResponseDTO } from "./Resource.dto.js";
import type { CreateResourceInput, UpdateResourceInput } from "./Resource.validators.js";
import type { PaginatedResult, PaginationParams } from "../../core/types/index.js";
import { buildPaginationMeta } from "../../core/utils/pagination.js";
import { NotFoundError, ConflictError } from "../../core/types/index.js";

export class ResourceService {
  private readonly repo: ResourceRepository;

  constructor() {
    this.repo = new ResourceRepository();
  }

  async listResources(params: PaginationParams): Promise<PaginatedResult<ResourceResponseDTO>> {
    const { rows, total } = await this.repo.findAll(params);
    return { data: rows.map(this.toDTO), meta: buildPaginationMeta(total, params) };
  }

  async getResource(id: string): Promise<ResourceResponseDTO> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError("Resource", id);
    return this.toDTO(row);
  }

  async createResource(data: CreateResourceInput): Promise<ResourceResponseDTO> {
    const existing = await this.repo.findByName(data.name);
    if (existing) throw new ConflictError(`A resource named '${data.name}' already exists`);
    const row = await this.repo.create(data);
    return this.toDTO(row);
  }

  async updateResource(id: string, data: UpdateResourceInput): Promise<ResourceResponseDTO> {
    const target = await this.repo.findById(id);
    if (!target) throw new NotFoundError("Resource", id);

    if (data.name && data.name.toLowerCase() !== target.name.toLowerCase()) {
      const dup = await this.repo.findByName(data.name);
      if (dup) throw new ConflictError(`A resource named '${data.name}' already exists`);
    }

    const updated = await this.repo.update(id, data);
    if (!updated) throw new NotFoundError("Resource", id);
    return this.toDTO(updated);
  }

  async deleteResource(id: string): Promise<void> {
    const target = await this.repo.findById(id);
    if (!target) throw new NotFoundError("Resource", id);
    // ── Add business-rule guards here before deleting ──
    await this.repo.delete(id);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private toDTO(row: ResourceRow): ResourceResponseDTO {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      isActive: row.is_active,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }
}

/**
 * ResourceRepository — database interactions only.
 * No business logic. No HTTP concerns.
 */

import { BaseRepository } from "../../core/base/BaseRepository.js";
import type { PaginationParams } from "../../core/types/index.js";
import type { CreateResourceInput, UpdateResourceInput } from "./Resource.validators.js";

// ─── Raw DB row type ──────────────────────────────────────────────────────────

export interface ResourceRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class ResourceRepository extends BaseRepository {
  async findAll(params: PaginationParams): Promise<{ rows: ResourceRow[]; total: number }> {
    const { search, limit, offset } = params;

    const [countRow] = (await (search
      ? this.sql`SELECT COUNT(*)::int AS total FROM resources WHERE name ILIKE ${this.likePattern(search)}`
      : this.sql`SELECT COUNT(*)::int AS total FROM resources`)) as [{ total: number }];

    const rows = (await (search
      ? this.sql`
          SELECT id, name, description, is_active, created_at, updated_at
          FROM resources
          WHERE name ILIKE ${this.likePattern(search)}
          ORDER BY name ASC
          LIMIT ${limit} OFFSET ${offset}`
      : this.sql`
          SELECT id, name, description, is_active, created_at, updated_at
          FROM resources
          ORDER BY name ASC
          LIMIT ${limit} OFFSET ${offset}`)) as ResourceRow[];

    return { rows, total: countRow?.total ?? 0 };
  }

  async findById(id: string): Promise<ResourceRow | null> {
    const rows = (await this.sql`
      SELECT id, name, description, is_active, created_at, updated_at
      FROM resources WHERE id = ${id} LIMIT 1
    `) as ResourceRow[];
    return rows[0] ?? null;
  }

  async findByName(name: string): Promise<ResourceRow | null> {
    const rows = (await this.sql`
      SELECT id, name, description, is_active, created_at, updated_at
      FROM resources WHERE LOWER(name) = LOWER(${name}) LIMIT 1
    `) as ResourceRow[];
    return rows[0] ?? null;
  }

  async create(data: CreateResourceInput): Promise<ResourceRow> {
    const rows = (await this.sql`
      INSERT INTO resources (name, description, is_active)
      VALUES (${data.name}, ${data.description ?? null}, ${data.isActive ?? true})
      RETURNING id, name, description, is_active, created_at, updated_at
    `) as ResourceRow[];
    return rows[0];
  }

  async update(id: string, data: UpdateResourceInput): Promise<ResourceRow | null> {
    const rows = (await this.sql`
      UPDATE resources SET
        name        = COALESCE(${data.name ?? null}, name),
        description = CASE WHEN ${data.description !== undefined}
                     THEN ${data.description ?? null} ELSE description END,
        is_active   = COALESCE(${data.isActive ?? null}, is_active),
        updated_at  = NOW()
      WHERE id = ${id}
      RETURNING id, name, description, is_active, created_at, updated_at
    `) as ResourceRow[];
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = (await this.sql`
      DELETE FROM resources WHERE id = ${id} RETURNING id
    `) as { id: string }[];
    return rows.length > 0;
  }
}

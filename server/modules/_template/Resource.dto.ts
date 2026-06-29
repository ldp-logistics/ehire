/**
 * Resource.dto.ts — Data Transfer Objects.
 *
 * Request DTOs  → define what the API accepts.
 * Response DTOs → define what the API returns (never expose raw DB fields).
 */

// ─── Request DTOs ─────────────────────────────────────────────────────────────

export interface CreateResourceDTO {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateResourceDTO {
  name?: string;
  description?: string;
  isActive?: boolean;
}

// ─── Response DTO ─────────────────────────────────────────────────────────────

export interface ResourceResponseDTO {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

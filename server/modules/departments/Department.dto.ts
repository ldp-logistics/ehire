/**
 * Department.dto.ts — Data Transfer Objects.
 *
 * DTOs explicitly define what data enters the system (request) and
 * what data leaves the system (response). They decouple the database
 * schema from the API contract.
 *
 * Rules:
 *  • Request DTOs must never include id, createdAt, updatedAt.
 *  • Response DTOs must never include raw DB columns like password_hash.
 *  • Add computed fields (e.g. employeeCount) in the response DTO, not the DB.
 */

// ─── Request DTOs (what the client sends IN) ──────────────────────────────────

export interface CreateDepartmentDTO {
  /** Display name of the department. Must be unique. */
  name: string;
  /** Optional reference ID from FreshTeam for idempotent sync. */
  freshteamId?: string;
}

export interface UpdateDepartmentDTO {
  name?: string;
  freshteamId?: string;
}

// ─── Response DTO (what the API sends OUT) ────────────────────────────────────

export interface DepartmentResponseDTO {
  id: string;
  name: string;
  freshteamId: string | null;
  isActive: boolean;
  /** Number of active employees in this department. Computed at query time. */
  employeeCount: number;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

// ─── Paginated list response ──────────────────────────────────────────────────

export interface DepartmentListDTO {
  departments: DepartmentResponseDTO[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

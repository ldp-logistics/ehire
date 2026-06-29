/**
 * Reusable pagination utilities.
 *
 * Usage:
 *   const params = parsePagination(req.query);     // → { page, limit, offset, search }
 *   const meta   = buildPaginationMeta(total, params); // → { page, limit, total, totalPages, … }
 *
 * Both are used together in every list endpoint:
 *   const params = parsePagination(req.query);
 *   const { rows, total } = await repo.findAll(params);
 *   ApiResponse.paginated(res, { data: rows, meta: buildPaginationMeta(total, params) });
 */

import type { PaginationMeta, PaginationParams } from "../types/index.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parse raw Express query params into a normalized PaginationParams object.
 * All values are sanitized and bounded.
 */
export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const rawPage = parseInt(String(query.page ?? ""), 10);
  const rawLimit = parseInt(String(query.limit ?? ""), 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : DEFAULT_PAGE;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  const offset = (page - 1) * limit;
  const search = typeof query.search === "string" ? query.search.trim() : "";

  return { page, limit, offset, search };
}

/**
 * Build pagination meta from the total row count and pagination params.
 * Attach this to every paginated API response so the client can paginate.
 */
export function buildPaginationMeta(total: number, params: PaginationParams): PaginationMeta {
  const totalPages = total > 0 ? Math.ceil(total / params.limit) : 1;
  return {
    page: params.page,
    limit: params.limit,
    total,
    totalPages,
    hasNext: params.page < totalPages,
    hasPrev: params.page > 1,
  };
}

/**
 * Helper for raw SQL: returns  LIMIT n OFFSET m  as a plain string.
 * Not safe for untrusted input — use parsePagination first.
 */
export function paginationClause(params: PaginationParams): string {
  return `LIMIT ${params.limit} OFFSET ${params.offset}`;
}

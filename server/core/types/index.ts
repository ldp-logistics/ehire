/**
 * Shared TypeScript types, interfaces, and error classes used across all modules.
 * Import from here in any module: import type { AuthUser, PaginationParams } from "../../core/types/index.js"
 */

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  employeeId: string | null;
  allowedModules: string[];
}

// RequestWithUser is kept for backwards compat but new code should use
// the globally-augmented req.user (UserPayload) from middleware/auth.ts

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationParams {
  page: number;
  limit: number;
  search: string;
  offset: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

// ─── Base Entity ──────────────────────────────────────────────────────────────

export interface BaseEntity {
  id: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// ─── Error Classes ────────────────────────────────────────────────────────────
// Throw these from services; the global error handler translates them to HTTP responses.

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = "APP_ERROR",
  ) {
    super(message);
    this.name = "AppError";
    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

/** 404 – resource not found */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      404,
      id ? `${resource} with id '${id}' not found` : `${resource} not found`,
      "NOT_FOUND",
    );
  }
}

/** 400 – payload failed schema / business validation */
export class ValidationError extends AppError {
  constructor(message: string, statusCode = 400) {
    super(statusCode, message, "VALIDATION_ERROR");
  }
}

/** 409 – uniqueness / state conflict */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, "CONFLICT");
  }
}

/** 403 – authenticated but not authorised */
export class ForbiddenError extends AppError {
  constructor(message = "You are not permitted to perform this action") {
    super(403, message, "FORBIDDEN");
  }
}

/** 422 – semantically invalid data (business rule) */
export class UnprocessableError extends AppError {
  constructor(message: string) {
    super(422, message, "UNPROCESSABLE");
  }
}

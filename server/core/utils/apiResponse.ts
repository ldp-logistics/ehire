/**
 * Standardized API response helpers.
 *
 * Every controller in every module must use these helpers so the client always
 * receives a consistent envelope:
 *
 *   { success: true,  data: T,   meta?: PaginationMeta, message?: string }
 *   { success: false, error: { code, message } }
 *
 * Usage in controllers:
 *   ApiResponse.ok(res, data)
 *   ApiResponse.created(res, data)
 *   ApiResponse.paginated(res, result)
 *   ApiResponse.noContent(res)
 *   ApiResponse.error(res, 400, "Bad request", "VALIDATION_ERROR")
 */

import type { Response } from "express";
import type { PaginatedResult, PaginationMeta } from "../types/index.js";

// ─── Shape type (for documentation / client codegen) ─────────────────────────

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  message?: string;
  meta?: PaginationMeta;
}

export interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

export type ApiEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

// ─── Response helpers ─────────────────────────────────────────────────────────

export class ApiResponse {
  /** 200 – single resource or arbitrary data */
  static ok<T>(res: Response, data: T, message?: string): Response {
    const body: SuccessEnvelope<T> = { success: true, data };
    if (message) body.message = message;
    return res.status(200).json(body);
  }

  /** 201 – resource created */
  static created<T>(res: Response, data: T, message = "Created successfully"): Response {
    return res.status(201).json({ success: true, data, message } satisfies SuccessEnvelope<T>);
  }

  /** 200 – paginated list with meta */
  static paginated<T>(res: Response, result: PaginatedResult<T>): Response {
    return res
      .status(200)
      .json({ success: true, data: result.data, meta: result.meta } satisfies SuccessEnvelope<T[]>);
  }

  /** 204 – successful delete / action with no content */
  static noContent(res: Response): Response {
    return res.status(204).send();
  }

  /** Generic error – prefer throwing AppError from services instead */
  static error(
    res: Response,
    statusCode: number,
    message: string,
    code = "ERROR",
  ): Response {
    return res.status(statusCode).json({ success: false, error: { code, message } } satisfies ErrorEnvelope);
  }
}

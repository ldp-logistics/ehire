/**
 * Global Express error-handling middleware.
 *
 * Register this LAST in app.ts, after all routes:
 *   app.use(errorHandler);
 *
 * Services and repositories throw AppError subclasses (NotFoundError, ConflictError, etc.).
 * This middleware catches them and converts them to clean JSON responses.
 * Unknown errors are logged and returned as 500.
 */

import type { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { AppError } from "../types/index.js";

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
    return;
  }

  // Zod or other validation library errors surfaced outside a controller
  if (err instanceof Error && err.name === "ZodError") {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: err.message },
    });
    return;
  }

  // Postgres unique-violation (code 23505) – surface as 409 instead of 500
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as Record<string, unknown>).code === "23505"
  ) {
    res.status(409).json({
      success: false,
      error: { code: "CONFLICT", message: "A record with the same unique value already exists" },
    });
    return;
  }

  // Unhandled / unexpected — always log server-side; avoid leaking internals to clients in production
  const isProd = process.env.NODE_ENV === "production";
  console.error("[errorHandler]", err);
  const clientMessage = isProd
    ? "An unexpected error occurred. Please try again later."
    : err instanceof Error
      ? err.message
      : "Internal server error";
  res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: clientMessage } });
};

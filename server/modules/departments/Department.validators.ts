/**
 * Department.validators.ts — Zod schemas for validating incoming payloads.
 *
 * Controllers call .safeParse() on these schemas before passing data to services.
 * This keeps validation close to the API boundary and keeps services clean.
 */

import { z } from "zod";

// ─── Create ───────────────────────────────────────────────────────────────────

export const CreateDepartmentSchema = z.object({
  name: z
    .string({ required_error: "Name is required" })
    .trim()
    .min(1, "Name cannot be empty")
    .max(150, "Name must be 150 characters or fewer"),
  freshteamId: z.string().trim().max(32).optional(),
});

// ─── Update (all fields optional; at least one must be present) ───────────────

export const UpdateDepartmentSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    freshteamId: z.string().trim().max(32).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0 && Object.values(data).some((v) => v !== undefined), {
    message: "Provide at least one field to update",
  });

// ─── Inferred TypeScript types ────────────────────────────────────────────────

export type CreateDepartmentInput = z.infer<typeof CreateDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>;

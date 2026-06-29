/**
 * Resource.validators.ts — Zod validation schemas for incoming payloads.
 *
 * Used by the controller before passing data to the service.
 */

import { z } from "zod";

export const CreateResourceSchema = z.object({
  name: z
    .string({ required_error: "Name is required" })
    .trim()
    .min(1, "Name cannot be empty")
    .max(200, "Name must be 200 characters or fewer"),
  description: z.string().trim().max(1000).optional(),
  isActive: z.boolean().optional().default(true),
});

export const UpdateResourceSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "Provide at least one field to update",
  });

export type CreateResourceInput = z.infer<typeof CreateResourceSchema>;
export type UpdateResourceInput = z.infer<typeof UpdateResourceSchema>;

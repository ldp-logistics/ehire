import { z } from "zod";

export const CreatePostSchema = z.object({
  content: z
    .string({ required_error: "Content is required" })
    .trim()
    .min(1, "Content cannot be empty")
    .max(5000, "Content must be 5000 characters or fewer"),
  isPinned: z.boolean().optional().default(false),
  /** Array of base64 data-URL attachments or plain https:// URLs */
  attachments: z
    .array(
      z.object({
        fileName: z.string().trim().min(1).max(500),
        mimeType: z.string().trim().min(1).max(200),
        /** base64 data URL: "data:<mime>;base64,<data>" OR an already-uploaded https URL */
        dataUrl: z.string().min(1),
      })
    )
    .max(10, "Maximum 10 attachments per post")
    .optional()
    .default([]),
  /** Employee row IDs tagged in this post */
  mentionedEmployeeIds: z
    .array(z.string().trim().min(1).max(255))
    .max(20, "Maximum 20 tagged employees per post")
    .optional()
    .default([]),
});

export const ToggleReactionSchema = z.object({
  emoji: z
    .string()
    .trim()
    .min(1)
    .max(10, "Emoji too long"),
});

export type CreatePostInput = z.infer<typeof CreatePostSchema>;
export type ToggleReactionInput = z.infer<typeof ToggleReactionSchema>;

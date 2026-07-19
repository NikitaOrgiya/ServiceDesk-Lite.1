import { z } from "zod";

/**
 * Mirrors the `public.add_ticket_comment` RPC's own bounds (1–3000 chars,
 * trimmed) so the client and the RPC never disagree about validity — the
 * RPC remains the actual authority, this is only a re-validation at the
 * Server Action boundary.
 */
export const addCommentSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Комментарий не может быть пустым")
    .max(3000, "Комментарий должен содержать не более 3000 символов"),
});

export type AddCommentInput = z.infer<typeof addCommentSchema>;

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireEmployee } from "@/features/auth/server/require-employee";
import { createTicketSchema } from "@/features/tickets/schemas/create-ticket";
import { getTicketErrorMessage } from "@/features/tickets/utils/error-messages";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

export type CreateTicketActionResult = {
  error: string;
};

/**
 * Creates a ticket exclusively through `public.create_ticket` — never a
 * direct `.insert()`. Re-validates the FormData with the same Zod schema
 * the client used (the client's own validation is not trusted) and never
 * accepts author_id/public_number/status/assignee_id/created_at from the
 * form; those fields don't even exist in `createTicketSchema`.
 *
 * On success this redirects (throws) and never returns a value; it only
 * returns `{ error }` for the form to display.
 */
export async function createTicketAction(formData: FormData): Promise<CreateTicketActionResult> {
  await requireEmployee("/app/tickets/new");

  const parsed = createTicketSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    priority: formData.get("priority"),
  });

  if (!parsed.success) {
    return { error: getTicketErrorMessage("create") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_ticket", {
    p_title: parsed.data.title,
    p_description: parsed.data.description,
    p_category: parsed.data.category,
    p_priority: parsed.data.priority,
  });

  const created = Array.isArray(data) ? (data[0] as { id: string } | undefined) : undefined;

  if (error || !created) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "tickets:create_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return { error: getTicketErrorMessage("create") };
  }

  revalidatePath("/app");
  revalidatePath("/app/tickets");
  redirect(`/app/tickets/${created.id}`);
}

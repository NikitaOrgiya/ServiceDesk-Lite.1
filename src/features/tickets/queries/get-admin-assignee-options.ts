import "server-only";

import { createDataApiClient } from "@/lib/neon/data-api";
import { requireAdmin } from "@/features/auth/server/require-admin";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";

export type AdminAssigneeOption = {
  id: string;
  fullName: string;
};

/**
 * Options for the registry's "Исполнитель" filter — active profiles only
 * (an inactive profile can't be a meaningful *filter* target going
 * forward, even though an already-assigned ticket from before someone was
 * deactivated still displays their name fine via get-admin-tickets.ts's
 * own embed). Selects only `id`/`full_name`: never email (public.profiles
 * has no email column at all — it lives only in Neon Auth's internal
 * table, which this app does not query), and `id` is a technical filter
 * value only, never rendered as visible text (see AdminTicketFilters).
 *
 * requireAdmin() first, unconditionally, same as get-admin-tickets.ts and
 * for the same reason: this is its own independent data-access boundary
 * and does not rely on its caller (the same page, itself already gated by
 * /admin layout's requireAdmin()) having checked authorization. On auth
 * failure, requireAdmin() redirects (throws) and the profiles SELECT below
 * never runs.
 *
 * profiles_select_own_admin_or_related (drizzle/0009_profile_visibility_
 * for_related_tickets.sql) is what lets an admin's JWT read every profile
 * here, not just their own — defense in depth alongside, not instead of,
 * the requireAdmin() check above.
 *
 * Known limitation: two profiles that happen to share the same full_name
 * are indistinguishable in this list — deliberately not disambiguated by
 * email or by appending any part of the internal id to the visible label.
 */
export async function getAdminAssigneeOptions(): Promise<AdminAssigneeOption[] | null> {
  await requireAdmin();

  const client = createDataApiClient();

  const { data, error } = await client
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "admin_tickets:assignee_options_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return null;
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    fullName: row.full_name as string,
  }));
}

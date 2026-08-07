import "server-only";

import { createDataApiClient } from "@/lib/neon/data-api";
import { requireAdmin } from "@/features/auth/server/require-admin";
import { ticketIdSchema } from "@/features/tickets/schemas/ticket-id";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";
import { toSingleEmbed } from "@/features/tickets/utils/postgrest-embed";
import type { TicketHistoryItem } from "@/features/tickets/types/ticket";

/**
 * Loads the full history timeline for one ticket, oldest first — read-only,
 * admin-only. Duplicates getTicketHistory's query/mapping (get-employee-
 * ticket.ts) rather than sharing it, for the same reason
 * getAdminTicketComments duplicates getTicketComments — see that file's
 * doc comment. Formatting the mapped TicketHistoryItem[] into Russian
 * labels is *not* duplicated here: that already lives in the shared, pure
 * utils/history-format.ts (formatHistoryEvent/formatHistoryActor), reused
 * as-is by the same TicketHistory component for both routes.
 *
 * requireAdmin() runs first, unconditionally, before the ticket id is
 * validated or the Data API client created. `ticket_history_select_accessible`
 * RLS (via can_access_ticket()'s is_admin() branch) is what actually widens
 * visibility to every ticket's history for an admin JWT — requireAdmin()
 * is the application-level gate in front of that, not a substitute.
 *
 * Never writes to ticket_history — it is trigger-populated only (see
 * record_ticket_history() in drizzle/0003_ticket_workflow_and_history.sql).
 * An invalid ticket id or a Data API error both resolve to an empty list
 * (never thrown), matching getAdminTicketComments's same failure
 * semantics so neither ever masquerades as "the ticket doesn't exist".
 */
export async function getAdminTicketHistory(ticketId: string): Promise<TicketHistoryItem[]> {
  await requireAdmin();

  const idResult = ticketIdSchema.safeParse(ticketId);
  if (!idResult.success) {
    return [];
  }

  const client = createDataApiClient();

  const { data, error } = await client
    .from("ticket_history")
    .select(
      "id, event_type, field_name, old_value, new_value, created_at, actor:profiles!ticket_history_actor_id_profiles_id_fk(full_name)"
    )
    .eq("ticket_id", idResult.data)
    .order("created_at", { ascending: true });

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "admin_tickets:history_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return [];
  }

  const rows = data ?? [];

  // assignee_changed stores raw Neon Auth user ids in old_value/new_value
  // (plain TEXT columns, not FK columns PostgREST can embed) — resolve
  // them with one batch profiles lookup, never one per row, same as
  // getTicketHistory in get-employee-ticket.ts.
  const assigneeIds = new Set<string>();
  for (const row of rows) {
    if (row.field_name === "assignee_id") {
      for (const value of [row.old_value, row.new_value]) {
        if (typeof value === "string" && value.length > 0) {
          assigneeIds.add(value);
        }
      }
    }
  }

  let nameById = new Map<string, string>();
  if (assigneeIds.size > 0) {
    const { data: profileRows, error: profileError } = await client
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(assigneeIds));

    if (profileError) {
      const sanitized = sanitizeError(profileError);
      logger.error({
        event: "admin_tickets:history_failed",
        message: sanitized.message,
        code: sanitized.code,
      });
      // Fall through with no resolved names — resolveAssigneeDisplay()
      // never prints a raw id, it only loses the display name here.
    } else {
      nameById = new Map((profileRows ?? []).map((p) => [p.id as string, p.full_name as string]));
    }
  }

  return rows.map((row) => {
    const actor = toSingleEmbed(row.actor as { full_name: string } | { full_name: string }[] | null);
    const isAssigneeField = row.field_name === "assignee_id";
    return {
      id: row.id as string,
      eventType: row.event_type as TicketHistoryItem["eventType"],
      fieldName: row.field_name as string | null,
      oldValue: isAssigneeField
        ? resolveAssigneeDisplay(row.old_value as string | null, nameById)
        : (row.old_value as string | null),
      newValue: isAssigneeField
        ? resolveAssigneeDisplay(row.new_value as string | null, nameById)
        : (row.new_value as string | null),
      createdAt: row.created_at as string,
      actorName: actor?.full_name ?? null,
    };
  });
}

/** Never returns the raw id: a resolvable name, a safe fallback label for
 * an unresolvable-but-present id, or null when there was genuinely no id. */
function resolveAssigneeDisplay(value: string | null, nameById: Map<string, string>): string | null {
  if (!value) {
    return null;
  }
  return nameById.get(value) ?? "сотрудник";
}

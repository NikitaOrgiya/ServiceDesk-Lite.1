import "server-only";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger/logger";
import { sanitizeError } from "@/lib/logger/sanitize-error";
import { toSingleEmbed } from "@/features/tickets/utils/supabase-embed";
import type { TicketCategory, TicketPriority } from "@/features/tickets/schemas/create-ticket";
import type {
  TicketCommentItem,
  TicketDetail,
  TicketHistoryItem,
  TicketStatus,
} from "@/features/tickets/types/ticket";

export type TicketDetailResult = {
  ticket: TicketDetail;
  comments: TicketCommentItem[];
  history: TicketHistoryItem[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Loads one ticket the caller can access, plus its comments and history.
 * The main ticket row (with author/assignee names embedded) is one query;
 * comments and history are each a separate query — that is the allowed
 * shape (one main query + separate related-collection queries), not N+1.
 *
 * Returns `null` both when the ticket does not exist and when it exists
 * but belongs to someone else — `tickets_select_own_or_admin` RLS makes
 * both cases return zero rows from the caller's point of view, so this
 * function cannot tell them apart, and callers must not try to either
 * (see docs/security.md: never reveal another user's ticket exists).
 */
export async function getEmployeeTicketDetail(ticketId: string): Promise<TicketDetailResult | null> {
  const supabase = await createClient();

  const { data: ticketRow, error: ticketError } = await supabase
    .from("tickets")
    .select(
      `id, public_number, title, description, category, priority, status, due_at, resolved_at, created_at, updated_at,
       author:profiles!tickets_author_id_fkey(full_name),
       assignee:profiles!tickets_assignee_id_fkey(full_name)`
    )
    .eq("id", ticketId)
    .maybeSingle();

  if (ticketError) {
    const sanitized = sanitizeError(ticketError);
    logger.error({
      event: "tickets:detail_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return null;
  }

  if (!ticketRow) {
    return null;
  }

  const author = toSingleEmbed(ticketRow.author as { full_name: string } | { full_name: string }[] | null);
  const assignee = toSingleEmbed(
    ticketRow.assignee as { full_name: string } | { full_name: string }[] | null
  );

  const ticket: TicketDetail = {
    id: ticketRow.id as string,
    publicNumber: ticketRow.public_number as string,
    title: ticketRow.title as string,
    description: ticketRow.description as string,
    category: ticketRow.category as TicketCategory,
    priority: ticketRow.priority as TicketPriority,
    status: ticketRow.status as TicketStatus,
    dueAt: ticketRow.due_at as string | null,
    resolvedAt: ticketRow.resolved_at as string | null,
    createdAt: ticketRow.created_at as string,
    updatedAt: ticketRow.updated_at as string,
    authorName: author?.full_name ?? "—",
    assigneeName: assignee?.full_name ?? null,
  };

  const [comments, history] = await Promise.all([
    getTicketComments(ticketId),
    getTicketHistory(ticketId),
  ]);

  return { ticket, comments, history };
}

async function getTicketComments(ticketId: string): Promise<TicketCommentItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ticket_comments")
    .select("id, message, created_at, author:profiles!ticket_comments_author_id_fkey(full_name, role)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "tickets:comment_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return [];
  }

  type CommentAuthor = { full_name: string; role: "employee" | "admin" };

  return (data ?? []).map((row) => {
    const author = toSingleEmbed(row.author as CommentAuthor | CommentAuthor[] | null);
    return {
      id: row.id as string,
      message: row.message as string,
      createdAt: row.created_at as string,
      authorName: author?.full_name ?? "—",
      authorRole: author?.role ?? "employee",
    };
  });
}

async function getTicketHistory(ticketId: string): Promise<TicketHistoryItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ticket_history")
    .select(
      "id, event_type, field_name, old_value, new_value, created_at, actor:profiles!ticket_history_actor_id_fkey(full_name)"
    )
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (error) {
    const sanitized = sanitizeError(error);
    logger.error({
      event: "tickets:history_failed",
      message: sanitized.message,
      code: sanitized.code,
    });
    return [];
  }

  const rows = data ?? [];

  // assignee_changed stores raw UUIDs in old_value/new_value (they are
  // plain TEXT columns, not FK columns PostgREST can embed) — resolve them
  // to display names with one batch profiles lookup, not one per row.
  const assigneeIds = new Set<string>();
  for (const row of rows) {
    if (row.field_name === "assignee_id") {
      for (const value of [row.old_value, row.new_value]) {
        if (typeof value === "string" && UUID_PATTERN.test(value)) {
          assigneeIds.add(value);
        }
      }
    }
  }

  let nameById = new Map<string, string>();
  if (assigneeIds.size > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(assigneeIds));

    if (profileError) {
      const sanitized = sanitizeError(profileError);
      logger.error({
        event: "tickets:history_failed",
        message: sanitized.message,
        code: sanitized.code,
      });
      // Fall through with no resolved names — formatAssigneeValue() never
      // prints a raw UUID, it only loses the display name in this case.
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

/** Never returns the raw UUID: a resolvable name, a safe fallback label for
 * an unresolvable-but-present id, or null when there was genuinely no id. */
function resolveAssigneeDisplay(value: string | null, nameById: Map<string, string>): string | null {
  if (!value) {
    return null;
  }
  return nameById.get(value) ?? "сотрудник";
}

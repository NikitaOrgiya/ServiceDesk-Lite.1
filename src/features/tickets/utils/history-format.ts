import { formatPriority, formatStatus } from "@/features/tickets/utils/labels";
import { formatDateTime } from "@/features/tickets/utils/format-date";
import type { TicketPriority } from "@/features/tickets/schemas/create-ticket";
import { TICKET_PRIORITIES } from "@/features/tickets/schemas/create-ticket";
import type { TicketHistoryItem, TicketStatus } from "@/features/tickets/types/ticket";
import { TICKET_STATUSES } from "@/features/tickets/types/ticket";

function isTicketStatus(value: string | null): value is TicketStatus {
  return value !== null && (TICKET_STATUSES as readonly string[]).includes(value);
}

function isTicketPriority(value: string | null): value is TicketPriority {
  return value !== null && (TICKET_PRIORITIES as readonly string[]).includes(value);
}

function formatStatusValue(value: string | null): string {
  return isTicketStatus(value) ? formatStatus(value) : "—";
}

function formatPriorityValue(value: string | null): string {
  return isTicketPriority(value) ? formatPriority(value) : "—";
}

function formatDueAtValue(value: string | null): string {
  if (!value) {
    return "не установлен";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : formatDateTime(value);
}

/** Never returns a value name — assignee display names, when present, must
 * already be resolved onto `oldValue`/`newValue` by the query layer before
 * this function runs, so a raw UUID is never printed. */
function formatAssigneeValue(value: string | null): string {
  return value ?? "не назначен";
}

export type FormattedHistoryEvent = {
  title: string;
  detail: string | null;
};

/**
 * Formats one `ticket_history` row into Russian display text. Assumes
 * `oldValue`/`newValue` for `assignee_changed` rows have already been
 * resolved to display names (or left `null`) by the caller — this function
 * never has database access and must never be handed a raw UUID to print.
 */
export function formatHistoryEvent(event: TicketHistoryItem): FormattedHistoryEvent {
  switch (event.eventType) {
    case "ticket_created":
      return { title: "Заявка создана", detail: null };

    case "ticket_cancelled":
      return { title: "Заявка отменена", detail: null };

    case "ticket_closed":
      return { title: "Заявка закрыта", detail: null };

    case "status_changed":
      return {
        title: "Статус изменён",
        detail: `${formatStatusValue(event.oldValue)} → ${formatStatusValue(event.newValue)}`,
      };

    case "priority_changed":
      return {
        title: "Приоритет изменён",
        detail: `${formatPriorityValue(event.oldValue)} → ${formatPriorityValue(event.newValue)}`,
      };

    case "assignee_changed":
      return {
        title: "Исполнитель изменён",
        detail: `${formatAssigneeValue(event.oldValue)} → ${formatAssigneeValue(event.newValue)}`,
      };

    case "due_at_changed":
      return {
        title: "Срок выполнения изменён",
        detail: `${formatDueAtValue(event.oldValue)} → ${formatDueAtValue(event.newValue)}`,
      };

    default:
      return { title: "Системное действие", detail: null };
  }
}

/** "Системное действие" is shown whenever an actor cannot be resolved to a
 * profile (actor_id was null, e.g. a system-context write) — never a UUID. */
export function formatHistoryActor(actorName: string | null): string {
  return actorName ?? "Системное действие";
}

import type { TicketStatus } from "@/features/tickets/types/ticket";

/**
 * Whether the cancel button should be shown at all. This is a UX decision
 * only — `public.cancel_own_ticket` re-checks `status = 'new'` (and
 * ownership) itself and is the actual enforcement, so this function being
 * wrong in either direction cannot let a client bypass that check.
 */
export function canCancelTicket(status: TicketStatus): boolean {
  return status === "new";
}

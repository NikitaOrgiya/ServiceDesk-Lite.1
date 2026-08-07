import { z } from "zod";

import { TICKET_PRIORITIES } from "@/features/tickets/schemas/create-ticket";
import { TICKET_STATUSES } from "@/features/tickets/types/ticket";

/**
 * Re-validates the target status/priority server-side regardless of what
 * the client's <select> already restricted itself to — the canonical
 * vocabulary here is the same TICKET_STATUSES/TICKET_PRIORITIES used
 * everywhere else (labels.ts, create-ticket.ts), not a second, divergent
 * enum. Transition *legality* (e.g. new -> resolved being illegal) is
 * deliberately not re-implemented here — that already lives in
 * public.is_valid_ticket_status_transition() and is enforced inside
 * admin_set_ticket_status (drizzle/0004_comment_and_mutation_rpcs.sql);
 * this schema only guarantees the value reaching the RPC is one of the
 * seven real statuses, never an arbitrary client-supplied string.
 */
export const adminSetTicketStatusSchema = z.object({
  status: z.enum(TICKET_STATUSES),
});

export const adminSetTicketPrioritySchema = z.object({
  priority: z.enum(TICKET_PRIORITIES),
});

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

// Neon Auth user ids (public.profiles.id) are opaque TEXT, not a
// fixed-format UUID this app controls the shape of — same reasoning and
// same bound as MAX_ASSIGNEE_LENGTH in schemas/admin-list-query.ts (the
// registry's assignee *filter* value). Existence and active status are not
// checked here; admin_set_ticket_assignee is the sole authority on whether
// a given id is a real, currently-active profile (SQLSTATE 23514 if not) —
// this schema only bounds the shape of what reaches the RPC at all.
const MAX_ASSIGNEE_ID_LENGTH = 200;

export const adminSetTicketAssigneeSchema = z.object({
  assignee: z.string().trim().min(1).max(MAX_ASSIGNEE_ID_LENGTH),
});

/**
 * `dueAt` is either an absolute ISO instant carrying its own UTC offset
 * (`z.iso.datetime({ offset: true })` — e.g. "...Z" or "...+03:00") or the
 * empty string, the explicit "clear the due date" sentinel a client sends
 * when the datetime-local input was left blank. A timezone-less string
 * like "2026-08-07T15:00" is deliberately rejected here — its meaning
 * would depend on whichever timezone happens to parse it (the server's,
 * not necessarily the admin's), which is exactly the ambiguity this
 * feature must not introduce. See utils/datetime-local.ts for where the
 * browser-local <-> absolute-instant conversion actually happens (always
 * client-side, never here).
 */
export const adminSetTicketDueAtSchema = z.object({
  dueAt: z.union([z.iso.datetime({ offset: true }), z.literal("")]),
});

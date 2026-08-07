import { getTicketErrorMessage } from "@/features/tickets/utils/error-messages";

// SQLSTATE codes admin_set_ticket_status/admin_set_ticket_priority
// deliberately raise — see drizzle/0004_comment_and_mutation_rpcs.sql.
const PG_INVALID_ARGUMENT = "22023";
const PG_NOT_FOUND = "P0002";
const PG_NOT_AUTHORIZED = "42501";

/**
 * Maps a sanitized RPC error code to a safe, generic Russian message —
 * never the underlying sanitizeError().message itself, which for these
 * RPCs still names internal details (e.g. "Invalid ticket status
 * transition: X -> Y") that must never reach the browser.
 *
 * `invalidArgumentMessage` lets each caller supply its own wording for
 * SQLSTATE 22023 — a status-transition rejection reads differently from a
 * priority one — and defaults to `fallbackMessage` when the caller has
 * nothing more specific to say. Every other/unrecognized code (including
 * `undefined`, when the thrown value had no `code` at all) falls back to
 * `fallbackMessage` too.
 */
export function mapAdminMutationErrorCode(
  code: string | undefined,
  fallbackMessage: string,
  invalidArgumentMessage: string = fallbackMessage
): string {
  switch (code) {
    case PG_INVALID_ARGUMENT:
      return invalidArgumentMessage;
    case PG_NOT_FOUND:
      return getTicketErrorMessage("adminTicketNotFound");
    case PG_NOT_AUTHORIZED:
      return getTicketErrorMessage("adminNotAuthorized");
    default:
      return fallbackMessage;
  }
}

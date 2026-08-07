import { getTicketErrorMessage } from "@/features/tickets/utils/error-messages";

// SQLSTATE codes the admin_set_ticket_* RPCs deliberately raise — see
// drizzle/0004_comment_and_mutation_rpcs.sql. 22023 (status: invalid
// transition) and 23514 (assignee: not an existing/active profile) are
// each specific to one mutation, handled via `invalidArgumentMessage`/
// `extraCodeMessages` below; P0002/42501 are common to every admin_set_
// ticket_* RPC, so they stay hardcoded here.
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
 * nothing more specific to say. `extraCodeMessages` is an optional,
 * strictly additive escape hatch for a mutation-specific code this
 * function has no built-in case for (e.g. 23514 for the assignee
 * mutation) — checked before the fixed P0002/42501/22023 cases, so a
 * caller can override any of them too if it ever genuinely needs to,
 * though today only 23514 uses it. Every other/unrecognized code
 * (including `undefined`, when the thrown value had no `code` at all)
 * falls back to `fallbackMessage`.
 */
export function mapAdminMutationErrorCode(
  code: string | undefined,
  fallbackMessage: string,
  invalidArgumentMessage: string = fallbackMessage,
  extraCodeMessages?: Record<string, string>
): string {
  if (code !== undefined && extraCodeMessages && code in extraCodeMessages) {
    return extraCodeMessages[code];
  }

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

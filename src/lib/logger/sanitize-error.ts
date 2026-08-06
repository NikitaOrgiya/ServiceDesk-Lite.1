import { AuthRequiredError } from "@neondatabase/postgrest-js";

// Key=value / key: value style secrets — redact the key *and* its value.
const KEY_VALUE_PATTERNS = [
  /access[_-]?token\s*[:=]\s*[^\s,;&]+/gi,
  /refresh[_-]?token\s*[:=]\s*[^\s,;&]+/gi,
  /service[_-]?role[_-]?key\s*[:=]\s*[^\s,;&]+/gi,
  /api[_-]?key\s*[:=]\s*[^\s,;&]+/gi,
  /\bbearer\s+[a-z0-9._-]+/gi,
];

// Bare mentions with no captured value — redact just the word so
// surrounding context (e.g. an adjacent field name) is preserved.
const BARE_WORD_PATTERNS = [
  /access[_-]?token/gi,
  /refresh[_-]?token/gi,
  /service[_-]?role[_-]?key/gi,
  /\bcookie\b/gi,
  /\bpassword\b/gi,
  /\bapi[_-]?key\b/gi,
  /\bauthorization\b/gi,
];

/** Strips any substring that looks like a credential or session artifact. */
function redact(value: string): string {
  const withoutValues = KEY_VALUE_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, "[redacted]"),
    value
  );
  return BARE_WORD_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, "[redacted]"),
    withoutValues
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? redact(value) : undefined;
}

export type SanitizedError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

/**
 * Normalizes any thrown value (PostgREST/Neon Auth error, native Error,
 * string, or unknown) into a plain, log-safe shape. Never returns tokens, cookies,
 * passwords, or the raw original object — safe to hand to a user-facing
 * message or a log sink.
 */
export function sanitizeError(error: unknown): SanitizedError {
  if (isRecord(error)) {
    const message = getString(error, "message") ?? "Unexpected error";
    return {
      message,
      code: getString(error, "code"),
      details: getString(error, "details"),
      hint: getString(error, "hint"),
    };
  }

  if (typeof error === "string") {
    return { message: redact(error) };
  }

  return { message: "Unknown error" };
}

/**
 * `@neondatabase/postgrest-js`'s `fetchWithToken` (see
 * src/lib/neon/data-api.ts) throws this — a real, thrown exception, not
 * the usual `{ data, error }` result shape — whenever the caller's access
 * token can't be resolved for a given request (e.g. `auth.token()` racing
 * a just-issued session cookie, or a genuinely expired/absent session).
 * Every Data API call site must treat it as an expected "no session (yet)"
 * condition rather than an unhandled crash, without swallowing any other,
 * truly unexpected thrown error.
 */
export function isAuthRequiredError(error: unknown): boolean {
  return error instanceof AuthRequiredError;
}

/**
 * `<input type="datetime-local">` has no timezone of its own — its value
 * (`YYYY-MM-DDTHH:mm`) is only ever meaningful relative to whichever clock
 * interprets it. Both functions here call `new Date(...)`/read local-time
 * getters, which resolve against the *calling JS engine's* timezone — so
 * they must only ever be called in the browser (inside a Client
 * Component's effect/event handler), where that engine's timezone is the
 * admin's own. Calling either one during SSR would resolve against the
 * server's timezone instead, silently producing a different wall-clock
 * time than the admin actually sees/intends — see
 * AdminTicketDueAtForm for how the effect boundary is enforced.
 */

/**
 * Converts an absolute ISO instant to a `datetime-local` input value in
 * the calling engine's local time. Returns "" for a missing/unparseable
 * instant — a safe, inert value for the input rather than a thrown error.
 */
export function isoToLocalInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (value: number) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Converts a `datetime-local` input value, interpreted as the calling
 * engine's local time, to an absolute ISO instant (UTC, with a trailing
 * "Z") suitable for adminSetTicketDueAtSchema. Returns null both for an
 * empty value (the explicit "clear the due date" case) and for a
 * malformed one (handled the same safe way — the real validation
 * authority is the server-side Zod schema, which rejects anything that
 * isn't a genuine offset-bearing ISO instant or the empty-string sentinel;
 * this function never throws either way).
 */
export function localInputValueToIso(value: string): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

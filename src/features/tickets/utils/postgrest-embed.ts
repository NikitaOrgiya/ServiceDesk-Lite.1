/**
 * Without a generated Data API response type, the Neon Data API client
 * can't tell a to-one embed (`profiles!some_fkey(...)`) from a to-many one
 * at the type level, so it types every embed as an array defensively. At
 * runtime PostgREST still returns a single object (or null) for these
 * specific embeds, because each is a genuine many-to-one foreign key —
 * this normalizes either shape into the single value it actually is.
 */
export function toSingleEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

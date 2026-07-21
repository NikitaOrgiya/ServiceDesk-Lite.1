import type { UserRole } from "@/features/auth/roles";

// Only these two application sections are ever valid `next` targets, and
// only as a whole path segment ("/admin" or "/admin/...") — not merely as a
// string prefix, so "/administrator" does not slip through.
const VALID_SECTION_PREFIX_PATTERN = /^\/(app|admin)(\/|$)/;

// Backslash and control characters are how classic open-redirect bypasses
// smuggle a host past a naive prefix check (some browsers treat "/\evil"
// as "//evil"); raw whitespace has no legitimate reason to appear in a
// redirect path either.
const FORBIDDEN_CHARACTER_PATTERN = /[\s\\<>"]/;
const CONTROL_CHARACTER_PATTERN = /[\x00-\x1f\x7f]/;

/**
 * Validates a client-supplied `next` redirect target. Returns the path
 * unchanged if it is safe to redirect to, or `null` if it should be
 * ignored.
 *
 * Allow-list based (only `/app` and `/admin`, optionally with a sub-path)
 * rather than deny-list based — enumerating every way to smuggle a scheme
 * or host into a string is exactly the kind of thing that's easy to get
 * subtly wrong.
 */
export function sanitizeNextPath(candidate: string | null | undefined): string | null {
  if (!candidate) {
    return null;
  }

  if (candidate.startsWith("//")) {
    return null; // protocol-relative URL
  }

  if (!candidate.startsWith("/")) {
    return null; // not an absolute internal path (covers scheme URLs too)
  }

  if (CONTROL_CHARACTER_PATTERN.test(candidate) || FORBIDDEN_CHARACTER_PATTERN.test(candidate)) {
    return null;
  }

  if (!VALID_SECTION_PREFIX_PATTERN.test(candidate)) {
    return null;
  }

  return candidate;
}

/** Where a given application role lands by default. */
export function getRoleHomePath(role: UserRole): "/app" | "/admin" {
  return role === "admin" ? "/admin" : "/app";
}

/**
 * Resolves the final redirect target for a signed-in user: a sanitized
 * `next` path if present and compatible with their role, otherwise their
 * role's home page. An employee is never sent into `/admin` and an admin is
 * never sent into `/app`, even if `next` asked for it — each role has its
 * own closed section (see requireEmployee/requireAdmin).
 */
export function resolveRedirectTarget(role: UserRole, candidate?: string | null): string {
  const homePath = getRoleHomePath(role);
  const sanitized = sanitizeNextPath(candidate);

  if (!sanitized) {
    return homePath;
  }

  if (role === "employee" && sanitized.startsWith("/admin")) {
    return homePath;
  }

  if (role === "admin" && sanitized.startsWith("/app")) {
    return homePath;
  }

  return sanitized;
}

/**
 * Keeps enough of an email to be useful in a log line without ever logging
 * it in full — e.g. `jo***n@example.com` for `john@example.com`.
 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) {
    return "***";
  }

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const maskedLocal =
    local.length <= 2 ? "*".repeat(local.length) : `${local[0]}***${local.at(-1)}`;

  return `${maskedLocal}@${domain}`;
}

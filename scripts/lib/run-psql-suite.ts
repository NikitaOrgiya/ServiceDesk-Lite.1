import { spawnSync } from "node:child_process";

/**
 * Runs a single SQL file through `psql`, requiring both a clean exit code
 * AND the file's own final marker (RAISE NOTICE or \echo — psql sends the
 * two to different streams, so both stdout and stderr are checked) to
 * appear in its output. Exit code 0 alone is not proof the file ran: a
 * connection string passed as a bare positional argument makes some psql
 * builds silently discard every flag that follows it, including --file —
 * see scripts/run-sql-tests.ts's git history for the incident this guards
 * against.
 *
 * The connection string is always passed as --dbname's value, never as a
 * positional argument, so it is never dropped by argument-order-sensitive
 * getopt implementations regardless of platform.
 */
export type SuiteResult = { file: string; passed: boolean; reason?: string };

// Defense in depth: psql's own connection-error messages can echo back a
// hostname, and a caller might log a raw spawn error whose .spawnargs
// includes the full argv (connection string included) — redact anything
// URL-shaped before it reaches the console.
export function redact(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted connection string]");
}

export function runPsqlSuite(filePath: string, marker: string, databaseUrl: string): SuiteResult {
  const result = spawnSync(
    "psql",
    ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--file", filePath, "--dbname", databaseUrl],
    { encoding: "utf8", shell: false }
  );

  if (result.error) {
    // Only ever surface .message — the Error object carries .spawnargs
    // (full argv, including --dbname's value) and must never be logged whole.
    return { file: filePath, passed: false, reason: `psql could not be started: ${redact(result.error.message)}` };
  }

  if (result.stdout) process.stdout.write(redact(result.stdout));
  if (result.stderr) process.stderr.write(redact(result.stderr));

  if (result.status !== 0) {
    return { file: filePath, passed: false, reason: `psql exited with code ${result.status}` };
  }

  const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (!combinedOutput.includes(marker)) {
    return { file: filePath, passed: false, reason: "SQL suite did not confirm execution" };
  }

  return { file: filePath, passed: true };
}

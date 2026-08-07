/**
 * Pure/dependency-injected core for scripts/make-admin.ts, kept separate so
 * it can be fully unit-tested (parseArgs, branch validation, the
 * promote/no-op/error decision, and the actual SQL calls via a fake client)
 * without touching a real Neon branch, a real Management API, or stdin —
 * scripts/make-admin.ts itself stays a thin CLI wrapper around this module.
 *
 * Nothing in this file ever accepts or returns the Neon Auth user id,
 * email, DATABASE_MIGRATION_URL, or an API key in a way that ends up in a
 * thrown message: every OperatorError below is a fixed, hand-authored,
 * PII-free string. The one place raw input *could* leak — an unexpected
 * driver/network error thrown by the real `pg`/`fetch`/`ws` client, which
 * can embed a hostname or the interpolated id from a Postgres RAISE
 * EXCEPTION message — is handled by toSafeStageError() below: it discards
 * `.message` entirely for anything that isn't already one of our own
 * OperatorErrors, keeping only the safe SQLSTATE `code` (if any) and a
 * caller-supplied stage tag.
 */

export type Env = "development" | "production";

/**
 * The technical stage a failure happened in — never derived from, and
 * never containing, the original error's message or any operator-supplied
 * value. Exists so an operator can tell "the Management API call failed"
 * apart from "the mutation itself failed" without needing (or risking) any
 * raw error detail.
 */
export type Stage =
  | "branch-validation-failed"
  | "database-connect-failed"
  | "profile-lookup-failed"
  | "confirmation-failed"
  | "promotion-failed"
  | "cleanup-failed";

/** Thrown only for conditions this module authored itself — see file header. */
export class OperatorError extends Error {
  readonly stage?: Stage;

  constructor(message: string, stage?: Stage) {
    super(message);
    this.stage = stage;
  }
}

/**
 * Normalizes any caught error into a safe OperatorError tagged with the
 * given stage. An error that is already one of our own OperatorErrors is
 * returned unchanged — it was authored by this module and is safe (and
 * usually more specific) already; re-tagging it here would only lose
 * information. Anything else (a real pg/ws/fetch driver error) is reduced
 * to a generic message plus its bare SQLSTATE `code` if present — never
 * `.message`, which can embed a hostname (connection errors) or the
 * interpolated user id from a Postgres RAISE EXCEPTION (see
 * private.set_profile_role's "No profiles row for id %").
 */
export function toSafeStageError(stage: Stage, error: unknown): OperatorError {
  if (error instanceof OperatorError) {
    return error;
  }
  const code = (error as { code?: unknown } | null)?.code;
  const codeSuffix = typeof code === "string" && code.length > 0 ? ` (${code})` : "";
  return new OperatorError(`operation failed${codeSuffix}.`, stage);
}

export type ParsedArgs = {
  env: Env;
  userId: string;
  dryRun: boolean;
};

/**
 * Parses argv (already sliced past `node script.js`). Deliberately rejects
 * `--role` and `--email`, even though nothing downstream would honor them,
 * so a typo can never be mistaken for a supported option: this script only
 * ever promotes to 'admin' via private.set_profile_role(), and only ever
 * targets a profile by its Neon Auth user id.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  let env: string | undefined;
  let userId: string | undefined;
  let dryRun = false;

  for (const raw of argv) {
    if (raw === "--dry-run") {
      dryRun = true;
      continue;
    }
    const match = /^--([a-z-]+)=([\s\S]*)$/.exec(raw);
    if (!match) continue;
    const [, key, value] = match;
    if (key === "env") {
      env = value;
    } else if (key === "user-id") {
      userId = value;
    } else if (key === "role") {
      throw new OperatorError(
        "--role is not a supported argument — this script only ever promotes to 'admin' via private.set_profile_role()."
      );
    } else if (key === "email") {
      throw new OperatorError(
        "--email is not supported — pass the Neon Auth user id via --user-id (Neon Console -> Auth -> Users), not an email address."
      );
    }
  }

  if (env !== "development" && env !== "production") {
    throw new OperatorError('--env is required and must be exactly "development" or "production".');
  }
  if (!userId || userId.trim().length === 0) {
    throw new OperatorError("--user-id is required (the Neon Auth user id — not an email address).");
  }

  return { env, userId: userId.trim(), dryRun };
}

/**
 * Every variable this script needs before it opens any connection.
 * DATABASE_MIGRATION_URL is required outright — there is deliberately no
 * fallback to DATABASE_URL (the pooled, RLS-serving runtime connection;
 * using it here would let this operator tool run as whatever role serves
 * ordinary user traffic instead of the trusted migration session
 * private.set_profile_role() requires).
 */
export function checkRequiredEnvVars(env: Record<string, string | undefined>): void {
  const missing: string[] = [];
  if (!env.NEON_API_KEY) missing.push("NEON_API_KEY");
  if (!env.NEON_PROJECT_ID) missing.push("NEON_PROJECT_ID");
  if (!env.NEON_BRANCH_ID) missing.push("NEON_BRANCH_ID");
  if (!env.DATABASE_MIGRATION_URL) missing.push("DATABASE_MIGRATION_URL");

  if (missing.length > 0) {
    throw new OperatorError(`Missing required environment variable(s): ${missing.join(", ")}.`);
  }
}

export type BranchInfo = { name?: string; default: boolean };

/**
 * Fetches only what's needed to validate the target — never logged or
 * returned beyond this shape. `fetchImpl` is injected so tests never hit
 * the real Neon Management API. Network-level failures (DNS, TLS, a
 * rejected promise from `fetch` itself) are not caught here — the caller
 * wraps this call with toSafeStageError("branch-validation-failed", ...).
 */
export async function fetchBranchInfo(
  fetchImpl: typeof fetch,
  apiKey: string,
  projectId: string,
  branchId: string
): Promise<BranchInfo> {
  const res = await fetchImpl(`https://console.neon.tech/api/v2/projects/${projectId}/branches/${branchId}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new OperatorError(
      `Could not verify the target branch via the Neon Management API (HTTP ${res.status}).`,
      "branch-validation-failed"
    );
  }
  const json = (await res.json()) as { branch?: { name?: string; default?: boolean } };
  return { name: json.branch?.name, default: Boolean(json.branch?.default) };
}

/**
 * Same allow-list shape as scripts/invite-user.ts's assertTargetBranch:
 * "development" must be the named, non-default dev branch;  "production"
 * must be the project's default branch — the only non-fragile way to
 * confirm "this really is production" without hardcoding a specific
 * project/branch id (which would silently go stale the day the project is
 * recreated or renamed). NEON_PROJECT_ID/NEON_BRANCH_ID already scope which
 * project/branch is even being asked about, and both are supplied by the
 * operator's own environment, not hardcoded here.
 */
export function assertBranchAllowedForEnv(env: Env, branch: BranchInfo): void {
  if (env === "development") {
    if (branch.default) {
      throw new OperatorError(
        "Refusing to continue: --env=development but the target branch is the default/production branch.",
        "branch-validation-failed"
      );
    }
    if (branch.name !== "servicedesk-lite-dev") {
      throw new OperatorError(
        `Refusing to continue: --env=development requires servicedesk-lite-dev, not "${branch.name}".`,
        "branch-validation-failed"
      );
    }
    return;
  }

  if (!branch.default) {
    throw new OperatorError(
      "Refusing to continue: --env=production requires the default/production branch.",
      "branch-validation-failed"
    );
  }
}

/** The exact phrase the operator must type — see main()'s confirmation prompt. */
export function confirmationPhrase(env: Env): string {
  return env === "production" ? "PROMOTE PRODUCTION ADMIN" : "PROMOTE DEVELOPMENT ADMIN";
}

/** Exact, case-sensitive match only — no trimming beyond surrounding whitespace, no "yes"/"y" shortcuts. */
export function matchesConfirmationPhrase(input: string, env: Env): boolean {
  return input.trim() === confirmationPhrase(env);
}

export type QueryClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

export type ProfileLookup = { exists: boolean; role: string | null };

/**
 * Read-only — safe to call in --dry-run. Never selects id/email, only
 * role. A raw driver error here is not caught — the caller wraps this call
 * with toSafeStageError("profile-lookup-failed", ...).
 */
export async function lookupProfile(client: QueryClient, userId: string): Promise<ProfileLookup> {
  const { rows } = await client.query(`SELECT role FROM public.profiles WHERE id = $1`, [userId]);
  if (rows.length === 0) {
    return { exists: false, role: null };
  }
  return { exists: true, role: (rows[0] as { role: string }).role };
}

export type MutationDecision =
  | { kind: "promote" }
  | { kind: "noop"; reason: "already-admin" }
  | { kind: "error"; reason: "missing-profile" };

/** Pure: what should happen next, given only the current profile state. */
export function decideMutation(lookup: ProfileLookup): MutationDecision {
  if (!lookup.exists) {
    return { kind: "error", reason: "missing-profile" };
  }
  if (lookup.role === "admin") {
    return { kind: "noop", reason: "already-admin" };
  }
  return { kind: "promote" };
}

/**
 * The only mutating call this script ever makes — always parameterized,
 * always this exact trusted-operator RPC (drizzle/0008_admin_bootstrap_
 * hardening.sql). Never reachable via the Data API. A raw driver error
 * here is not caught — performPromotion() wraps this call with
 * toSafeStageError("promotion-failed", ...).
 */
export async function promoteProfileToAdmin(client: QueryClient, userId: string): Promise<void> {
  await client.query(`SELECT * FROM private.set_profile_role($1, 'admin'::public.user_role)`, [userId]);
}

/**
 * Orchestrates the non-dry-run outcome for an already-computed decision:
 * missing profile refuses with a generic error, already-admin is a no-op
 * (private.set_profile_role is never called again), and promote requires
 * `confirm()` to resolve true (from the operator typing the exact phrase)
 * before the one mutating call happens. `confirm` is injected so this is
 * testable without real stdin, and is expected to itself throw an
 * OperatorError tagged "confirmation-failed" for anything other than a
 * clean true/false resolution (scripts/make-admin.ts's promptForPhrase
 * does this) — a plain `false` here is treated as the ordinary
 * wrong-phrase case, not an unexpected failure.
 */
export async function performPromotion(params: {
  client: QueryClient;
  userId: string;
  decision: MutationDecision;
  confirm: () => Promise<boolean>;
}): Promise<"promoted" | "noop"> {
  if (params.decision.kind === "error") {
    throw new OperatorError(
      "Refusing to continue: no matching profile exists yet for this id — the account must sign in at least once (which provisions public.profiles via ensure_profile()) before it can be promoted."
    );
  }
  if (params.decision.kind === "noop") {
    return "noop";
  }

  const confirmed = await params.confirm();
  if (!confirmed) {
    throw new OperatorError("Aborted: confirmation phrase did not match.", "confirmation-failed");
  }

  try {
    await promoteProfileToAdmin(params.client, params.userId);
  } catch (error) {
    throw toSafeStageError("promotion-failed", error);
  }
  return "promoted";
}

/**
 * Closes the database client exactly once, best-effort. Never throws:
 * returns `null` on success or a safe, "cleanup-failed"-tagged
 * OperatorError on failure, so the caller can decide how to react (see
 * scripts/make-admin.ts — a cleanup failure *after* the real operation
 * already succeeded is reported as a non-fatal warning, not a failure of
 * the operation itself).
 */
export async function safeCleanup(client: { end: () => Promise<void> }): Promise<OperatorError | null> {
  try {
    await client.end();
    return null;
  } catch (error) {
    return toSafeStageError("cleanup-failed", error);
  }
}

/**
 * Formats any caught error for stderr. `OperatorError` messages are
 * hand-authored in this module (directly, or via toSafeStageError) and
 * never contain a user id, email, URL, or hostname, so they're safe to
 * print as-is, with their stage tag if one is set. Anything else is
 * reduced to its bare SQLSTATE `code` if present — this branch should be
 * unreachable in practice once every await in scripts/make-admin.ts is
 * wrapped with toSafeStageError, but stays as defense in depth.
 */
export function formatFailureMessage(error: unknown): string {
  if (error instanceof OperatorError) {
    const stageSuffix = error.stage ? ` [${error.stage}]` : "";
    return `make-admin failed${stageSuffix}: ${error.message}`;
  }
  const code = (error as { code?: unknown } | null)?.code;
  const codeSuffix = typeof code === "string" && code.length > 0 ? ` (${code})` : "";
  return `make-admin failed: unexpected error${codeSuffix}.`;
}

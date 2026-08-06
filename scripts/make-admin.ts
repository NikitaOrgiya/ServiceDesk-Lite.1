import "../envConfig";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";
import ws from "ws";
import { Client, neonConfig } from "@neondatabase/serverless";
import {
  parseArgs,
  checkRequiredEnvVars,
  fetchBranchInfo,
  assertBranchAllowedForEnv,
  confirmationPhrase,
  matchesConfirmationPhrase,
  lookupProfile,
  decideMutation,
  performPromotion,
  safeCleanup,
  toSafeStageError,
  formatFailureMessage,
} from "./lib/make-admin-core";

neonConfig.webSocketConstructor = ws;

/**
 * Promotes an existing profile to 'admin' via the trusted
 * private.set_profile_role() function (drizzle/0008_admin_bootstrap_
 * hardening.sql) — never reachable via the Neon Data API, only via this
 * direct DATABASE_MIGRATION_URL session. Supports both the development
 * branch (servicedesk-lite-dev) and the production branch, each gated by
 * --env and its own typed confirmation phrase. See scripts/lib/make-admin-
 * core.ts for the actual (fully unit-tested) argument parsing, branch
 * validation, and decision logic — this file is only wiring.
 *
 * Usage:
 *   npm run db:make-admin -- --env=development --user-id=<neon-auth-user-id> [--dry-run]
 *   npm run db:make-admin -- --env=production  --user-id=<neon-auth-user-id> [--dry-run]
 *
 * The user id is deliberately required as an argument, not looked up by
 * email: this application does not query Neon Auth's internal user table
 * (see docs/migration/supabase-to-neon.md), so the id must come from the
 * Neon Console (Auth -> Users).
 *
 * Operator-only tool. Never prints the profile id, email, DATABASE_
 * MIGRATION_URL, hostname, API key, or SQL parameters — only generic
 * success/failure/dry-run-summary messages, each optionally tagged with a
 * safe stage code (see Stage in scripts/lib/make-admin-core.ts).
 *
 * Windows/runtime lifecycle notes (see the regression this file fixes):
 *  - The readline interface is created and closed exactly once per prompt,
 *    inside a try/finally, so it closes even if reading the answer throws.
 *  - The database client's `.end()` is also called exactly once, via
 *    safeCleanup(), which never throws. On the success path, the
 *    already-computed result is printed *before* cleanup runs, and a
 *    cleanup failure afterward is reported as a non-fatal warning — not as
 *    an overall failure — because a `finally`-block cleanup error would
 *    otherwise silently replace an already-successful outcome (exactly
 *    the "make-admin failed: unexpected error" false negative this fixes:
 *    the mutation had already succeeded server-side every time this was
 *    reported, confirmed by independent read-only diagnostics).
 *  - The entrypoint below sets `process.exitCode` instead of calling
 *    `process.exit()`, so Node exits only once the event loop actually
 *    drains — never forcing an exit while a WebSocket handle from the
 *    Neon serverless driver may still be mid-close. Forcing an immediate
 *    exit at that point is what's believed to trigger the
 *    `UV_HANDLE_CLOSING` assertion previously observed on Windows.
 */
async function promptForPhrase(env: "development" | "production"): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const phrase = confirmationPhrase(env);
    const answer = await rl.question(
      `About to promote a profile to admin on the ${env.toUpperCase()} branch. Type "${phrase}" exactly to continue: `
    );
    return matchesConfirmationPhrase(answer, env);
  } finally {
    rl.close();
  }
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  checkRequiredEnvVars(process.env);

  let branch;
  try {
    branch = await fetchBranchInfo(
      fetch,
      process.env.NEON_API_KEY!,
      process.env.NEON_PROJECT_ID!,
      process.env.NEON_BRANCH_ID!
    );
  } catch (error) {
    throw toSafeStageError("branch-validation-failed", error);
  }
  assertBranchAllowedForEnv(args.env, branch);

  const client = new Client(process.env.DATABASE_MIGRATION_URL!);

  let outcomeMessage: string;
  try {
    try {
      await client.connect();
    } catch (error) {
      throw toSafeStageError("database-connect-failed", error);
    }

    let lookup;
    try {
      lookup = await lookupProfile(client, args.userId);
    } catch (error) {
      throw toSafeStageError("profile-lookup-failed", error);
    }
    const decision = decideMutation(lookup);

    if (args.dryRun) {
      outcomeMessage = [
        `Target branch: OK for --env=${args.env}.`,
        `Profile: ${lookup.exists ? "exists" : "missing"}.`,
        `Current role: ${lookup.exists ? lookup.role : "n/a"}.`,
        `Mutation would be: ${decision.kind === "promote" ? "required" : "not required"}.`,
      ].join("\n");
    } else {
      const result = await performPromotion({
        client,
        userId: args.userId,
        decision,
        confirm: async () => {
          try {
            return await promptForPhrase(args.env);
          } catch (error) {
            throw toSafeStageError("confirmation-failed", error);
          }
        },
      });
      outcomeMessage = result === "promoted" ? "Profile promoted to admin." : "Profile is already admin — no changes made.";
    }
  } catch (error) {
    // Something in the try block above failed before producing a result —
    // best-effort cleanup, then propagate the original (already safe)
    // error. A cleanup problem here is secondary noise next to a real
    // failure, so it is not itself surfaced.
    await safeCleanup(client);
    throw error;
  }

  // Success: the outcome is real and already happened server-side, so it
  // is printed before cleanup runs — a cleanup hiccup after this point
  // must never make a successful promotion (or dry-run report) look like
  // a failure.
  console.log(outcomeMessage);
  const cleanupError = await safeCleanup(client);
  if (cleanupError) {
    console.error(
      `Warning: ${formatFailureMessage(cleanupError)} The operation above already completed successfully; this is only a connection cleanup issue.`
    );
  }
}

// Runs main() only when this file is executed directly (`tsx scripts/make-
// admin.ts` / `npm run db:make-admin`), not when scripts/make-admin.test.ts
// imports it — pathToFileURL handles platform-specific URL encoding
// (spaces, backslashes, the Windows drive-letter prefix) correctly, unlike
// a hand-built `file://` string comparison.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(() => {
      process.exitCode = 0;
    })
    .catch((error) => {
      console.error(formatFailureMessage(error));
      process.exitCode = 1;
    });
}

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
 * success/failure/dry-run-summary messages.
 */
async function promptForPhrase(env: "development" | "production"): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const phrase = confirmationPhrase(env);
  const answer = await rl.question(
    `About to promote a profile to admin on the ${env.toUpperCase()} branch. Type "${phrase}" exactly to continue: `
  );
  rl.close();
  return matchesConfirmationPhrase(answer, env);
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  checkRequiredEnvVars(process.env);

  const branch = await fetchBranchInfo(
    fetch,
    process.env.NEON_API_KEY!,
    process.env.NEON_PROJECT_ID!,
    process.env.NEON_BRANCH_ID!
  );
  assertBranchAllowedForEnv(args.env, branch);

  const client = new Client(process.env.DATABASE_MIGRATION_URL!);
  await client.connect();

  try {
    const lookup = await lookupProfile(client, args.userId);
    const decision = decideMutation(lookup);

    if (args.dryRun) {
      console.log(`Target branch: OK for --env=${args.env}.`);
      console.log(`Profile: ${lookup.exists ? "exists" : "missing"}.`);
      console.log(`Current role: ${lookup.exists ? lookup.role : "n/a"}.`);
      console.log(`Mutation would be: ${decision.kind === "promote" ? "required" : "not required"}.`);
      return;
    }

    const result = await performPromotion({
      client,
      userId: args.userId,
      decision,
      confirm: () => promptForPhrase(args.env),
    });

    console.log(result === "promoted" ? "Profile promoted to admin." : "Profile is already admin — no changes made.");
  } finally {
    await client.end();
  }
}

// Runs main() only when this file is executed directly (`tsx scripts/make-
// admin.ts` / `npm run db:make-admin`), not when scripts/make-admin.test.ts
// imports it — pathToFileURL handles platform-specific URL encoding
// (spaces, backslashes, the Windows drive-letter prefix) correctly, unlike
// a hand-built `file://` string comparison.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(formatFailureMessage(error));
    process.exit(1);
  });
}

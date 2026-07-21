import "../envConfig";
import readline from "node:readline/promises";
import ws from "ws";
import { Client, neonConfig } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = ws;

/**
 * Promotes an existing profile to 'admin' via the trusted
 * private.set_profile_role() function (drizzle/0008_admin_bootstrap_
 * hardening.sql) — never reachable via the Neon Data API, only via this
 * direct DATABASE_MIGRATION_URL session.
 *
 * Usage:
 *   npx tsx scripts/make-admin.ts <neon-auth-user-id>
 *
 * The user id is deliberately required as an argument, not looked up by
 * email: this application does not query Neon Auth's internal user table
 * (see docs/migration/supabase-to-neon.md), so the id must come from the
 * Neon Console (Auth -> Users).
 *
 * Operator-only tool: requires explicit confirmation (typed "yes"),
 * verifies via the Neon Management API that NEON_PROJECT_ID/NEON_BRANCH_ID
 * resolve to the servicedesk-lite-dev branch (never default/production)
 * before writing anything, and never prints the profile id, email, or any
 * other identifying value — only a generic success/failure message.
 */
async function confirm(message: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${message} Type "yes" to continue: `);
  rl.close();
  if (answer.trim().toLowerCase() !== "yes") {
    throw new Error("Aborted: confirmation not given.");
  }
}

async function assertTargetBranch(): Promise<void> {
  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  const branchId = process.env.NEON_BRANCH_ID;

  if (!apiKey || !projectId || !branchId) {
    throw new Error("Set NEON_API_KEY, NEON_PROJECT_ID, and NEON_BRANCH_ID before running this script.");
  }

  const res = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}/branches/${branchId}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Could not verify the target branch via the Neon Management API (HTTP ${res.status}).`);
  }
  const json = await res.json();
  if (json.branch?.default) {
    throw new Error("Refusing to continue: target branch is the default/production branch.");
  }
  if (json.branch?.name !== "servicedesk-lite-dev") {
    throw new Error("Refusing to continue: target branch is not servicedesk-lite-dev.");
  }
}

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    throw new Error("Usage: npx tsx scripts/make-admin.ts <neon-auth-user-id>");
  }

  const databaseUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Set DATABASE_MIGRATION_URL before running this script.");
  }

  await assertTargetBranch();
  await confirm("Target branch confirmed as servicedesk-lite-dev. About to promote the given profile id to admin.");

  const client = new Client(databaseUrl);
  await client.connect();

  try {
    const { rows } = await client.query(
      `SELECT * FROM private.set_profile_role($1, 'admin'::public.user_role)`,
      [userId]
    );
    console.log(rows.length > 0 ? "Profile promoted to admin." : "No matching profile was updated.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("make-admin failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

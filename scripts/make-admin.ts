import "dotenv/config";
import readline from "node:readline/promises";
import ws from "ws";
import { Client, neonConfig } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = ws;

/**
 * Promotes an existing profile to 'admin' via the trusted
 * private.set_profile_role() function (drizzle/0008_admin_bootstrap_
 * hardening.sql) — never reachable via the Neon Data API, only via this
 * direct DATABASE_URL session.
 *
 * Usage:
 *   npx tsx scripts/make-admin.ts <neon-auth-user-id>
 *
 * The user id is deliberately required as an argument, not looked up by
 * email: this application does not query Neon Auth's internal user table
 * (see docs/migration/supabase-to-neon.md), so the id must come from the
 * Neon Console (Auth -> Users) or from the printed output of
 * scripts/create-demo-users.ts.
 *
 * Requires explicit confirmation (typed "yes") before writing to whatever
 * database DATABASE_URL points at.
 */
async function confirm(message: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${message} Type "yes" to continue: `);
  rl.close();
  if (answer.trim().toLowerCase() !== "yes") {
    throw new Error("Aborted: confirmation not given.");
  }
}

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    throw new Error("Usage: npx tsx scripts/make-admin.ts <neon-auth-user-id>");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Set DATABASE_URL before running this script.");
  }

  await confirm(`About to promote profile id "${userId}" to admin.`);

  const client = new Client(databaseUrl);
  await client.connect();

  try {
    const { rows } = await client.query(
      `SELECT * FROM private.set_profile_role($1, 'admin'::public.user_role)`,
      [userId]
    );
    console.log(`Promoted profile ${rows[0]?.id} (${rows[0]?.full_name}) to admin.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("make-admin failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

import "../envConfig";
import readline from "node:readline/promises";
import ws from "ws";
import { Client, neonConfig } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = ws;

/**
 * Operator-only tool: creates one row in private.user_invitations (see
 * drizzle/0011_invite_only_profile_provisioning.sql) — the closed
 * allow-list public.ensure_profile() checks before letting a Neon Auth
 * account provision a public.profiles row. Never reachable via the Data
 * API; only ever run against DATABASE_MIGRATION_URL by a trusted operator.
 *
 * Usage:
 *   npx tsx scripts/invite-user.ts --env=development --email=<email> --name="<full name>" [--department="<dept>"]
 *   npx tsx scripts/invite-user.ts --env=production  --email=<email> --name="<full name>" [--department="<dept>"]
 *
 * --env is required and gates which branch this is allowed to run
 * against: "development" refuses to run against servicedesk-lite-dev's
 * default/production branch; "production" refuses to run against
 * anything else. There is deliberately no --role flag — every invitation
 * this script creates has intended_role = 'employee'. Promoting an
 * existing profile to admin remains a separate, manual step
 * (scripts/make-admin.ts, private.set_profile_role()) — this script can
 * never grant admin.
 *
 * Never prints the connection string, hostname, password, or the
 * resulting Auth/profile id (there is none yet at invite time) — only a
 * generic success/failure message.
 */
type Args = { env?: string; email?: string; name?: string; department?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (const raw of argv) {
    const match = /^--([a-z]+)=([\s\S]*)$/.exec(raw);
    if (!match) continue;
    const [, key, value] = match;
    if (key === "env" || key === "email" || key === "name" || key === "department") {
      args[key] = value;
    }
  }
  return args;
}

async function confirm(message: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${message} Type "yes" to continue: `);
  rl.close();
  if (answer.trim().toLowerCase() !== "yes") {
    throw new Error("Aborted: confirmation not given.");
  }
}

async function assertTargetBranch(env: "development" | "production"): Promise<void> {
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
  const isDefault = Boolean(json.branch?.default);
  const branchName = json.branch?.name;

  if (env === "development") {
    if (isDefault) {
      throw new Error("Refusing to continue: --env=development but the target branch is default/production.");
    }
    if (branchName !== "servicedesk-lite-dev") {
      throw new Error(`Refusing to continue: --env=development requires servicedesk-lite-dev, not "${branchName}".`);
    }
  } else {
    if (!isDefault) {
      throw new Error("Refusing to continue: --env=production requires the default/production branch.");
    }
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.env !== "development" && args.env !== "production") {
    throw new Error('Usage: --env=development|production --email=<email> --name="<full name>" [--department="<dept>"]');
  }
  if (!args.email || !isValidEmail(args.email)) {
    throw new Error("A valid --email is required.");
  }
  if (!args.name || args.name.trim().length === 0) {
    throw new Error("--name is required.");
  }

  const env = args.env;
  const email = args.email.trim().toLowerCase();
  const fullName = args.name.trim();
  const department = args.department?.trim() || null;

  const databaseUrl = process.env.DATABASE_MIGRATION_URL;
  if (!databaseUrl) {
    throw new Error("Set DATABASE_MIGRATION_URL before running this script.");
  }

  await assertTargetBranch(env);
  await confirm(
    `Target branch confirmed for --env=${env}. About to create an 'employee' invitation ` +
      `(intended_role is always employee — this script cannot grant admin).`
  );

  const client = new Client(databaseUrl);
  await client.connect();

  try {
    await client.query(
      `INSERT INTO private.user_invitations (email, full_name, department, intended_role)
       VALUES ($1, $2, $3, 'employee')`,
      [email, fullName, department]
    );
    console.log("Invitation created.");
  } catch (error) {
    const pgError = error as { code?: string };
    if (pgError.code === "23505") {
      console.log("An invitation for this email already exists — no changes made.");
      return;
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("invite-user failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

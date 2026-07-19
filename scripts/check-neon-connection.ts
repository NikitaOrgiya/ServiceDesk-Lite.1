import "dotenv/config";
import ws from "ws";
import { Client, neonConfig } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = ws;

/**
 * Server-only connectivity check. Prints the Postgres version and current
 * database, and warns (without printing secrets) whether
 * NEON_PROJECT_ID/NEON_BRANCH_ID are set, so an operator can cross-check
 * the Neon Console before running scripts/migrate.ts or scripts/
 * create-demo-users.ts against a connection they did not expect.
 *
 * This script does not call the Neon Management API — verifying that
 * DATABASE_URL actually points at the NEON_PROJECT_ID/NEON_BRANCH_ID an
 * operator believes it does is a manual cross-check against the Neon
 * Console, not something this script asserts automatically.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Set DATABASE_URL before running this check.");
  }

  const client = new Client(databaseUrl);
  await client.connect();

  try {
    const { rows } = await client.query("SELECT version(), current_database()");
    console.log("Connected.");
    console.log(`  Server:   ${rows[0].version}`);
    console.log(`  Database: ${rows[0].current_database}`);
  } finally {
    await client.end();
  }

  if (!process.env.NEON_PROJECT_ID || !process.env.NEON_BRANCH_ID) {
    console.warn(
      "NEON_PROJECT_ID/NEON_BRANCH_ID are not set — cross-check the Neon Console " +
        "manually to confirm DATABASE_URL points at the intended project/branch " +
        "before running migrate/create-demo-users against it."
    );
  } else {
    console.log(
      `Expected project ${process.env.NEON_PROJECT_ID}, branch ${process.env.NEON_BRANCH_ID} ` +
        "— verify this against the Neon Console; this script does not call the Neon " +
        "Management API to confirm it automatically."
    );
  }
}

main().catch((error) => {
  console.error("Connection check failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

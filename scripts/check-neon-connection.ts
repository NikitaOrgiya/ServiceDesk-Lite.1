import "../envConfig";
import ws from "ws";
import { Client, neonConfig } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = ws;

/**
 * Server-only connectivity check. Runs only read-only queries
 * (SELECT version(), current_database()) and never prints
 * NEON_PROJECT_ID, NEON_BRANCH_ID, hostnames, connection strings, or any
 * part of a URL — only pass/fail facts safe to paste anywhere.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("Database connection: failed");
    throw new Error("Set DATABASE_URL before running this check.");
  }

  const client = new Client(databaseUrl);

  try {
    await client.connect();
    const { rows } = await client.query("SELECT version(), current_database()");
    console.log("Database connection: successful");
    console.log(`Database: ${rows[0].current_database ? "confirmed" : "unknown"}`);

    const majorVersion = /PostgreSQL (\d+)/.exec(rows[0].version)?.[1] ?? "unknown";
    console.log(`PostgreSQL version: ${majorVersion}`);
  } catch (error) {
    console.log("Database connection: failed");
    throw error;
  } finally {
    await client.end();
  }

  console.log(`Expected project configured: ${process.env.NEON_PROJECT_ID ? "yes" : "no"}`);
  console.log(`Expected branch configured: ${process.env.NEON_BRANCH_ID ? "yes" : "no"}`);
}

main().catch((error) => {
  console.error("Connection check failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

import "../envConfig";
import path from "node:path";
import { runPsqlSuite } from "./lib/run-psql-suite";

/**
 * Live-Neon-safe structural/security audit: privilege introspection only
 * (has_table_privilege / has_function_privilege / has_schema_privilege /
 * pg_policies), no JWT simulation, no `SET LOCAL request.jwt.claims`. This
 * is the only neon/tests/*.sql suite that is meaningful to run directly
 * against servicedesk-lite-dev — see functional_checks.sql and
 * admin_bootstrap_checks.sql, which require the stub auth schema and are
 * covered by `npm run test:db:local` instead.
 */
function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Set DATABASE_URL before running test:db:security.");
  }

  const filePath = path.join(process.cwd(), "neon", "tests", "security_assertions.sql");
  console.log("\n--- security_assertions.sql (live Neon) ---");
  const result = runPsqlSuite(filePath, "All security assertions passed.", databaseUrl);

  if (!result.passed) {
    console.error(`FAILED: security_assertions.sql (${result.reason})`);
    process.exit(1);
  }

  console.log("\ntest:db:security passed.");
}

main();

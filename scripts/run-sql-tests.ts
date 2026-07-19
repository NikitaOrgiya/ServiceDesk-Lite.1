import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * Runs the neon/tests/*.sql suites via `psql` (each file wraps itself in
 * BEGIN/ROLLBACK, so nothing here is ever committed). Requires `psql` on
 * PATH and DATABASE_URL pointed at a disposable/local database — never a
 * production branch, since these tests create roles/schemas if absent
 * (see neon/tests/_stub_auth_schema.sql) and run as whatever role
 * DATABASE_URL connects as.
 */
const TEST_FILES = [
  "security_assertions.sql",
  "functional_checks.sql",
  "admin_bootstrap_checks.sql",
];

function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Set DATABASE_URL (a disposable/local database) before running test:db.");
  }

  const testsDir = path.join(process.cwd(), "neon", "tests");
  let failed = false;

  for (const file of TEST_FILES) {
    console.log(`\n--- ${file} ---`);
    const result = spawnSync(
      "psql",
      [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", path.join(testsDir, file)],
      { stdio: "inherit" }
    );

    if (result.status !== 0) {
      failed = true;
      console.error(`FAILED: ${file}`);
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log("\nAll SQL test suites passed.");
}

main();

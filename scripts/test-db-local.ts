import "../envConfig";
import path from "node:path";
import { runPsqlSuite } from "./lib/run-psql-suite";

/**
 * functional_checks.sql and admin_bootstrap_checks.sql simulate a caller's
 * JWT with `SET LOCAL request.jwt.claims = ...` against the stub
 * `auth.user_id()` installed by neon/tests/_stub_auth_schema.sql. Real
 * Neon rejects a bare session setting that GUC directly (its own Data API
 * JWT machinery owns it) — confirmed live against servicedesk-lite-dev,
 * where both suites fail with "cannot set parameter ... within
 * security-definer function". These two suites are therefore only
 * meaningful against a disposable local/native PostgreSQL instance, never
 * against a real Neon branch. See scripts/test-db-security.ts for the one
 * suite (privilege introspection only) that IS meaningful live, and
 * scripts/e2e-neon-auth.ts for real Neon Auth/Data API coverage of the
 * functional/admin-bootstrap behavior these two suites can't verify here.
 *
 * Requires LOCAL_TEST_DATABASE_URL (never DATABASE_URL/DATABASE_MIGRATION_URL,
 * which point at Neon) and refuses to run against anything that looks like
 * a Neon hostname, even if misconfigured into that variable.
 */
const TEST_FILES = [
  { file: "functional_checks.sql", marker: "All functional checks passed." },
  { file: "admin_bootstrap_checks.sql", marker: "All admin bootstrap checks passed." },
];

function main() {
  const databaseUrl = process.env.LOCAL_TEST_DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      "test:db:local is only for a disposable local/native PostgreSQL instance with the " +
        "stub auth schema (neon/tests/_stub_auth_schema.sql) — it cannot run against Neon. " +
        "Set LOCAL_TEST_DATABASE_URL to a local Postgres connection string to run it."
    );
    process.exit(1);
  }

  let hostname: string | null = null;
  try {
    hostname = new URL(databaseUrl).hostname;
  } catch {
    // ignore — will fail the neon.tech check below with hostname === null
  }
  if (!hostname || /neon\.tech$/i.test(hostname)) {
    console.error(
      "FAILED: LOCAL_TEST_DATABASE_URL looks like it points at Neon — refusing to run. " +
        "test:db:local must target a disposable local/native PostgreSQL instance."
    );
    process.exit(1);
  }

  const testsDir = path.join(process.cwd(), "neon", "tests");
  let failed = false;

  for (const { file, marker } of TEST_FILES) {
    console.log(`\n--- ${file} (local PostgreSQL, stub auth schema) ---`);
    const result = runPsqlSuite(path.join(testsDir, file), marker, databaseUrl);
    if (!result.passed) {
      console.error(`FAILED: ${file} (${result.reason})`);
      failed = true;
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log("\ntest:db:local passed.");
}

main();

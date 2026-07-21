import "../envConfig";

/**
 * Reports which Neon-related env vars are present without ever printing
 * their values. Does not connect to Neon or read any other file content.
 */
const REQUIRED_VARS = [
  "NEON_AUTH_BASE_URL",
  "NEON_AUTH_COOKIE_SECRET",
  "NEON_DATA_API_URL",
  "DATABASE_URL",
  "DATABASE_MIGRATION_URL",
  "NEON_API_KEY",
  "NEON_PROJECT_ID",
  "NEON_BRANCH_ID",
] as const;

function main() {
  let missing = 0;
  for (const name of REQUIRED_VARS) {
    const status = process.env[name] ? "configured" : "missing";
    if (status === "missing") missing += 1;
    console.log(`${name}: ${status}`);
  }
  if (missing > 0) {
    process.exitCode = 1;
  }
}

main();

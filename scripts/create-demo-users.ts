import "dotenv/config";
import readline from "node:readline/promises";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import ws from "ws";
import { Client, neonConfig } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = ws;

/**
 * Server-only, idempotent provisioning of two demo accounts (Employee
 * Demo, Admin Demo) for manual/E2E testing. Not an HTTP route, never
 * bundled into the browser, never accepts a role from the caller — the
 * Admin Demo account is promoted via the same trusted mechanism as
 * scripts/make-admin.ts (private.set_profile_role), not by asking the
 * Neon Auth signup call for an admin role.
 *
 * Requires explicit confirmation (typed "yes") before writing to whatever
 * database DATABASE_URL/NEON_AUTH_BASE_URL point at — run
 * scripts/check-neon-connection.ts first to confirm that is the intended
 * project/branch.
 *
 * Reads credentials only from environment variables
 * (DEMO_EMPLOYEE_EMAIL/DEMO_EMPLOYEE_PASSWORD/DEMO_ADMIN_EMAIL/
 * DEMO_ADMIN_PASSWORD) — never hardcoded, never logged.
 */
async function confirm(message: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${message} Type "yes" to continue: `);
  rl.close();
  if (answer.trim().toLowerCase() !== "yes") {
    throw new Error("Aborted: confirmation not given.");
  }
}

type DemoAccount = {
  label: string;
  emailEnvVar: string;
  passwordEnvVar: string;
  displayName: string;
  role: "employee" | "admin";
};

const ACCOUNTS: DemoAccount[] = [
  {
    label: "Employee Demo",
    emailEnvVar: "DEMO_EMPLOYEE_EMAIL",
    passwordEnvVar: "DEMO_EMPLOYEE_PASSWORD",
    displayName: "Employee Demo",
    role: "employee",
  },
  {
    label: "Admin Demo",
    emailEnvVar: "DEMO_ADMIN_EMAIL",
    passwordEnvVar: "DEMO_ADMIN_PASSWORD",
    displayName: "Admin Demo",
    role: "admin",
  },
];

async function main() {
  const neonAuthBaseUrl = process.env.NEON_AUTH_BASE_URL;
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;
  const databaseUrl = process.env.DATABASE_URL;

  if (!neonAuthBaseUrl || !cookieSecret) {
    throw new Error("Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET before running this script.");
  }
  if (!databaseUrl) {
    throw new Error("Set DATABASE_URL before running this script.");
  }

  const missingCredentials = ACCOUNTS.filter(
    (account) => !process.env[account.emailEnvVar] || !process.env[account.passwordEnvVar]
  );
  if (missingCredentials.length > 0) {
    throw new Error(
      `Missing environment variables for: ${missingCredentials.map((a) => a.label).join(", ")}`
    );
  }

  await confirm(
    `About to create/ensure ${ACCOUNTS.map((a) => a.label).join(" and ")} against ` +
      `NEON_AUTH_BASE_URL=${neonAuthBaseUrl}.`
  );

  const auth = createNeonAuth({ baseUrl: neonAuthBaseUrl, cookies: { secret: cookieSecret } });
  const db = new Client(databaseUrl);
  await db.connect();

  try {
    for (const account of ACCOUNTS) {
      const email = process.env[account.emailEnvVar]!;
      const password = process.env[account.passwordEnvVar]!;

      const { data, error } = await auth.signUp.email({
        email,
        password,
        name: account.displayName,
      });

      // A repeat run is expected to hit "already exists" — that is not a
      // failure, this script is idempotent by design.
      const userId = data?.user?.id;
      if (error && !userId) {
        console.warn(`${account.label}: sign-up did not return a user id (${error.message}).`);
        continue;
      }

      if (userId) {
        await db.query(
          `INSERT INTO public.profiles (id, full_name, role)
           VALUES ($1, $2, 'employee')
           ON CONFLICT (id) DO NOTHING`,
          [userId, account.displayName]
        );

        if (account.role === "admin") {
          await db.query(
            `SELECT private.set_profile_role($1, 'admin'::public.user_role)`,
            [userId]
          );
        }

        console.log(`${account.label}: ready.`);
      }
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error("create-demo-users failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

import "../envConfig";
import ws from "ws";
import { Client, neonConfig } from "@neondatabase/serverless";
import { NeonPostgrestClient, fetchWithToken } from "@neondatabase/postgrest-js";

neonConfig.webSocketConstructor = ws;

/**
 * Live Neon Auth + Data API end-to-end test. Unlike neon/tests/functional_
 * checks.sql / admin_bootstrap_checks.sql (which simulate a caller's JWT
 * with `SET LOCAL request.jwt.claims` against a stub — see
 * scripts/test-db-local.ts), this suite performs a genuine Better Auth
 * sign-up/sign-in against NEON_AUTH_BASE_URL, mints a real JWT via the
 * `/token` endpoint, and drives every table/RPC call through the Neon Data
 * API with `Authorization: Bearer <real JWT>` — exactly the request shape
 * a real browser session produces.
 *
 * Also covers invite-only provisioning (drizzle/0011_invite_only_profile_
 * provisioning.sql): a signed-up account with no invitation must be
 * refused by ensure_profile(); Employee A/B/Admin are provisioned only
 * after a matching private.user_invitations row exists, created here via
 * the trusted DATABASE_MIGRATION_URL session (never through the Data API).
 *
 * Never prints: emails, passwords, JWTs (any segment), cookies, Auth user
 * ids (sub), connection strings, hostnames, or full HTTP response bodies.
 * Auth user ids are used internally (needed to call
 * private.set_profile_role) but never logged.
 */

type Account = {
  label: "Employee A" | "Employee B" | "Admin";
  emailEnvVar: string;
  passwordEnvVar: string;
  displayName: string;
};

const ACCOUNTS: Account[] = [
  { label: "Employee A", emailEnvVar: "E2E_EMPLOYEE_A_EMAIL", passwordEnvVar: "E2E_EMPLOYEE_A_PASSWORD", displayName: "E2E Employee A" },
  { label: "Employee B", emailEnvVar: "E2E_EMPLOYEE_B_EMAIL", passwordEnvVar: "E2E_EMPLOYEE_B_PASSWORD", displayName: "E2E Employee B" },
  { label: "Admin", emailEnvVar: "E2E_ADMIN_EMAIL", passwordEnvVar: "E2E_ADMIN_PASSWORD", displayName: "E2E Admin" },
];

// Deliberately never invited, ever — proves ensure_profile() refuses a
// signed-up-but-uninvited account. Derived from Employee A's own email via
// Gmail-style "+tag" addressing (no new secret needed); a fixed local
// constant password is fine since this account can never gain any access
// regardless of its credentials being unexciting.
const UNINVITED_PASSWORD = "E2euninvited-Probe-1";
const INVITE_REUSE_TEST_EMAIL_SUFFIX = "+e2e-invite-reuse-test";
const UNINVITED_EMAIL_SUFFIX = "+e2e-uninvited";

// Dedicated identity for proving the *invited* path end to end. Unlike
// Employee A/B/Admin (which already had profiles before invite-only
// provisioning existed, so their ensure_profile() calls just hit the
// idempotent "already provisioned" branch and prove nothing new), this
// account's profile+invitation are deliberately deleted at the end of
// every run — so every run re-proves the entire invite → sign-up →
// ensure_profile → employee → invitation-consumed chain from a genuinely
// clean starting state. The Neon Auth account itself is kept (never
// deleted) and reused, matching the "don't delete Auth accounts" rule.
const INVITED_NEW_PASSWORD = "E2einvitedNew-Probe-1";
const INVITED_NEW_EMAIL_SUFFIX = "+e2e-invited-new";

function deriveTaggedEmail(baseEmail: string, suffix: string): string {
  const [local, domain] = baseEmail.split("@");
  const baseLocal = local.split("+")[0];
  return `${baseLocal}${suffix}@${domain}`;
}

type Session = { jwt: string; sub: string };

let failures = 0;
function check(condition: boolean, description: string) {
  if (condition) {
    console.log(`PASS: ${description}`);
  } else {
    console.error(`FAIL: ${description}`);
    failures += 1;
  }
}

function decodeJwtSub(jwt: string): string | null {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadJson = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(payloadJson) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}

function extractCookieHeader(res: Response): string | null {
  const cookies =
    typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie") as string]
        : [];
  if (cookies.length === 0) return null;
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

// Better Auth's CSRF protection requires either a matching Origin header
// or an absolute callbackURL on every state-changing request — a real
// browser sends Origin automatically, so a headless script must supply it
// explicitly. This is normal protocol behavior, not a Neon-specific
// restriction and not something being bypassed.
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin) throw new Error("NEXT_PUBLIC_SITE_URL must be set (used as the Origin header for Neon Auth calls).");
  return { "Content-Type": "application/json", Origin: origin, ...extra };
}

async function signUpOrSignIn(baseUrl: string, email: string, password: string, name: string): Promise<string> {
  const signUpRes = await fetch(`${baseUrl}/sign-up/email`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, password, name }),
  });
  let cookie = extractCookieHeader(signUpRes);
  await signUpRes.json().catch(() => null);

  if (!cookie) {
    // Already exists (or sign-up otherwise didn't establish a session) — sign in instead.
    const signInRes = await fetch(`${baseUrl}/sign-in/email`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email, password }),
    });
    await signInRes.json().catch(() => null);
    if (!signInRes.ok) {
      throw new Error(`sign-in failed with HTTP ${signInRes.status}`);
    }
    cookie = extractCookieHeader(signInRes);
  }

  if (!cookie) {
    throw new Error("no session cookie returned by sign-up or sign-in");
  }
  return cookie;
}

async function getJwt(baseUrl: string, cookie: string): Promise<string> {
  const res = await fetch(`${baseUrl}/token`, {
    method: "GET",
    headers: authHeaders({ Cookie: cookie }),
  });
  const json = (await res.json().catch(() => null)) as { token?: string; data?: { token?: string } } | null;
  const token = json?.token ?? json?.data?.token;
  if (!res.ok || !token) {
    throw new Error(`/token did not return a JWT (HTTP ${res.status})`);
  }
  return token;
}

async function establishSession(baseUrl: string, email: string, password: string, displayName: string, label: string): Promise<Session> {
  const cookie = await signUpOrSignIn(baseUrl, email, password, displayName);
  const jwt = await getJwt(baseUrl, cookie);
  const sub = decodeJwtSub(jwt);

  console.log(`${label}: signed in successfully`);
  console.log(`${label}: JWT sub present: ${sub ? "yes" : "no"}`);
  if (!sub) throw new Error(`${label}: JWT has no usable sub claim`);

  return { jwt, sub };
}

async function establishSessionForAccount(baseUrl: string, account: Account): Promise<Session> {
  const email = process.env[account.emailEnvVar];
  const password = process.env[account.passwordEnvVar];
  if (!email || !password) {
    throw new Error(`Missing ${account.emailEnvVar}/${account.passwordEnvVar}`);
  }
  return establishSession(baseUrl, email, password, account.displayName, account.label);
}

async function authAccountExists(migrationClient: Client, sub: string): Promise<boolean> {
  const res = await migrationClient.query(`SELECT 1 FROM neon_auth."user" WHERE id::text = $1`, [sub]);
  return (res.rowCount ?? 0) > 0;
}

function dataApiClientFor(dataApiUrl: string, jwt: string | null) {
  return new NeonPostgrestClient({
    dataApiUrl,
    options: jwt ? { global: { fetch: fetchWithToken(async () => jwt) } } : {},
  });
}

async function main() {
  const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
  const dataApiUrl = process.env.NEON_DATA_API_URL;
  const migrationUrl = process.env.DATABASE_MIGRATION_URL;
  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  const branchId = process.env.NEON_BRANCH_ID;

  if (!authBaseUrl || !dataApiUrl || !migrationUrl || !apiKey || !projectId || !branchId) {
    throw new Error("Missing one or more required env vars (Neon Auth/Data API/migration URL/API key/project/branch).");
  }

  // --- Target confirmation: must be servicedesk-lite-dev, never default/production. ---
  const branchRes = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}/branches/${branchId}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!branchRes.ok) throw new Error(`Could not verify target branch (HTTP ${branchRes.status})`);
  const branchJson = await branchRes.json();
  check(branchJson.branch.name === "servicedesk-lite-dev", "target branch is servicedesk-lite-dev");
  check(!branchJson.branch.default, "target branch is not default/production");
  if (branchJson.branch.default || branchJson.branch.name !== "servicedesk-lite-dev") {
    throw new Error("Refusing to continue: target branch confirmation failed.");
  }

  // --- Anonymous access (no Authorization at all). ---
  const anonClient = dataApiClientFor(dataApiUrl, null);
  const anonTickets = await anonClient.from("tickets").select("id");
  check(!!anonTickets.error || (anonTickets.data?.length ?? 0) === 0, "anonymous SELECT on tickets returns no data");
  const anonRpc = await anonClient.rpc("create_ticket", {
    p_title: "anon probe title",
    p_description: "anon probe description long enough",
    p_category: "other",
  });
  check(!!anonRpc.error, "anonymous create_ticket RPC is denied");

  // --- Establish real sessions for all three provisioned accounts, plus a
  // throwaway account that will never receive an invitation. ---
  const sessions = new Map<Account["label"], Session>();
  for (const account of ACCOUNTS) {
    sessions.set(account.label, await establishSessionForAccount(authBaseUrl, account));
  }
  const empA = sessions.get("Employee A")!;
  const empB = sessions.get("Employee B")!;
  const adminSession = sessions.get("Admin")!;

  const empAEmail = process.env.E2E_EMPLOYEE_A_EMAIL!;
  const uninvitedEmail = deriveTaggedEmail(empAEmail, UNINVITED_EMAIL_SUFFIX);
  const uninvitedSession = await establishSession(authBaseUrl, uninvitedEmail, UNINVITED_PASSWORD, "E2E Uninvited Probe", "Uninvited");

  const migrationClient = new Client(migrationUrl);
  await migrationClient.connect();

  try {
    // --- Invite-only gate: an account with no invitation must be refused. ---
    check(await authAccountExists(migrationClient, uninvitedSession.sub), "Uninvited: Auth account really exists (neon_auth.user)");
    const uninvitedInvitation = await migrationClient.query(
      `SELECT 1 FROM private.user_invitations WHERE email = lower((SELECT email FROM neon_auth."user" WHERE id::text = $1))`,
      [uninvitedSession.sub]
    );
    check((uninvitedInvitation.rowCount ?? 0) === 0, "Uninvited: no invitation row exists for this account's email");

    const uninvitedProfileBefore = await migrationClient.query(`SELECT 1 FROM public.profiles WHERE id = $1`, [uninvitedSession.sub]);
    if (uninvitedProfileBefore.rowCount) {
      console.log("Uninvited: profile already exists from a previous run — invite-gate checks skipped (informational)");
    } else {
      const uninvitedClient = dataApiClientFor(dataApiUrl, uninvitedSession.jwt);
      const uninvitedSelect = await uninvitedClient.from("tickets").select("id");
      check(!uninvitedSelect.error && (uninvitedSelect.data?.length ?? 0) === 0, "Uninvited: SELECT on tickets returns no business data");
      const uninvitedCreate = await uninvitedClient.rpc("create_ticket", {
        p_title: "uninvited probe title",
        p_description: "uninvited probe description long enough",
        p_category: "other",
      });
      check(!!uninvitedCreate.error, "Uninvited: create_ticket RPC is denied");

      const uninvitedEnsure = await uninvitedClient.rpc("ensure_profile");
      check(!!uninvitedEnsure.error, "Uninvited: ensure_profile() returns generic access denied (no invitation)");
      const uninvitedErrorMessage = String(uninvitedEnsure.error?.message ?? "");
      check(
        !uninvitedErrorMessage.toLowerCase().includes(uninvitedEmail.toLowerCase()),
        "Uninvited: error message does not echo back the account's email"
      );

      const uninvitedProfileAfter = await migrationClient.query(`SELECT 1 FROM public.profiles WHERE id = $1`, [uninvitedSession.sub]);
      check(uninvitedProfileAfter.rowCount === 0, "Uninvited: no profile row was created");
    }

    // --- Create invitations for Employee A/B/Admin via the trusted
    // operator session (mirrors scripts/invite-user.ts) — idempotent, safe
    // to repeat across runs. Intended_role is 'employee' even for the
    // account destined to become Admin: ensure_profile() never grants
    // admin, regardless of intended_role. ---
    for (const account of ACCOUNTS) {
      const email = process.env[account.emailEnvVar]!.toLowerCase();
      await migrationClient.query(
        `INSERT INTO private.user_invitations (email, full_name, intended_role)
         VALUES ($1, $2, 'employee')
         ON CONFLICT (email) DO NOTHING`,
        [email, account.displayName]
      );
    }
    console.log("PASS: invitations created (or already present) for Employee A/B/Admin");

    // --- Full invited-new-user proof, on a dedicated identity whose
    // profile+invitation are deleted at the end of every run. Employee A/B/
    // Admin cannot be used for this: they already had profiles before
    // invite-only provisioning existed, so their ensure_profile() calls
    // only ever hit the idempotent "already provisioned" branch and prove
    // nothing about the invite-gated path itself. ---
    const invitedNewEmail = deriveTaggedEmail(empAEmail, INVITED_NEW_EMAIL_SUFFIX);

    // Start from a guaranteed-clean state (cleanup at the end of the
    // previous run should already have done this; repeated here in case a
    // prior run crashed before reaching cleanup).
    await migrationClient.query(
      `DELETE FROM public.profiles WHERE id = (SELECT id::text FROM neon_auth."user" WHERE lower(email) = $1)`,
      [invitedNewEmail]
    );
    await migrationClient.query(`DELETE FROM private.user_invitations WHERE email = $1`, [invitedNewEmail]);

    // Invitation exists BEFORE sign-up/first ensure_profile() call.
    await migrationClient.query(
      `INSERT INTO private.user_invitations (email, full_name, intended_role) VALUES ($1, 'E2E Invited New Employee', 'employee')`,
      [invitedNewEmail]
    );
    const invitationBeforeConsumption = await migrationClient.query(
      `SELECT is_used FROM private.user_invitations WHERE email = $1`,
      [invitedNewEmail]
    );
    check(invitationBeforeConsumption.rows[0]?.is_used === false, "Invited new employee: invitation exists and is unused before sign-up");

    const invitedNewSession = await establishSession(authBaseUrl, invitedNewEmail, INVITED_NEW_PASSWORD, "E2E Invited New Employee", "Invited New Employee");
    check(await authAccountExists(migrationClient, invitedNewSession.sub), "Invited new employee: Auth account really exists (neon_auth.user)");

    const profileBeforeFirstEnsure = await migrationClient.query(`SELECT 1 FROM public.profiles WHERE id = $1`, [invitedNewSession.sub]);
    check((profileBeforeFirstEnsure.rowCount ?? 0) === 0, "Invited new employee: profile absent before first ensure_profile()");

    const invitedNewClient = dataApiClientFor(dataApiUrl, invitedNewSession.jwt);
    const firstEnsure = await invitedNewClient.rpc("ensure_profile");
    check(!firstEnsure.error, "Invited new employee: first ensure_profile() call succeeds");

    const roleAfterFirstEnsure = await migrationClient.query(`SELECT role FROM public.profiles WHERE id = $1`, [invitedNewSession.sub]);
    check(roleAfterFirstEnsure.rows[0]?.role === "employee", "Invited new employee: profile created with role employee");

    const invitationAfterConsumption = await migrationClient.query(
      `SELECT is_used FROM private.user_invitations WHERE email = $1`,
      [invitedNewEmail]
    );
    check(invitationAfterConsumption.rows[0]?.is_used === true, "Invited new employee: invitation is marked is_used=true after consumption");

    const secondEnsure = await invitedNewClient.rpc("ensure_profile");
    check(!secondEnsure.error, "Invited new employee: second ensure_profile() call is idempotent (no error)");
    const profileCountAfterSecondEnsure = await migrationClient.query(`SELECT count(*)::int c FROM public.profiles WHERE id = $1`, [invitedNewSession.sub]);
    check(profileCountAfterSecondEnsure.rows[0].c === 1, "Invited new employee: still exactly one profile row (idempotent, no duplicate)");

    // Cleanup this dedicated identity's profile+invitation now, so the
    // next run starts clean again. The Neon Auth account itself is kept.
    await migrationClient.query(`DELETE FROM public.profiles WHERE id = $1`, [invitedNewSession.sub]);
    await migrationClient.query(`DELETE FROM private.user_invitations WHERE email = $1`, [invitedNewEmail]);
    const invitedNewCleanupCheck = await migrationClient.query(`SELECT 1 FROM public.profiles WHERE id = $1`, [invitedNewSession.sub]);
    check((invitedNewCleanupCheck.rowCount ?? 0) === 0, "Invited new employee: profile+invitation cleaned up for next run");

    // --- No-profile checks (only meaningful the first time each account is provisioned). ---
    for (const [label, session] of sessions) {
      const existing = await migrationClient.query(`SELECT 1 FROM public.profiles WHERE id = $1`, [session.sub]);
      if (existing.rowCount) {
        console.log(`${label}: profile already provisioned by a previous run — no-profile checks skipped (informational)`);
        continue;
      }
      const client = dataApiClientFor(dataApiUrl, session.jwt);
      const noProfileSelect = await client.from("tickets").select("id");
      check(!noProfileSelect.error && (noProfileSelect.data?.length ?? 0) === 0, `${label}: no-profile SELECT on tickets returns no business data`);
      const noProfileCreate = await client.rpc("create_ticket", {
        p_title: "no-profile probe title",
        p_description: "no-profile probe description long enough",
        p_category: "other",
      });
      check(!!noProfileCreate.error, `${label}: no-profile create_ticket RPC is denied`);
    }

    // --- ensure_profile() for all three, via the Data API — succeeds now
    // that a matching invitation exists (never a direct INSERT). ---
    for (const [label, session] of sessions) {
      const client = dataApiClientFor(dataApiUrl, session.jwt);
      const { error } = await client.rpc("ensure_profile");
      check(!error, `${label}: ensure_profile() succeeded (invitation matched)`);
    }

    // Employee A/B are never promoted, so their role must always read back
    // as 'employee'. Admin is deliberately excluded from this specific
    // assertion: across repeat runs, Admin's profile already exists from a
    // prior run's private.set_profile_role() promotion, and
    // ensure_profile()'s idempotent branch correctly returns that existing
    // row as-is (role 'admin') rather than resetting it — the rigorous
    // "a brand-new profile is always created as employee, never admin,
    // regardless of intended_role" guarantee is proven separately above,
    // on the dedicated Invited New Employee identity that starts from a
    // genuinely clean state every run.
    for (const label of ["Employee A", "Employee B"] as const) {
      const session = sessions.get(label)!;
      const { rows } = await migrationClient.query(`SELECT role FROM public.profiles WHERE id = $1`, [session.sub]);
      check(rows[0]?.role === "employee", `${label}: role is 'employee' immediately after ensure_profile (no auto-admin)`);
    }

    // --- Invitation single-use atomicity, tested directly at the SQL
    // level (no second real Neon Auth account needed): the same atomic
    // UPDATE ensure_profile() uses can only ever claim a given invitation
    // once. ---
    const reuseTestEmail = deriveTaggedEmail(empAEmail, INVITE_REUSE_TEST_EMAIL_SUFFIX);
    await migrationClient.query(`DELETE FROM private.user_invitations WHERE email = $1`, [reuseTestEmail]);
    await migrationClient.query(
      `INSERT INTO private.user_invitations (email, full_name, intended_role) VALUES ($1, 'Invite Reuse Test', 'employee')`,
      [reuseTestEmail]
    );
    const firstClaim = await migrationClient.query(
      `UPDATE private.user_invitations SET is_used = TRUE, used_at = now() WHERE email = $1 AND is_used = FALSE`,
      [reuseTestEmail]
    );
    check(firstClaim.rowCount === 1, "invitation: first claim succeeds (1 row)");
    const secondClaim = await migrationClient.query(
      `UPDATE private.user_invitations SET is_used = TRUE, used_at = now() WHERE email = $1 AND is_used = FALSE`,
      [reuseTestEmail]
    );
    check(secondClaim.rowCount === 0, "invitation: second claim on the same email affects 0 rows (cannot be reused)");
    await migrationClient.query(`DELETE FROM private.user_invitations WHERE email = $1`, [reuseTestEmail]);

    // --- Promote Admin ONLY via the trusted operator path (private.set_profile_role, DATABASE_MIGRATION_URL). ---
    await migrationClient.query(`SELECT private.set_profile_role($1, 'admin'::public.user_role)`, [adminSession.sub]);
    const { rows: adminRoleRows } = await migrationClient.query(`SELECT role FROM public.profiles WHERE id = $1`, [adminSession.sub]);
    check(adminRoleRows[0]?.role === "admin", "Admin: promoted to admin via private.set_profile_role (operator path)");

    const { rows: empARoleRows } = await migrationClient.query(`SELECT role FROM public.profiles WHERE id = $1`, [empA.sub]);
    const { rows: empBRoleRows } = await migrationClient.query(`SELECT role FROM public.profiles WHERE id = $1`, [empB.sub]);
    check(empARoleRows[0]?.role === "employee", "Employee A: still 'employee' (not promoted)");
    check(empBRoleRows[0]?.role === "employee", "Employee B: still 'employee' (not promoted)");

    // === Security checks on private.user_invitations ===
    const invAnonSelect = await migrationClient.query(`SELECT has_table_privilege('anonymous', 'private.user_invitations', 'SELECT') ok`);
    check(!invAnonSelect.rows[0].ok, "anonymous has no SELECT on private.user_invitations");
    const invAuthSelect = await migrationClient.query(`SELECT has_table_privilege('authenticated', 'private.user_invitations', 'SELECT') ok`);
    check(!invAuthSelect.rows[0].ok, "authenticated has no SELECT on private.user_invitations");
    const invAnonUsage = await migrationClient.query(`SELECT has_schema_privilege('anonymous', 'private', 'USAGE') ok`);
    check(!invAnonUsage.rows[0].ok, "anonymous has no USAGE on schema private");
    const invAuthUsage = await migrationClient.query(`SELECT has_schema_privilege('authenticated', 'private', 'USAGE') ok`);
    check(!invAuthUsage.rows[0].ok, "authenticated has no USAGE on schema private");
    const ensureProfilePublicExec = await migrationClient.query(
      `SELECT has_function_privilege('public', p.oid, 'EXECUTE') ok FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'ensure_profile'`
    );
    check(!ensureProfilePublicExec.rows[0]?.ok, "PUBLIC has no EXECUTE on ensure_profile()");

    // === Employee A workflow ===
    const empAClient = dataApiClientFor(dataApiUrl, empA.jwt);
    const createRes = await empAClient.rpc("create_ticket", {
      p_title: "E2E: Employee A ticket",
      p_description: "Created by the live Neon Auth + Data API E2E runner.",
      p_category: "other",
    });
    check(!createRes.error, "Employee A: create_ticket RPC succeeded");
    const ticketRow = Array.isArray(createRes.data) ? createRes.data[0] : createRes.data;
    const ticketId: string | undefined = ticketRow?.id;
    const publicNumber: string | undefined = ticketRow?.public_number;
    check(!!ticketId, "Employee A: create_ticket returned an id");
    check(!!publicNumber && /^SD-\d{4}-\d{4,}$/.test(publicNumber), "Employee A: public_number matches the expected format");

    const empAOwnTicket = await empAClient.from("tickets").select("id, status, priority, assignee_id, due_at").eq("id", ticketId ?? "");
    check((empAOwnTicket.data?.length ?? 0) === 1, "Employee A: sees own ticket via SELECT");

    const commentRes = await empAClient.rpc("add_ticket_comment", { p_ticket_id: ticketId, p_message: "E2E: first comment" });
    check(!commentRes.error, "Employee A: add_ticket_comment succeeded");

    const empAComments = await empAClient.from("ticket_comments").select("id").eq("ticket_id", ticketId ?? "");
    check((empAComments.data?.length ?? 0) >= 1, "Employee A: sees own comment(s)");
    const empAHistory = await empAClient.from("ticket_history").select("id").eq("ticket_id", ticketId ?? "");
    check((empAHistory.data?.length ?? 0) >= 1, "Employee A: sees own ticket history");

    const empADirectInsert = await empAClient.from("tickets").insert({
      public_number: "SD-0000-0000",
      author_id: empA.sub,
      title: "direct insert probe",
      description: "should be rejected by GRANT",
      category: "other",
    } as never);
    check(!!empADirectInsert.error, "Employee A: direct INSERT on tickets is denied");

    const empADirectUpdate = await empAClient.from("tickets").update({ priority: "high" } as never).eq("id", ticketId ?? "");
    check(!!empADirectUpdate.error, "Employee A: direct UPDATE on tickets is denied");

    const empADirectDelete = await empAClient.from("tickets").delete().eq("id", ticketId ?? "");
    check(!!empADirectDelete.error, "Employee A: direct DELETE on tickets is denied");

    const empAAdminRpc = await empAClient.rpc("admin_set_ticket_status", { p_ticket_id: ticketId, p_status: "accepted" });
    check(!!empAAdminRpc.error, "Employee A: admin_set_ticket_status RPC is denied");

    // === Employee B isolation ===
    const empBClient = dataApiClientFor(dataApiUrl, empB.jwt);
    const empBSeesTicket = await empBClient.from("tickets").select("id").eq("id", ticketId ?? "");
    check((empBSeesTicket.data?.length ?? 0) === 0, "Employee B: does not see Employee A's ticket");

    const empBSeesProfile = await empBClient.from("profiles").select("id").eq("id", empA.sub);
    check((empBSeesProfile.data?.length ?? 0) === 0, "Employee B: does not see Employee A's profile");

    const empBComment = await empBClient.rpc("add_ticket_comment", { p_ticket_id: ticketId, p_message: "should be denied" });
    check(!!empBComment.error, "Employee B: cannot comment on Employee A's ticket");

    const empBCancel = await empBClient.rpc("cancel_own_ticket", { p_ticket_id: ticketId });
    check(!!empBCancel.error, "Employee B: cannot cancel Employee A's ticket");

    const empBAdminRpc = await empBClient.rpc("admin_set_ticket_priority", { p_ticket_id: ticketId, p_priority: "critical" });
    check(!!empBAdminRpc.error, "Employee B: admin_set_ticket_priority RPC is denied");

    // === Admin workflow ===
    const adminClient = dataApiClientFor(dataApiUrl, adminSession.jwt);
    const adminOwnProfile = await adminClient.from("profiles").select("role").eq("id", adminSession.sub);
    check(adminOwnProfile.data?.[0]?.role === "admin", "Admin: profile.role is really 'admin' via Data API");

    const adminSeesTicket = await adminClient.from("tickets").select("id").eq("id", ticketId ?? "");
    check((adminSeesTicket.data?.length ?? 0) === 1, "Admin: sees Employee A's ticket");

    const statusRes = await adminClient.rpc("admin_set_ticket_status", { p_ticket_id: ticketId, p_status: "accepted" });
    check(!statusRes.error, "Admin: admin_set_ticket_status succeeded");
    const priorityRes = await adminClient.rpc("admin_set_ticket_priority", { p_ticket_id: ticketId, p_priority: "critical" });
    check(!priorityRes.error, "Admin: admin_set_ticket_priority succeeded");
    const assigneeRes = await adminClient.rpc("admin_set_ticket_assignee", { p_ticket_id: ticketId, p_assignee_id: adminSession.sub });
    check(!assigneeRes.error, "Admin: admin_set_ticket_assignee succeeded");
    const dueAtRes = await adminClient.rpc("admin_set_ticket_due_at", { p_ticket_id: ticketId, p_due_at: new Date(Date.now() + 86400000).toISOString() });
    check(!dueAtRes.error, "Admin: admin_set_ticket_due_at succeeded");

    const historyAfterAdmin = await adminClient.from("ticket_history").select("field_name").eq("ticket_id", ticketId ?? "");
    const changedFields = new Set((historyAfterAdmin.data ?? []).map((r: { field_name?: string }) => r.field_name));
    check(changedFields.has("status"), "ticket_history reflects the status change");
    check(changedFields.has("priority"), "ticket_history reflects the priority change");
    check(changedFields.has("assignee_id"), "ticket_history reflects the assignee change");
    check(changedFields.has("due_at"), "ticket_history reflects the due_at change");

    const adminDirectInsert = await adminClient.from("tickets").insert({
      public_number: "SD-0000-0001",
      author_id: adminSession.sub,
      title: "admin direct insert probe",
      description: "should be rejected by GRANT even for admin",
      category: "other",
    } as never);
    check(!!adminDirectInsert.error, "Admin: direct INSERT on tickets is denied (writes must go through RPCs)");
    const adminDirectUpdate = await adminClient.from("tickets").update({ priority: "low" } as never).eq("id", ticketId ?? "");
    check(!!adminDirectUpdate.error, "Admin: direct UPDATE on tickets is denied");
    const adminDirectDelete = await adminClient.from("tickets").delete().eq("id", ticketId ?? "");
    check(!!adminDirectDelete.error, "Admin: direct DELETE on tickets is denied");

    // === Employee A sees admin's changes, still no admin powers ===
    const empASeesUpdated = await empAClient.from("tickets").select("status, priority").eq("id", ticketId ?? "");
    check(
      empASeesUpdated.data?.[0]?.status === "accepted" && empASeesUpdated.data?.[0]?.priority === "critical",
      "Employee A: sees the admin-updated ticket state"
    );
    const empAAdminRetry = await empAClient.rpc("admin_set_ticket_status", { p_ticket_id: ticketId, p_status: "resolved" });
    check(!!empAAdminRetry.error, "Employee A: still cannot call admin RPCs after admin's changes");

    // === Role escalation protection via Data API (all roles) ===
    for (const [label, client] of [
      ["Employee A", empAClient],
      ["Employee B", empBClient],
      ["Admin", adminClient],
    ] as const) {
      const sub = label === "Employee A" ? empA.sub : label === "Employee B" ? empB.sub : adminSession.sub;
      const attempt = await client.from("profiles").update({ role: "admin" } as never).eq("id", sub);
      check(!!attempt.error, `${label}: cannot self-escalate role via direct Data API UPDATE`);
    }

    // === Cleanup: remove only this run's business data; keep the reusable dev Auth accounts/profiles. ===
    if (ticketId) {
      await migrationClient.query(`DELETE FROM public.tickets WHERE id = $1`, [ticketId]);
      const remaining = await migrationClient.query(`SELECT 1 FROM public.tickets WHERE id = $1`, [ticketId]);
      check(remaining.rowCount === 0, "cleanup: this run's ticket (and cascaded comments/history) removed");
    }
  } finally {
    await migrationClient.end();
  }

  console.log(`\n${failures === 0 ? "All E2E checks passed." : `${failures} E2E check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error("E2E run failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

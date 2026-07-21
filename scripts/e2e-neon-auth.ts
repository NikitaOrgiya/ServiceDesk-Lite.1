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

async function establishSession(baseUrl: string, account: Account): Promise<Session> {
  const email = process.env[account.emailEnvVar];
  const password = process.env[account.passwordEnvVar];
  if (!email || !password) {
    throw new Error(`Missing ${account.emailEnvVar}/${account.passwordEnvVar}`);
  }

  const cookie = await signUpOrSignIn(baseUrl, email, password, account.displayName);
  const jwt = await getJwt(baseUrl, cookie);
  const sub = decodeJwtSub(jwt);

  console.log(`${account.label}: signed in successfully`);
  console.log(`${account.label}: JWT sub present: ${sub ? "yes" : "no"}`);
  if (!sub) throw new Error(`${account.label}: JWT has no usable sub claim`);

  return { jwt, sub };
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

  // --- Establish real sessions for all three accounts. ---
  const sessions = new Map<Account["label"], Session>();
  for (const account of ACCOUNTS) {
    sessions.set(account.label, await establishSession(authBaseUrl, account));
  }
  const empA = sessions.get("Employee A")!;
  const empB = sessions.get("Employee B")!;
  const adminSession = sessions.get("Admin")!;

  const migrationClient = new Client(migrationUrl);
  await migrationClient.connect();

  try {
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

    // --- ensure_profile() for all three, via the Data API (never a direct INSERT). ---
    for (const [label, session] of sessions) {
      const client = dataApiClientFor(dataApiUrl, session.jwt);
      const { error } = await client.rpc("ensure_profile", { p_full_name: `${label} (E2E)` });
      check(!error, `${label}: ensure_profile() succeeded`);
    }

    for (const [label, session] of sessions) {
      const { rows } = await migrationClient.query(`SELECT role FROM public.profiles WHERE id = $1`, [session.sub]);
      check(rows[0]?.role === "employee", `${label}: role is 'employee' immediately after ensure_profile (no auto-admin)`);
    }

    // --- Promote Admin ONLY via the trusted operator path (private.set_profile_role, DATABASE_MIGRATION_URL). ---
    await migrationClient.query(`SELECT private.set_profile_role($1, 'admin'::public.user_role)`, [adminSession.sub]);
    const { rows: adminRoleRows } = await migrationClient.query(`SELECT role FROM public.profiles WHERE id = $1`, [adminSession.sub]);
    check(adminRoleRows[0]?.role === "admin", "Admin: promoted to admin via private.set_profile_role (operator path)");

    const { rows: empARoleRows } = await migrationClient.query(`SELECT role FROM public.profiles WHERE id = $1`, [empA.sub]);
    const { rows: empBRoleRows } = await migrationClient.query(`SELECT role FROM public.profiles WHERE id = $1`, [empB.sub]);
    check(empARoleRows[0]?.role === "employee", "Employee A: still 'employee' (not promoted)");
    check(empBRoleRows[0]?.role === "employee", "Employee B: still 'employee' (not promoted)");

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

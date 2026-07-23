import { expect, test } from "@playwright/test";

/**
 * Real Neon Auth E2E — requires a genuine Neon development branch with
 * Neon Auth/Data API enabled, plus two real test accounts (an employee and
 * an admin). Never run against production. Credentials come only from the
 * local environment or GitHub Secrets — see README.md — and are never
 * hardcoded here.
 *
 * If any of the four required env vars is missing, every test below
 * reports as SKIPPED (not passed, not failed) with a clear reason — see
 * the report this session produced for exactly which case applies.
 *
 * Why this suite is the actual regression guard for the post-login
 * provisioning bug (session created, invitation never consumed, no
 * profile, /unauthorized): `login()` below drives a *real browser*
 * through the login form, so the assertions after it only pass once the
 * browser has actually followed every server redirect (including the
 * `/auth/complete` hop — see src/features/auth/actions/login.ts and
 * src/app/auth/complete/route.ts) and resent its cookies — unlike
 * scripts/e2e-neon-auth.ts, which talks to Neon Auth's raw HTTP API
 * directly and mints its own JWT via a separate `/token` fetch, so it can
 * never model the "same response, cookie not yet resent" race at all.
 * Whether that hop happened is deliberately *not* asserted via
 * `page.waitForURL`/`page.waitForResponse` on `/auth/complete` itself: live
 * validation of the fix (real browser, both `next dev` and a production
 * `next build && next start`) showed both of those client-side signals to
 * be unreliable for this specific redirect chain in this Next.js version —
 * the request happens and the correct destination content renders
 * (confirmed via server logs and DOM content every time), but the
 * browser's own `location.href`/history can stay parked on
 * `/auth/complete`, and a `waitForResponse` listener for it can simply
 * never fire, even though the hop demonstrably occurred. The reliable
 * signal — and the one that actually matters for this regression class —
 * is destination content: if provisioning silently fails the way the
 * original bug did, these assertions fail/time out because the user lands
 * on `/unauthorized` instead of their dashboard, not because of a URL
 * string mismatch.
 */
const EMPLOYEE_EMAIL = process.env.E2E_EMPLOYEE_EMAIL;
const EMPLOYEE_PASSWORD = process.env.E2E_EMPLOYEE_PASSWORD;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

const HAS_CREDENTIALS = Boolean(EMPLOYEE_EMAIL && EMPLOYEE_PASSWORD && ADMIN_EMAIL && ADMIN_PASSWORD);

test.describe("real Neon Auth", () => {
  test.skip(
    !HAS_CREDENTIALS,
    "E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD / E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are not all set — " +
      "these tests require a real Neon development branch (Neon Auth + Data API enabled) and real test " +
      "accounts, see README.md."
  );

  async function login(page: import("@playwright/test").Page, email: string, password: string) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Пароль").fill(password);
    await page.getByRole("button", { name: "Войти" }).click();
  }

  test("employee login redirects to /app", async ({ page }) => {
    await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
    await expect(page.getByRole("heading", { name: "Обзор заявок" })).toBeVisible();
  });

  test("employee session survives a page refresh", async ({ page }) => {
    await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
    await expect(page.getByRole("heading", { name: "Обзор заявок" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Обзор заявок" })).toBeVisible();
  });

  test("employee cannot open /admin", async ({ page }) => {
    await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
    await expect(page.getByRole("heading", { name: "Обзор заявок" })).toBeVisible();
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Доступ запрещён" })).toBeVisible();
  });

  test("employee logout returns to /login and protects /app again", async ({ page }) => {
    await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
    await expect(page.getByRole("heading", { name: "Обзор заявок" })).toBeVisible();
    await page.getByRole("button", { name: "Выйти" }).click();
    await page.waitForURL(/\/login$/);
    await page.goto("/app");
    await page.waitForURL(/\/login/);
  });

  test("admin login redirects to /admin", async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await expect(page.getByRole("heading", { name: "Обзор службы поддержки" })).toBeVisible();
  });

  test("admin session survives a page refresh", async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await expect(page.getByRole("heading", { name: "Обзор службы поддержки" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Обзор службы поддержки" })).toBeVisible();
  });

  test("admin can open the ticket registry", async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await expect(page.getByRole("heading", { name: "Обзор службы поддержки" })).toBeVisible();
    await page.goto("/admin/tickets");
    await expect(page.getByRole("heading", { name: "Реестр заявок" })).toBeVisible();
  });

  test("admin logout returns to /login and protects /admin again", async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await expect(page.getByRole("heading", { name: "Обзор службы поддержки" })).toBeVisible();
    await page.getByRole("button", { name: "Выйти" }).click();
    await page.waitForURL(/\/login$/);
    await page.goto("/admin");
    await page.waitForURL(/\/login/);
  });

  test("an incorrect password shows a neutral error, not an internal one", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(EMPLOYEE_EMAIL!);
    await page.getByLabel("Пароль").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByText("Не удалось войти. Проверьте email и пароль.")).toBeVisible();
  });
});

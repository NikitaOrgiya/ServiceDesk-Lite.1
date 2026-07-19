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
    await page.waitForURL(/\/app$/);
    await expect(page.getByRole("heading", { name: "Обзор заявок" })).toBeVisible();
  });

  test("employee session survives a page refresh", async ({ page }) => {
    await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
    await page.waitForURL(/\/app$/);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Обзор заявок" })).toBeVisible();
  });

  test("employee cannot open /admin", async ({ page }) => {
    await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
    await page.waitForURL(/\/app$/);
    await page.goto("/admin");
    await page.waitForURL(/\/unauthorized/);
  });

  test("employee logout returns to /login and protects /app again", async ({ page }) => {
    await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
    await page.waitForURL(/\/app$/);
    await page.getByRole("button", { name: "Выйти" }).click();
    await page.waitForURL(/\/login$/);
    await page.goto("/app");
    await page.waitForURL(/\/login/);
  });

  test("admin login redirects to /admin", async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.waitForURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Обзор службы поддержки" })).toBeVisible();
  });

  test("admin session survives a page refresh", async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.waitForURL(/\/admin$/);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Обзор службы поддержки" })).toBeVisible();
  });

  test("admin can open the ticket registry", async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.waitForURL(/\/admin$/);
    await page.goto("/admin/tickets");
    await expect(page.getByRole("heading", { name: "Реестр заявок" })).toBeVisible();
  });

  test("admin logout returns to /login and protects /admin again", async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.waitForURL(/\/admin$/);
    await page.getByRole("button", { name: "Выйти" }).click();
    await page.waitForURL(/\/login$/);
    await page.goto("/admin");
    await page.waitForURL(/\/login/);
  });

  test("an incorrect password shows a neutral error, not an internal one", async ({ page }) => {
    await login(page, EMPLOYEE_EMAIL!, "definitely-the-wrong-password");
    await expect(page.getByText("Не удалось войти. Проверьте email и пароль.")).toBeVisible();
  });
});

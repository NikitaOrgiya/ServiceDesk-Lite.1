import { expect, test } from "@playwright/test";

/**
 * Regression coverage for the intermittent concurrent-login provisioning
 * race (see src/features/auth/server/ensure-profile.ts's bounded retry):
 * two isolated browser contexts signing in at nearly the same instant can,
 * without the retry, occasionally hit a narrow window where
 * `ensure_profile()`'s own `auth.user_id()` lookup resolves NULL for an
 * otherwise-authenticated request, surfacing to the user as a redirect to
 * `/unauthorized`.
 *
 * Requires the same real Neon development branch and real test accounts as
 * e2e/auth.spec.ts. Never run against production. If the required env vars
 * are missing, every test below reports as SKIPPED, not passed/failed.
 */
const EMPLOYEE_EMAIL = process.env.E2E_EMPLOYEE_A_EMAIL;
const EMPLOYEE_PASSWORD = process.env.E2E_EMPLOYEE_A_PASSWORD;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

const HAS_CREDENTIALS = Boolean(EMPLOYEE_EMAIL && EMPLOYEE_PASSWORD && ADMIN_EMAIL && ADMIN_PASSWORD);

test.describe("concurrent login (real Neon Auth)", () => {
  test.skip(
    !HAS_CREDENTIALS,
    "E2E_EMPLOYEE_A_EMAIL / E2E_EMPLOYEE_A_PASSWORD / E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are not all set — " +
      "these tests require a real Neon development branch (Neon Auth + Data API enabled) and real test " +
      "accounts, see README.md."
  );

  async function login(page: import("@playwright/test").Page, email: string, password: string) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Пароль").fill(password);
    await page.getByRole("button", { name: "Войти" }).click();
  }

  test("simultaneous employee and admin sign-in both reach their own dashboard, never /unauthorized", async ({
    browser,
  }) => {
    const employeeContext = await browser.newContext();
    const adminContext = await browser.newContext();
    const employeePage = await employeeContext.newPage();
    const adminPage = await adminContext.newPage();

    await Promise.all([
      login(employeePage, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!),
      login(adminPage, ADMIN_EMAIL!, ADMIN_PASSWORD!),
    ]);

    await expect(employeePage.getByRole("heading", { name: "Обзор заявок" })).toBeVisible();
    await expect(adminPage.getByRole("heading", { name: "Обзор службы поддержки" })).toBeVisible();

    const employeeUrl = new URL(employeePage.url());
    const adminUrl = new URL(adminPage.url());
    expect(employeeUrl.pathname).toBe("/app");
    expect(adminUrl.pathname).toBe("/admin");
    expect(employeeUrl.pathname).not.toBe("/unauthorized");
    expect(adminUrl.pathname).not.toBe("/unauthorized");
    expect(employeeUrl.pathname).not.toMatch(/^\/(login|auth\/complete)$/);
    expect(adminUrl.pathname).not.toMatch(/^\/(login|auth\/complete)$/);

    const employeeBody = await employeePage.textContent("body");
    const adminBody = await adminPage.textContent("body");
    expect(employeeBody).not.toMatch(/AuthRequiredError/i);
    expect(adminBody).not.toMatch(/AuthRequiredError/i);
    expect(employeeBody).not.toMatch(/unexpected/i);
    expect(adminBody).not.toMatch(/unexpected/i);

    await Promise.all([
      employeePage.getByRole("button", { name: "Выйти" }).click(),
      adminPage.getByRole("button", { name: "Выйти" }).click(),
    ]);
    await employeePage.waitForURL(/\/login$/);
    await adminPage.waitForURL(/\/login$/);
    expect(new URL(employeePage.url()).pathname).toBe("/login");
    expect(new URL(adminPage.url()).pathname).toBe("/login");

    await employeePage.goto("/app");
    await employeePage.waitForURL(/\/login/);
    await adminPage.goto("/admin");
    await adminPage.waitForURL(/\/login/);

    await employeeContext.close();
    await adminContext.close();
  });
});

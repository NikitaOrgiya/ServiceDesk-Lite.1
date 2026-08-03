import { expect, test } from "@playwright/test";

/**
 * Regression coverage for the Preview smoke-test bug this session fixes:
 * src/proxy.ts used to route every request under /app/** and /admin/**
 * (including Server Action POSTs dispatched via startTransition() by
 * components like NewTicketForm) through Neon Auth's own
 * `auth.middleware()`. That middleware's upstream session round trip was
 * observed to intermittently 307-redirect a valid, cookie-bearing Server
 * Action POST to /login even though the identical session succeeded for a
 * GET moments earlier — surfacing as a client-side global error (see
 * src/app/error.tsx) before createTicketAction ever ran. The fix
 * (isServerActionRequest() in src/proxy.ts) exempts only confirmed Server
 * Action POSTs (method === "POST" && the "next-action" header is present)
 * from that middleware, relying on requireEmployee()/requireAdmin() inside
 * each Server Action as the real authorization boundary.
 *
 * Requires the same real Neon development branch and fixture accounts as
 * e2e/employee.spec.ts / e2e/auth.spec.ts. Skips entirely if the env vars
 * are missing. All ticket data created here is cancelled via the app's own
 * authorized cancelTicketAction before the test ends — this suite never
 * writes to the database directly.
 */
const EMPLOYEE_EMAIL = process.env.E2E_EMPLOYEE_EMAIL;
const EMPLOYEE_PASSWORD = process.env.E2E_EMPLOYEE_PASSWORD;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

const HAS_EMPLOYEE_CREDENTIALS = Boolean(EMPLOYEE_EMAIL && EMPLOYEE_PASSWORD);
const HAS_ADMIN_CREDENTIALS = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

const GLOBAL_ERROR_HEADING = "Что-то пошло не так";

test.describe("Server Action vs. proxy middleware regression", () => {
  test.describe("employee: create, comment, cancel a ticket via Server Actions", () => {
    test.skip(
      !HAS_EMPLOYEE_CREDENTIALS,
      "E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD are not set — see README.md."
    );

    test("create → exact ticket URL, no global error, then comment and cancel", async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel("Email").fill(EMPLOYEE_EMAIL!);
      await page.getByLabel("Пароль").fill(EMPLOYEE_PASSWORD!);
      await page.getByRole("button", { name: "Войти" }).click();
      await page.waitForURL(/\/app$/);
      expect(new URL(page.url()).pathname).toBe("/app");

      const title = `E2E: regression proxy ${Date.now()}`;

      await page.goto("/app/tickets/new");
      await page.getByLabel("Тема").fill(title);
      await page
        .getByLabel("Описание")
        .fill("E2E: проверка регрессии Server Action vs proxy middleware.");
      await page.getByLabel("Категория").selectOption("software");
      await page.getByLabel("Приоритет").selectOption("normal");
      await page.getByRole("button", { name: "Создать заявку" }).click();

      // The bug this test guards against: a 307 to /login instead of
      // landing on the new ticket's own detail page.
      await page.waitForURL(/\/app\/tickets\/[0-9a-f-]{36}$/);
      const ticketUrl = page.url();
      const ticketPath = new URL(ticketUrl).pathname;
      expect(ticketPath).toMatch(/^\/app\/tickets\/[0-9a-f-]{36}$/);
      await expect(page.getByRole("heading", { name: GLOBAL_ERROR_HEADING })).toHaveCount(0);
      await expect(page.getByText(title)).toBeVisible();

      await page.goto("/app/tickets");
      await expect(page.getByRole("cell", { name: title })).toBeVisible();

      await page.goto(ticketPath);
      const commentText = `E2E: комментарий регрессии ${Date.now()}`;
      await page.getByLabel("Новый комментарий").fill(commentText);
      await page.getByRole("button", { name: "Отправить" }).click();
      await expect(page.getByText(commentText)).toBeVisible();
      await expect(page.getByRole("heading", { name: GLOBAL_ERROR_HEADING })).toHaveCount(0);

      await page.getByRole("button", { name: "Отменить заявку" }).click();
      await page.getByRole("button", { name: "Да, отменить заявку" }).click();
      await expect(page.getByText("Заявка отменена")).toBeVisible();
      await expect(page.getByRole("button", { name: "Отменить заявку" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: GLOBAL_ERROR_HEADING })).toHaveCount(0);
    });
  });

  test.describe("admin: session survives Server Action-adjacent navigation", () => {
    test.skip(
      !HAS_ADMIN_CREDENTIALS,
      "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are not set — see README.md."
    );

    // NOTE: as of this session, the admin section (src/app/admin/page.tsx,
    // src/app/admin/tickets/page.tsx) is a read-only static placeholder —
    // there is no admin mutation Server Action in the codebase yet, so
    // "perform one safe admin mutation" is not implementable. This test
    // instead covers what the proxy fix actually affects for admins: a
    // normal authenticated navigation into /admin/** must never redirect to
    // /login or show the global error boundary.
    test("login → exact /admin, open the ticket registry with no redirect or global error", async ({
      page,
    }) => {
      await page.goto("/login");
      await page.getByLabel("Email").fill(ADMIN_EMAIL!);
      await page.getByLabel("Пароль").fill(ADMIN_PASSWORD!);
      await page.getByRole("button", { name: "Войти" }).click();
      await page.waitForURL(/\/admin$/);
      expect(new URL(page.url()).pathname).toBe("/admin");

      await page.goto("/admin/tickets");
      expect(new URL(page.url()).pathname).toBe("/admin/tickets");
      await expect(page.getByRole("heading", { name: "Реестр заявок" })).toBeVisible();
      await expect(page.getByRole("heading", { name: GLOBAL_ERROR_HEADING })).toHaveCount(0);
    });
  });
});

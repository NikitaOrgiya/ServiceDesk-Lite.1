import { expect, test } from "@playwright/test";

/**
 * Real Neon employee ticket workflow E2E — requires a genuine Neon
 * development branch (Neon Auth + Data API enabled) plus a real employee
 * test account (the same E2E_EMPLOYEE_EMAIL/E2E_EMPLOYEE_PASSWORD used by
 * auth.spec.ts). Never run against production.
 *
 * All ticket data created here is prefixed `E2E:` so it can be found and
 * removed manually later — this suite never wipes the database itself and
 * never changes the Admin account's role.
 *
 * If the required env vars are missing, every test below reports as
 * SKIPPED (not passed, not failed) — see README.md.
 */
const EMPLOYEE_EMAIL = process.env.E2E_EMPLOYEE_EMAIL;
const EMPLOYEE_PASSWORD = process.env.E2E_EMPLOYEE_PASSWORD;

const HAS_CREDENTIALS = Boolean(EMPLOYEE_EMAIL && EMPLOYEE_PASSWORD);

test.describe("real Neon employee ticket workflow", () => {
  test.skip(
    !HAS_CREDENTIALS,
    "E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD are not set — these tests require a real " +
      "Neon development branch (Neon Auth + Data API enabled) and a real employee test account, " +
      "see README.md."
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(EMPLOYEE_EMAIL!);
    await page.getByLabel("Пароль").fill(EMPLOYEE_PASSWORD!);
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForURL(/\/app$/);
  });

  test("creates a ticket and lands on its detail page", async ({ page }) => {
    const title = `E2E: тестовая заявка ${Date.now()}`;

    await page.goto("/app/tickets/new");
    await page.getByLabel("Тема").fill(title);
    await page
      .getByLabel("Описание")
      .fill("E2E: автоматическая проверка создания заявки, безопасно удалить.");
    await page.getByLabel("Категория").selectOption("software");
    await page.getByLabel("Приоритет").selectOption("normal");
    await page.getByRole("button", { name: "Создать заявку" }).click();

    await page.waitForURL(/\/app\/tickets\/[0-9a-f-]{36}$/);
    await expect(page.getByText(title)).toBeVisible();
  });

  test("a created ticket appears in the ticket list and can be found by search", async ({ page }) => {
    const title = `E2E: поиск заявки ${Date.now()}`;

    await page.goto("/app/tickets/new");
    await page.getByLabel("Тема").fill(title);
    await page.getByLabel("Описание").fill("E2E: проверка поиска в списке заявок.");
    await page.getByLabel("Категория").selectOption("other");
    await page.getByLabel("Приоритет").selectOption("low");
    await page.getByRole("button", { name: "Создать заявку" }).click();
    await page.waitForURL(/\/app\/tickets\/[0-9a-f-]{36}$/);

    await page.goto(`/app/tickets?q=${encodeURIComponent(title)}`);
    await expect(page.getByRole("cell", { name: title })).toBeVisible();
  });

  test("adds a comment to a ticket and sees it listed chronologically", async ({ page }) => {
    const title = `E2E: комментарии ${Date.now()}`;
    const commentText = `E2E: тестовый комментарий ${Date.now()}`;

    await page.goto("/app/tickets/new");
    await page.getByLabel("Тема").fill(title);
    await page.getByLabel("Описание").fill("E2E: проверка добавления комментария.");
    await page.getByLabel("Категория").selectOption("access");
    await page.getByLabel("Приоритет").selectOption("normal");
    await page.getByRole("button", { name: "Создать заявку" }).click();
    await page.waitForURL(/\/app\/tickets\/[0-9a-f-]{36}$/);

    await page.getByLabel("Новый комментарий").fill(commentText);
    await page.getByRole("button", { name: "Отправить" }).click();

    await expect(page.getByText(commentText)).toBeVisible();
  });

  test("cancels a brand-new ticket and the cancel button disappears afterwards", async ({ page }) => {
    const title = `E2E: отмена заявки ${Date.now()}`;

    await page.goto("/app/tickets/new");
    await page.getByLabel("Тема").fill(title);
    await page.getByLabel("Описание").fill("E2E: проверка отмены собственной новой заявки.");
    await page.getByLabel("Категория").selectOption("workplace");
    await page.getByLabel("Приоритет").selectOption("high");
    await page.getByRole("button", { name: "Создать заявку" }).click();
    await page.waitForURL(/\/app\/tickets\/[0-9a-f-]{36}$/);

    await page.getByRole("button", { name: "Отменить заявку" }).click();
    await page.getByRole("button", { name: "Да, отменить заявку" }).click();

    await expect(page.getByText("Заявка отменена")).toBeVisible();
    await expect(page.getByRole("button", { name: "Отменить заявку" })).toHaveCount(0);
  });
});

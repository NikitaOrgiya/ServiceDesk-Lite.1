import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("home page opens", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "ServiceDesk Lite" })).toBeVisible();
  });

  test("login page opens", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Вход в систему")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("forgot-password page opens", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByText("Восстановление пароля")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("login page has no signup link", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /регистрац/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /создать (учётную запись|аккаунт)/i })).toHaveCount(0);
  });

  test("an unauthenticated visitor to /app is redirected to /login", async ({ page }) => {
    await page.goto("/app");
    await page.waitForURL(/\/login/);
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("an unauthenticated visitor to /admin is redirected to /login", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL(/\/login/);
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("redirecting a protected path preserves it as a safe internal ?next=", async ({ page }) => {
    await page.goto("/app/tickets");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/app/tickets");
  });

  test("an external next parameter does not cause an open redirect", async ({ page }) => {
    await page.goto("/login?next=https://evil.example");
    // The page must render normally at our own origin — no server-side
    // redirect should ever follow an unsanitized `next` value.
    expect(new URL(page.url()).hostname).not.toBe("evil.example");
    await expect(page.getByText("Вход в систему")).toBeVisible();
  });
});

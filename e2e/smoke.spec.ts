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

  test("employee dashboard opens", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Обзор заявок" })).toBeVisible();
  });

  test("admin dashboard opens", async ({ page }) => {
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Обзор службы поддержки" })
    ).toBeVisible();
  });
});

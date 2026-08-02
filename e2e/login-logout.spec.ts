import { expect, test } from "@playwright/test";

/**
 * Regression coverage for the two bugs this fix addresses, without any
 * real fixture credentials: the login form's own POST mechanics (a plain
 * HTML form to a Route Handler, not a JS-dispatched Server Action) and the
 * fact that a failed attempt is a genuine server round trip. Real
 * sign-in/sign-out against fixture accounts stays in e2e/auth.spec.ts,
 * which is gated behind explicit env vars.
 */
test.describe("login form mechanics", () => {
  test("renders as a real HTML form posting to the login Route Handler", async ({ page }) => {
    await page.goto("/login");
    const form = page.locator("form");
    await expect(form).toHaveAttribute("action", "/auth/login");
    await expect(form).toHaveAttribute("method", "post");
  });

  test("email and password inputs have name attributes a native form submit relies on", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toHaveAttribute("name", "email");
    await expect(page.getByLabel("Пароль")).toHaveAttribute("name", "password");
  });

  test("an unresolvable account performs a real navigation to /login?error=1 with a generic message", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("no-such-account@example.invalid");
    await page.getByLabel("Пароль").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Войти" }).click();

    await page.waitForURL(/\/login\?error=1$/);
    await expect(page.getByText("Не удалось войти. Проверьте email и пароль.")).toBeVisible();
  });

  test("the error banner never reflects the provider's internal error text", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("no-such-account@example.invalid");
    await page.getByLabel("Пароль").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Войти" }).click();

    await page.waitForURL(/\/login\?error=1$/);
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toMatch(/invalid.credentials/i);
    expect(bodyText).not.toContain("no-such-account@example.invalid");
  });

  test("client-side validation blocks submission for an empty form without a network round trip", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Войти" }).click();

    // Still on /login with no error query param: the native submit never
    // happened because react-hook-form's validation intercepted it.
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Введите корректный email")).toBeVisible();
  });
});

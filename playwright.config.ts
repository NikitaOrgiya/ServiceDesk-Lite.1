import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

// Some sandboxed dev environments ship a pre-installed Chromium at a fixed
// path/revision instead of the one this Playwright version would normally
// download. Use it only when present; everywhere else fall back to
// Playwright's own browser resolution (e.g. after `npx playwright install`).
const PINNED_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const chromiumExecutablePath = fs.existsSync(PINNED_CHROMIUM)
  ? PINNED_CHROMIUM
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(chromiumExecutablePath
          ? { launchOptions: { executablePath: chromiumExecutablePath } }
          : {}),
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

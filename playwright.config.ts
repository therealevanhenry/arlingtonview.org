import { defineConfig, devices } from "@playwright/test";

// Browser tests against the built site (OFFLINE=1) plus fixture previews in dist/_preview/.
// Use the npm scripts, which build and generate the previews first (see tests/e2e/README.md).
const PORT = 4331; // never 4321, which `npm run preview` and the owner's own preview use
const CI = process.env.CI !== undefined && process.env.CI !== "";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "test-results",
  fullyParallel: true, // every test is read-only against the same static files
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 30_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  expect: { timeout: 5_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
  },
  webServer: {
    // --ignore-lock: Astro 7's `preview` refuses to start while another preview holds its lock (e.g. a
    // developer's own `npm run preview`). The flag skips only that lock check; the port stays exclusive
    // because reuseExistingServer is false, so a taken 4331 fails loudly instead of testing the wrong server.
    command: `npx astro preview --ignore-lock --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "webkit-phone", use: { ...devices["iPhone 15"] } },
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox-desktop", use: { ...devices["Desktop Firefox"] } },
  ],
});

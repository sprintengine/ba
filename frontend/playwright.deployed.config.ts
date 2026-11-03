import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests against a deployed website (the release train, docs/releases.md): `E2E_BASE_URL` is the environment's
 * site, which proxies `/api` to its API. Read-only: nothing here signs in or books.
 *
 *   E2E_BASE_URL=https://staging.example.com npx playwright test -c playwright.deployed.config.ts
 */
const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) throw new Error("Set E2E_BASE_URL to the deployed site.");

export default defineConfig({
  testDir: "./tests/deployed",
  retries: 2,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

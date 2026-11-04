import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3000);
const PERFORMANCE_SPEC = /performance\.spec\.ts/;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  // CI: annotations in the run plus an HTML report (uploaded with traces when the job fails). The perf reporter writes
  // the web-vitals report (PERF_REPORT) and job summary; it does nothing in runs without performance tests.
  reporter: [
    ...(process.env.CI ? ([["github"], ["html", { open: "never" }]] as const) : ([["list"]] as const)),
    ["./tests/e2e/perf/perf-reporter.ts"],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: PERFORMANCE_SPEC },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: PERFORMANCE_SPEC },
    // Web-vitals budgets: Chromium only (CPU and network throttling go through the DevTools protocol), the device
    // comes from perf/web-vitals-budget.json, and pages are measured one after another. Run it on its own
    // (`npm run perf:vitals`) so other tests don't share the CPU it measures. WebGL is off: headless Chromium (and CI)
    // has no GPU, and software WebGL blocks the main thread for seconds on the landing's glass scene, which measures
    // SwiftShader rather than the page; without it the landing shows its poster, as it does on low-end phones.
    {
      name: "performance",
      testMatch: PERFORMANCE_SPEC,
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"], trace: "off", launchOptions: { args: ["--disable-3d-apis"] } },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", port, reuseExistingServer: true, timeout: 120_000 },
});

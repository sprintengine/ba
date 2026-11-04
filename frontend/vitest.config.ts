import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "perf/**/*.test.ts"],
    css: false,
    // Instrumented (coverage) runs and shared CI runners are slower than a laptop; a few editor tests type a lot.
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}", "perf/lib/**/*.ts"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "perf/**/*.test.ts",
        "src/**/__tests__/**",
        "src/components/*/test/**",
        "src/test/**",
        "src/**/*.d.ts",
      ],
      // Measured coverage minus ~2 points (lines 92.1, statements 91.2, functions 89.8, branches 88.6). Raise as tests
      // are added; never lower to get a build through.
      thresholds: { lines: 90, statements: 89, functions: 87, branches: 86 },
    },
  },
});

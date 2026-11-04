import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("../frontend/src/lib", import.meta.url)),
      "@": fileURLToPath(new URL("../frontend/src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "./coverage",
      // The pure parts: token minting, the shadow model and its comparison, the oracle, refunds, options, statistics and the log. The bots and the
      // runner talk to a live stack and are exercised by running the simulation.
      include: [
        "src/auth.ts",
        "src/rng.ts",
        "src/time.ts",
        "src/oracle.ts",
        "src/stats.ts",
        "src/invariants.ts",
        "src/trail.ts",
        "src/options.ts",
        "src/refunds.ts",
        "src/shadow.ts",
        "src/consistency.ts",
        "src/stripe.ts",
      ],
      thresholds: { lines: 85, statements: 85, functions: 85, branches: 75 },
    },
  },
});

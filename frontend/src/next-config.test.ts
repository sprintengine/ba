import type { NextConfig } from "next";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEST_SENTRY_DSN as DSN } from "@/test/sentry";

/** next.config.ts as `next build` (Turbopack, which sets TURBOPACK) would load it with this environment. */
async function load(env: Record<string, string> = {}): Promise<NextConfig> {
  for (const name of ["NEXT_PUBLIC_SENTRY_DSN", "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", "SENTRY_AUTH_TOKEN"])
    vi.stubEnv(name, "");
  vi.stubEnv("TURBOPACK", "1");
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  vi.resetModules();
  return (await import("../next.config")).default;
}

afterEach(() => vi.unstubAllEnvs());

describe("next.config Sentry wiring", () => {
  it("is the plain config without a DSN: no wrapper, loader, source maps or build defines", async () => {
    const config = await load({ SENTRY_DSN: DSN, SENTRY_AUTH_TOKEN: "token" });
    expect(Object.keys(config).sort()).toEqual(
      [
        "allowedDevOrigins",
        "devIndicators",
        "env",
        "experimental",
        "headers",
        "poweredByHeader",
        "reactStrictMode",
        "rewrites",
      ].sort(),
    );
    expect(config.env).toEqual({ NEXT_PUBLIC_SENTRY_DSN: "" });
    expect(config.experimental).toEqual({
      cssChunking: "graph",
      turbopackChunking: { minChunkSize: 35_000 },
    });
  });

  it("with a DSN injects the browser loader, inlines the settings and generates no source maps without a token", async () => {
    const config = await load({ NEXT_PUBLIC_SENTRY_DSN: DSN, NEXT_PUBLIC_SENTRY_ENVIRONMENT: "staging" });
    expect(config.instrumentationClientInject).toEqual(["./src/lib/observability/sentry-loader.ts"]);
    expect(config.env).toMatchObject({
      NEXT_PUBLIC_SENTRY_DSN: DSN,
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "staging",
      NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0",
    });
    expect(config.productionBrowserSourceMaps).not.toBe(true);
    // No trace rate: the SDK's tracing code is compiled out.
    expect(config.compiler?.define).toMatchObject({ __SENTRY_TRACING__: false });
    expect(config.experimental).toMatchObject({
      cssChunking: "graph",
      turbopackChunking: { minChunkSize: 35_000 },
    });
  });

  it("keeps tracing in the build when a trace rate is set", async () => {
    const config = await load({ NEXT_PUBLIC_SENTRY_DSN: DSN, NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0.1" });
    expect(config.compiler?.define).not.toHaveProperty("__SENTRY_TRACING__");
  });
});

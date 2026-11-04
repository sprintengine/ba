import { describe, expect, it } from "vitest";
import { TEST_SENTRY_DSN as DSN } from "@/test/sentry";
import { readSentryConfig, readWorkerSentryConfig } from "./config";

describe("readSentryConfig", () => {
  it("is off without a DSN", () => {
    expect(readSentryConfig({})).toBeNull();
    expect(
      readSentryConfig({ NEXT_PUBLIC_SENTRY_DSN: "  ", NEXT_PUBLIC_SENTRY_ENVIRONMENT: "production" }),
    ).toBeNull();
  });

  it("reads the public build-time names", () => {
    expect(
      readSentryConfig({
        NEXT_PUBLIC_SENTRY_DSN: ` ${DSN} `,
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: "staging",
        NEXT_PUBLIC_SENTRY_RELEASE: "0123abc",
        NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0.1",
      }),
    ).toEqual({ dsn: DSN, environment: "staging", release: "0123abc", tracesSampleRate: 0.1 });
  });

  it("ignores the unprefixed SENTRY_ names, which may be another service's server-side settings", () => {
    expect(readSentryConfig({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: "1" })).toBeNull();
    expect(
      readSentryConfig({
        NEXT_PUBLIC_SENTRY_DSN: DSN,
        SENTRY_ENVIRONMENT: "staging",
        SENTRY_TRACES_SAMPLE_RATE: "1",
      }),
    ).toEqual({ dsn: DSN, environment: "development", tracesSampleRate: 0 });
  });

  it("defaults the environment from NODE_ENV and leaves the release unset", () => {
    expect(readSentryConfig({ NEXT_PUBLIC_SENTRY_DSN: DSN, NODE_ENV: "production" })).toEqual({
      dsn: DSN,
      environment: "production",
      tracesSampleRate: 0,
    });
    expect(readSentryConfig({ NEXT_PUBLIC_SENTRY_DSN: DSN, NODE_ENV: "development" })?.environment).toBe(
      "development",
    );
    expect(readSentryConfig({ NEXT_PUBLIC_SENTRY_DSN: DSN })?.environment).toBe("development");
  });

  it("clamps the trace rate to 0..1 and treats anything else as 0", () => {
    const rate = (value: string) =>
      readSentryConfig({ NEXT_PUBLIC_SENTRY_DSN: DSN, NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: value })
        ?.tracesSampleRate;
    expect(rate("1")).toBe(1);
    expect(rate("5")).toBe(1);
    expect(rate("-1")).toBe(0);
    expect(rate("lots")).toBe(0);
    expect(rate("0.25")).toBe(0.25);
  });
});

describe("readWorkerSentryConfig", () => {
  it("reads the SENTRY_ names first, then the public ones", () => {
    expect(
      readWorkerSentryConfig({ SENTRY_DSN: DSN, SENTRY_ENVIRONMENT: "staging", SENTRY_RELEASE: "f00d" }),
    ).toEqual({ dsn: DSN, environment: "staging", release: "f00d", tracesSampleRate: 0 });
    expect(
      readWorkerSentryConfig({
        SENTRY_DSN: DSN,
        NEXT_PUBLIC_SENTRY_DSN: "https://otherPublicKey@sentry.example/1",
      })?.dsn,
    ).toBe(DSN);
    expect(
      readWorkerSentryConfig({ NEXT_PUBLIC_SENTRY_DSN: DSN, NEXT_PUBLIC_SENTRY_RELEASE: "0123abc" })?.release,
    ).toBe("0123abc");
  });

  it("defaults to production, as Workers have no NODE_ENV", () => {
    expect(readWorkerSentryConfig({ SENTRY_DSN: DSN })?.environment).toBe("production");
    expect(readWorkerSentryConfig({})).toBeNull();
  });
});

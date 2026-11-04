import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SENTRY_DSN as DSN } from "@/test/sentry";
import { scrubEvent } from "./scrub";
import { DATA_COLLECTION } from "./sentry-options";
import { sentryWorkerEntry, sentryWorkerOptions } from "./sentry-worker";

const sdk = vi.hoisted(() => ({
  withSentry: vi.fn((_options: (env: unknown) => unknown, handler: object) => ({ wrapped: handler })),
}));
vi.mock("@sentry/nextjs/cloudflare", () => sdk);

const OTHER_DSN = "https://otherPublicKey@sentry.example/1";

beforeEach(() => vi.clearAllMocks());

describe("sentryWorkerOptions", () => {
  it("leaves the SDK off without a DSN in the build or the Worker's variables", () => {
    expect(sentryWorkerOptions({})).toEqual({ enabled: false });
    expect(sentryWorkerOptions(undefined, null)).toEqual({ enabled: false });
  });

  it("starts it from the Worker's variables, scrubbing as everywhere else", () => {
    const options = sentryWorkerOptions({ SENTRY_DSN: DSN, CF_VERSION_METADATA: { id: "v1" } });
    expect(options).toMatchObject({
      dsn: DSN,
      environment: "production",
      dataCollection: DATA_COLLECTION,
      beforeSend: scrubEvent,
    });
    // No release of its own, so the SDK falls back to the Worker's version id.
    expect(options).not.toHaveProperty("release");
  });

  it("uses the build's settings, so the Worker reports like the browser", () => {
    const build = {
      NEXT_PUBLIC_SENTRY_DSN: DSN,
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "staging",
      NEXT_PUBLIC_SENTRY_RELEASE: "0.4.0-nightly.12",
      NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: "0.5",
    };
    expect(sentryWorkerOptions({ BACKEND_ORIGIN: "https://api.example.com" }, build)).toMatchObject({
      dsn: DSN,
      environment: "staging",
      release: "0.4.0-nightly.12",
      tracesSampleRate: 0.5,
    });
  });

  it("lets the Worker's variables override the build's", () => {
    const build = { NEXT_PUBLIC_SENTRY_DSN: DSN, NEXT_PUBLIC_SENTRY_ENVIRONMENT: "staging" };
    expect(sentryWorkerOptions({ SENTRY_DSN: OTHER_DSN, SENTRY_RELEASE: "f00d" }, build)).toMatchObject({
      dsn: OTHER_DSN,
      environment: "staging",
      release: "f00d",
    });
  });
});

describe("sentryWorkerOptions precedence", () => {
  it("takes only the Sentry keys from the env files", () => {
    // A developer's .env.local can hold another service's SENTRY_DSN: it must not configure the Worker.
    expect(sentryWorkerOptions({}, { SENTRY_DSN: OTHER_DSN, SENTRY_ENVIRONMENT: "development" })).toEqual({
      enabled: false,
    });
    expect(
      sentryWorkerOptions(
        {},
        { NEXT_PUBLIC_SENTRY_DSN: DSN, SENTRY_DSN: OTHER_DSN, SENTRY_RELEASE: "local" },
      ),
    ).not.toHaveProperty("release");
  });

  it("lets every runtime name beat the build, field by field", () => {
    const build = { NEXT_PUBLIC_SENTRY_DSN: DSN, NEXT_PUBLIC_SENTRY_ENVIRONMENT: "staging" };
    expect(sentryWorkerOptions({ NEXT_PUBLIC_SENTRY_ENVIRONMENT: "production" }, build)).toMatchObject({
      dsn: DSN,
      environment: "production",
    });
    expect(
      sentryWorkerOptions(
        { SENTRY_ENVIRONMENT: "eu", NEXT_PUBLIC_SENTRY_ENVIRONMENT: "production", SENTRY_DSN: " " },
        build,
      ),
    ).toMatchObject({ dsn: DSN, environment: "eu" });
  });
});

describe("sentryWorkerEntry", () => {
  const handler = { fetch: vi.fn() };

  it("is OpenNext's handler itself when the build has no DSN", () => {
    expect(sentryWorkerEntry(handler, {})).toBe(handler);
    expect(sentryWorkerEntry(handler, undefined)).toBe(handler);
    expect(sentryWorkerEntry(handler, { NEXT_PUBLIC_SENTRY_DSN: "" })).toBe(handler);
    expect(sdk.withSentry).not.toHaveBeenCalled();
  });

  it("ignores a DSN that is not the build's: without one the server code reports nothing", () => {
    expect(sentryWorkerEntry(handler, { SENTRY_DSN: DSN })).toBe(handler);
    expect(sdk.withSentry).not.toHaveBeenCalled();
  });

  it("wraps it with withSentry when the build has a DSN, reading each request's variables", () => {
    const entry = sentryWorkerEntry(handler, { NEXT_PUBLIC_SENTRY_DSN: DSN });
    expect(entry).toEqual({ wrapped: handler });
    expect(sdk.withSentry).toHaveBeenCalledWith(expect.any(Function), handler);
    const options = sdk.withSentry.mock.calls[0]![0];
    expect(options({ SENTRY_ENVIRONMENT: "staging" })).toMatchObject({ dsn: DSN, environment: "staging" });
    expect(options({ SENTRY_DSN: OTHER_DSN })).toMatchObject({ dsn: OTHER_DSN });
  });
});

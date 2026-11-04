import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SENTRY_DSN as DSN, resetEarlyErrors } from "@/test/sentry";
import { holdEarlyError } from "./early-errors";

const sdk = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => sdk);

/** A fresh copy of the module, reading the env as a build would have inlined it. */
async function load(env: Record<string, string> = {}) {
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  vi.resetModules();
  return import("./sentry-client");
}

const captured = () => sdk.captureException.mock.calls.map(([error]) => error as unknown);

beforeEach(() => {
  vi.clearAllMocks();
  resetEarlyErrors();
});
afterEach(() => vi.unstubAllEnvs());

describe("startSentry", () => {
  it("does nothing in a build without a DSN", async () => {
    const { startSentry, captureBoundaryError } = await load();
    holdEarlyError(new Error("early"));
    startSentry();
    captureBoundaryError(new Error("boom"));
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it("starts once with the build's settings and reports the errors held before", async () => {
    const { startSentry } = await load({
      NEXT_PUBLIC_SENTRY_DSN: DSN,
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "staging",
    });
    const early = new Error("before load");
    holdEarlyError(early);
    holdEarlyError("a rejection");
    startSentry();
    startSentry();

    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: DSN, environment: "staging", dataCollection: expect.any(Object) }),
    );
    expect(captured()).toEqual([early, "a rejection"]);
    // Once started, nothing more is held: the SDK's own handlers report.
    holdEarlyError(new Error("later"));
    startSentry();
    expect(captured()).toHaveLength(2);
  });
});

describe("captureBoundaryError", () => {
  it("starts the SDK if needed and reports the error once, however often the effect runs", async () => {
    const { captureBoundaryError } = await load({ NEXT_PUBLIC_SENTRY_DSN: DSN });
    const error = new Error("render failed");
    captureBoundaryError(error);
    captureBoundaryError(error);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.captureException).toHaveBeenCalledTimes(1);
    expect(sdk.captureException).toHaveBeenCalledWith(error, {
      mechanism: { type: "auto.function.nextjs.error_boundary", handled: false },
    });
  });
});

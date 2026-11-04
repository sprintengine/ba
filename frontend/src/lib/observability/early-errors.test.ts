import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SENTRY_DSN as DSN, resetEarlyErrors } from "@/test/sentry";
import { holdEarlyError, takeEarlyErrors } from "./early-errors";

const sdk = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => sdk);

beforeEach(() => {
  vi.clearAllMocks();
  resetEarlyErrors();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("early errors", () => {
  it("holds up to ten errors until taken, then holds nothing", () => {
    for (let i = 0; i < 12; i++) holdEarlyError(i);
    expect(takeEarlyErrors()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    holdEarlyError("late");
    expect(takeEarlyErrors()).toEqual([]);
  });

  it("are reported when the error boundary starts the SDK before the page went idle, and only once", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
    vi.resetModules();
    await import("./sentry-loader");
    const early = new Error("thrown during hydration");
    window.dispatchEvent(new ErrorEvent("error", { error: early }));

    const { captureBoundaryError } = await import("./sentry-client");
    const boundary = new Error("caught by app/error.tsx");
    captureBoundaryError(boundary);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.captureException.mock.calls.map(([error]) => error as unknown)).toEqual([early, boundary]);

    // The loader's own start, once idle, finds the SDK running and the queue empty.
    vi.advanceTimersByTime(2000);
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledTimes(1));
    await vi.dynamicImportSettled();
    expect(sdk.captureException).toHaveBeenCalledTimes(2);
  });
});

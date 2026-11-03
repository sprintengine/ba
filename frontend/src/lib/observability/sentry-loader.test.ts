import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SENTRY_DSN as DSN, resetEarlyErrors } from "@/test/sentry";
import { takeEarlyErrors } from "./early-errors";

const client = vi.hoisted(() => ({ startSentry: vi.fn() }));
vi.mock("./sentry-client", () => client);

const idleApi = window as Partial<Pick<Window, "requestIdleCallback">>;

async function load(dsn = "") {
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", dsn);
  vi.resetModules();
  await import("./sentry-loader");
}

/** Runs the loader's timer and lets its dynamic import settle. */
async function settle() {
  vi.advanceTimersByTime(2000);
  await vi.waitFor(() => expect(client.startSentry).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  resetEarlyErrors();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  delete idleApi.requestIdleCallback;
});

describe("sentry-loader", () => {
  it("does nothing without a DSN", async () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    await load();
    await vi.runAllTimersAsync();
    expect(addEventListener).not.toHaveBeenCalled();
    expect(client.startSentry).not.toHaveBeenCalled();
    addEventListener.mockRestore();
  });

  it("holds the errors thrown before the SDK, then loads it after a delay where there is no idle callback", async () => {
    await load(DSN);
    const early = new Error("early");
    window.dispatchEvent(new ErrorEvent("error", { error: early, message: "early" }));
    window.dispatchEvent(new ErrorEvent("error", { message: "Script error." }));
    const rejection = new Event("unhandledrejection") as Event & { reason: unknown };
    rejection.reason = "nope";
    window.dispatchEvent(rejection);
    expect(client.startSentry).not.toHaveBeenCalled();

    await settle();
    // Once started, the SDK's own handlers take over: the loader holds no more.
    window.dispatchEvent(new ErrorEvent("error", { message: "later" }));
    expect(takeEarlyErrors()).toEqual([early, "Script error.", "nope"]);
  });

  it("waits for the page to go idle where it can", async () => {
    const requestIdleCallback = vi.fn((run: () => void) => {
      run();
      return 1;
    });
    idleApi.requestIdleCallback = requestIdleCallback;
    await load(DSN);
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 4000 });
    await settle();
  });
});

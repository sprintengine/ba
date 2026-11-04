import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEST_SENTRY_DSN } from "@/test/sentry";

const client = vi.hoisted(() => ({ captureBoundaryError: vi.fn() }));
vi.mock("@/lib/observability/sentry-client", () => client);

/** The boundary as a build with (or without) a Sentry DSN compiles it. */
async function load(dsn = "") {
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", dsn);
  vi.resetModules();
  return (await import("./error")).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("RootError", () => {
  it("offers a retry and reports nothing without a DSN", async () => {
    const RootError = await load();
    const reset = vi.fn();
    render(<RootError error={new Error("boom")} reset={reset} />);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalled();
    expect(client.captureBoundaryError).not.toHaveBeenCalled();
  });

  it("reports the error to Sentry when the build has a DSN", async () => {
    const RootError = await load(TEST_SENTRY_DSN);
    const error = new Error("boom");
    render(<RootError error={error} reset={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    await vi.waitFor(() => expect(client.captureBoundaryError).toHaveBeenCalledWith(error));
  });

  it("doesn't fetch the SDK for an error from server rendering, which the server reported", async () => {
    const RootError = await load(TEST_SENTRY_DSN);
    const error = Object.assign(new Error("An error occurred in the Server Components render"), {
      digest: "42",
    });
    render(<RootError error={error} reset={vi.fn()} />);
    await vi.dynamicImportSettled();
    expect(client.captureBoundaryError).not.toHaveBeenCalled();
  });
});

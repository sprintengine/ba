import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMarketplaceMeta, useMarketplaceSearch } from "./use-marketplace";
import { useManagedAvailabilityWindows, usePublicAvailabilityWindows } from "./use-public";

/** Requests made so far, each with the signal it was given; none of them ever answers. */
let signals: { path: string; signal: AbortSignal | undefined }[] = [];

beforeEach(() => {
  signals = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      signals.push({
        path: new URL(String(input), "http://localhost").pathname,
        signal: init?.signal ?? undefined,
      });
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason as Error));
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function withQueryClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

/** Renders the hook, waits for its request to `path`, unmounts, and expects that request to be aborted. */
async function expectAbortedOnUnmount(useHook: () => unknown, path: string) {
  const { unmount } = renderHook(useHook, { wrapper: withQueryClient() });
  await waitFor(() => expect(signals.some((s) => s.path === path)).toBe(true));
  const request = signals.find((s) => s.path === path);
  expect(request?.signal?.aborted).toBe(false);
  unmount();
  await waitFor(() => expect(request?.signal?.aborted).toBe(true));
}

const window = { from: "2026-10-01", to: "2026-10-31" };

describe("query cancellation reaches the network", () => {
  it("aborts public availability windows nobody is waiting for any more", async () => {
    await expectAbortedOnUnmount(
      () => usePublicAvailabilityWindows("lumen", { serviceId: "s1" }, [window]),
      "/api/v1/public/businesses/lumen/availability",
    );
  });

  it("aborts reschedule availability on the manage page", async () => {
    await expectAbortedOnUnmount(
      () => useManagedAvailabilityWindows("tok", [window]),
      "/api/v1/public/manage/tok/availability",
    );
  });

  it("aborts marketplace searches and metadata", async () => {
    await expectAbortedOnUnmount(
      () => useMarketplaceSearch({ city: "cork" }),
      "/api/v1/public/marketplace/search",
    );
    await expectAbortedOnUnmount(() => useMarketplaceMeta(), "/api/v1/public/marketplace/meta");
  });
});

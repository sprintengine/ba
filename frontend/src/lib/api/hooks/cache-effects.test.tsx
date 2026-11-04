/** Mutations update and invalidate the caches their change affects (README §5). */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qk } from "../query-keys";
import { useRejectAction } from "./use-assistant";
import { usePauseOffer } from "./use-offers";
import { useReplaceResourceRules } from "./use-resources";
import { useDeleteService } from "./use-services";
import { useEditSite, useGenerateSite } from "./use-site";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

/** Seeds `keys` in the cache and returns a predicate: was the key invalidated? */
function seed(queryClient: QueryClient, keys: readonly (readonly unknown[])[]) {
  for (const key of keys) queryClient.setQueryData(key, {});
  return (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated ?? false;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const b = qk.business("b1");

describe("assistant", () => {
  it("declining a proposal refreshes the stored threads", async () => {
    fetchMock.mockResolvedValue(json({ id: "a1", status: "rejected" }));
    const { queryClient, wrapper } = setup();
    const invalidated = seed(queryClient, [b.assistantThread("t1"), b.services()]);
    const { result } = renderHook(() => useRejectAction("b1"), { wrapper });

    await act(() => result.current.mutateAsync("a1"));

    expect(invalidated(b.assistantThread("t1"))).toBe(true);
    expect(invalidated(b.services())).toBe(false);
  });
});

describe("site AI", () => {
  const result = { state: { draftVersion: 3 }, changes: [], notes: [] };

  /** Each mutation as a hook returning "run it". */
  function useGenerateRun() {
    const m = useGenerateSite("b1");
    return () => m.mutateAsync({});
  }
  function useEditRun() {
    const m = useEditSite("b1");
    return () => m.mutateAsync({ instruction: "Warmer", baseVersion: 2 });
  }
  const runs = { generate: useGenerateRun, edit: useEditRun };

  it.each(["generate", "edit"] as const)("%s refreshes everything showing AI credits", async (name) => {
    fetchMock.mockResolvedValue(json(result));
    const { queryClient, wrapper } = setup();
    const invalidated = seed(queryClient, [
      b.aiUsage(),
      b.assistant(),
      b.assistantMemory(),
      b.siteVersions(),
    ]);
    const { result: run } = renderHook(runs[name], { wrapper });

    await act(() => run.current());

    expect(queryClient.getQueryData(b.site())).toEqual(result.state);
    expect(invalidated(b.siteVersions())).toBe(true);
    expect(invalidated(b.aiUsage())).toBe(true);
    expect(invalidated(b.assistant())).toBe(true);
    expect(invalidated(b.assistantMemory())).toBe(false);
  });
});

describe("offers", () => {
  it("changing an offer refreshes staff availability, whose slots carry deals", async () => {
    fetchMock.mockResolvedValue(json({ id: "of1", status: "paused" }));
    const { queryClient, wrapper } = setup();
    const slots = b.availability({ serviceId: "s1", from: "2026-10-05", to: "2026-10-06" });
    const invalidated = seed(queryClient, [slots, qk.public.all(), qk.marketplace.all()]);
    const { result } = renderHook(() => usePauseOffer("b1"), { wrapper });

    await act(() => result.current.mutateAsync("of1"));

    expect(invalidated(slots)).toBe(true);
    expect(invalidated(qk.public.all())).toBe(true);
    expect(invalidated(qk.marketplace.all())).toBe(true);
  });
});

describe("marketplace listings", () => {
  const search = qk.marketplace.search({ city: "cork" });

  it("deleting a service refreshes them (prices and next free times)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { queryClient, wrapper } = setup();
    const invalidated = seed(queryClient, [search]);
    const { result } = renderHook(() => useDeleteService("b1"), { wrapper });

    await act(() => result.current.mutateAsync("s1"));

    expect(invalidated(search)).toBe(true);
  });

  it("new weekly hours refresh them (next free times)", async () => {
    fetchMock.mockResolvedValue(json({ rules: [] }));
    const { queryClient, wrapper } = setup();
    const invalidated = seed(queryClient, [search]);
    const { result } = renderHook(() => useReplaceResourceRules("b1", "r1"), { wrapper });

    await act(() => result.current.mutateAsync([]));

    expect(invalidated(search)).toBe(true);
  });
});

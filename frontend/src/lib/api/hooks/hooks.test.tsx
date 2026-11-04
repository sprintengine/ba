import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qk } from "../query-keys";
import { useBusiness, useInfiniteBookings, useUpdateBusiness } from "./index";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hooks", () => {
  it("business-scoped queries stay idle without a businessId", () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useBusiness(""), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("respects the caller's enabled flag", () => {
    const { wrapper } = setup();
    renderHook(() => useBusiness("b1", { enabled: false }), { wrapper });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pages infinite bookings by cursor", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ items: [{ id: "1" }], nextCursor: "c2" }))
      .mockResolvedValueOnce(json({ items: [{ id: "2" }], nextCursor: null }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useInfiniteBookings("b1", { status: "confirmed" }), { wrapper });

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.hasNextPage).toBe(false));

    expect(result.current.data?.map((b) => b.id)).toEqual(["1", "2"]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("cursor=c2");
  });

  it("update business writes the detail cache and invalidates me", async () => {
    const updated = { id: "b1", name: "Renamed" };
    fetchMock.mockResolvedValue(json(updated));
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(qk.me(), { user: {} });
    const { result } = renderHook(() => useUpdateBusiness("b1"), { wrapper });

    await act(() => result.current.mutateAsync({ name: "Renamed" }));

    expect(queryClient.getQueryData(qk.business("b1").detail())).toEqual(updated);
    expect(queryClient.getQueryState(qk.me())?.isInvalidated).toBe(true);
  });
});

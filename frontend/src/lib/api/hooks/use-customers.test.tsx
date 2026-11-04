/** Customers: list/search, detail, create, update, GDPR erase and export. */
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomerInput } from "../types";
import {
  useCreateCustomer,
  useCustomer,
  useCustomers,
  useEraseCustomer,
  useExportCustomer,
  useInfiniteCustomers,
  useUpdateCustomer,
} from "./use-customers";
import { BIZ, json, keyNames, noContent, renderApiHook, sequence, stubApi } from "./__tests__/harness";

afterEach(() => vi.unstubAllGlobals());

const base = `/v1/businesses/${BIZ}`;
const input: CustomerInput = { name: "Alex Morgan", email: "alex@example.com", phone: null };
const customers = keyNames("customersList", "customersInfinite", "customerDetail");

describe("customer queries", () => {
  it("useCustomers sends the search as the query string", async () => {
    const api = stubApi({ [`GET ${base}/customers`]: json({ items: [{ id: "c1" }], nextCursor: null }) });
    const { result } = renderApiHook(() => useCustomers(BIZ, { q: "alex", limit: 10 }));
    await waitFor(() => expect(result.current.data?.items).toEqual([{ id: "c1" }]));
    expect(api.last().query).toEqual({ q: "alex", limit: "10" });
  });

  it("useInfiniteCustomers pages by cursor", async () => {
    const api = stubApi({
      [`GET ${base}/customers`]: sequence(
        json({ items: [{ id: "c1" }], nextCursor: "n2" }),
        json({ items: [{ id: "c2" }], nextCursor: null }),
      ),
    });
    const { result } = renderApiHook(() => useInfiniteCustomers(BIZ, { q: "a" }));

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    expect(api.calls[0]?.query).toEqual({ q: "a" });
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.hasNextPage).toBe(false));

    expect(result.current.data?.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(api.calls[1]?.query).toEqual({ q: "a", cursor: "n2" });
  });

  it("useCustomer GETs the detail and waits for both ids", async () => {
    const api = stubApi({ [`GET ${base}/customers/c1`]: json({ id: "c1", bookings: [] }) });
    const { result } = renderApiHook(() => ({
      detail: useCustomer(BIZ, "c1"),
      none: useCustomer(BIZ, ""),
      noBusiness: useInfiniteCustomers(""),
    }));
    await waitFor(() => expect(result.current.detail.data).toEqual({ id: "c1", bookings: [] }));
    expect(result.current.none.fetchStatus).toBe("idle");
    expect(result.current.noBusiness.fetchStatus).toBe("idle");
    expect(api.calls).toHaveLength(1);
  });
});

describe("customer mutations", () => {
  it("create POSTs and refreshes every customer list", async () => {
    const api = stubApi({ [`POST ${base}/customers`]: json({ id: "c9", ...input }) });
    const view = renderApiHook(() => useCreateCustomer(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync(input));

    expect(api.last().body).toEqual(input);
    expect(view.invalidated()).toEqual(customers);
  });

  it("update PATCHes, merges into the cached detail and refreshes customers, bookings and the overview", async () => {
    const api = stubApi({ [`PATCH ${base}/customers/c1`]: json({ id: "c1", name: "Alex M" }) });
    const view = renderApiHook(() => useUpdateCustomer(BIZ), {
      seed: true,
      seedData: { customerDetail: { id: "c1", name: "Alex", bookings: [{ id: "bk1" }] } },
    });

    await act(() => view.result.current.mutateAsync({ id: "c1", input }));

    expect(api.last().body).toEqual(input);
    // The detail keeps its own fields (bookings) and takes the new ones.
    expect(view.data("customerDetail")).toEqual({ id: "c1", name: "Alex M", bookings: [{ id: "bk1" }] });
    // Bookings (and the overview's list of today's) embed the customer's name, email and phone.
    expect(view.invalidated()).toEqual(
      keyNames(...customers, "overview", "bookingsList", "bookingsInfinite", "bookingDetail"),
    );
  });

  it("update leaves an uncached detail uncached", async () => {
    stubApi({ [`PATCH ${base}/customers/c7`]: json({ id: "c7", name: "New" }) });
    const view = renderApiHook(() => useUpdateCustomer(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync({ id: "c7", input }));

    expect(view.queryClient.getQueryData(["business", BIZ, "customers", "detail", "c7"])).toBeUndefined();
  });

  it("erase DELETEs, drops the cached detail and refreshes customers, bookings and the overview", async () => {
    const api = stubApi({ [`DELETE ${base}/customers/c1`]: noContent });
    const view = renderApiHook(() => useEraseCustomer(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync("c1"));

    expect(api.calls).toHaveLength(1);
    expect(view.removed()).toEqual(["customerDetail"]);
    expect(view.invalidated()).toEqual(
      keyNames(
        "customersList",
        "customersInfinite",
        "overview",
        "bookingsList",
        "bookingsInfinite",
        "bookingDetail",
      ),
    );
  });

  it("export GETs the document without touching the cache", async () => {
    stubApi({ [`GET ${base}/customers/c1/export`]: json({ customer: { id: "c1" } }) });
    const view = renderApiHook(() => useExportCustomer(BIZ), { seed: true });

    await expect(act(() => view.result.current.mutateAsync("c1"))).resolves.toEqual({
      customer: { id: "c1" },
    });

    expect(view.invalidated()).toEqual([]);
  });
});

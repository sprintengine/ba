import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingDetail, CreateStaffBooking } from "../types";
import { qk } from "../query-keys";
import {
  useApproveBooking,
  useBooking,
  useBookings,
  useCancelBooking,
  useCreateBooking,
  useDeclineBooking,
  useMarkPaidInPerson,
  useRescheduleBooking,
  useSendPaymentLink,
  useSetBookingStatus,
  useStaffAvailability,
  useUpdateBooking,
} from "./use-bookings";
import {
  BIZ,
  PUBLIC,
  fail,
  held,
  json,
  keyNames,
  renderApiHook,
  sequence,
  stubApi,
} from "./__tests__/harness";

const fetchMock = vi.fn<typeof fetch>();
const KEY = qk.business("b1").bookings.detail("bk1");
const detail = { id: "bk1", status: "pending_approval" } as BookingDetail;

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(KEY, detail);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

/** A fetch that stays pending until `settle` is called. */
function deferredFetch() {
  let settle: (r: Response) => void = () => {};
  fetchMock.mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        settle = resolve;
      }),
  );
  return (r: Response) => settle(r);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const status = (qc: QueryClient) => qc.getQueryData<BookingDetail>(KEY)?.status;

describe("optimistic booking status", () => {
  it("shows an approved booking as confirmed while the request runs", async () => {
    const settle = deferredFetch();
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useApproveBooking("b1"), { wrapper });
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = result.current.mutateAsync("bk1");
    });
    await vi.waitFor(() => expect(status(queryClient)).toBe("confirmed"));
    settle(new Response(JSON.stringify({ ...detail, status: "confirmed" }), { status: 200 }));
    await act(() => done);
    expect(status(queryClient)).toBe("confirmed");
  });

  it("rolls the status back when marking fails, and still runs the caller's onError", async () => {
    const onError = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "CONFLICT", message: "Too early" } }), { status: 409 }),
    );
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useSetBookingStatus("b1", { onError }), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ id: "bk1", status: "completed" })).rejects.toThrow();
    });
    expect(status(queryClient)).toBe("pending_approval");
    expect(onError).toHaveBeenCalledOnce();
  });

  it("refetches the booking after a refused flip, so a stale status doesn't keep offering the action", async () => {
    // The customer cancelled the request meanwhile: approving is refused and the booking must show as it is now.
    stubApi({
      [`POST /v1/businesses/${BIZ}/bookings/bk1/approve`]: fail(409, "CONFLICT", "Already cancelled"),
    });
    const view = renderApiHook(() => useApproveBooking(BIZ), {
      seed: true,
      seedData: { bookingDetail: { id: "bk1", status: "pending_approval" } },
    });
    await act(async () => {
      await expect(view.result.current.mutateAsync("bk1")).rejects.toThrow("Already cancelled");
    });
    expect(view.data("bookingDetail")).toEqual({ id: "bk1", status: "pending_approval" });
    expect(view.invalidated()).toEqual(keyNames("bookingsList", "bookingsInfinite", "bookingDetail"));
  });

  it("leaves an uncached detail alone", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...detail, id: "bk2" }), { status: 200 }));
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useApproveBooking("b1"), { wrapper });
    await act(() => result.current.mutateAsync("bk2"));
    expect(queryClient.getQueryData(qk.business("b1").bookings.detail("bk2"))).toBeUndefined();
  });

  it("runs the caller's onMutate after the flip, and restores nothing it never cached", async () => {
    const api = stubApi({
      [`POST /v1/businesses/${BIZ}/bookings/bk7/approve`]: () =>
        new Response(JSON.stringify({ error: { code: "CONFLICT", message: "No" } }), { status: 409 }),
    });
    const onMutate = vi.fn();
    const view = renderApiHook(() => useApproveBooking(BIZ, { onMutate }));

    await act(async () => {
      await expect(view.result.current.mutateAsync("bk7")).rejects.toThrow("No");
    });

    expect(onMutate).toHaveBeenCalledWith("bk7", expect.anything());
    expect(api.calls).toHaveLength(1);
    expect(view.queryClient.getQueryData(qk.business(BIZ).bookings.detail("bk7"))).toBeUndefined();
  });
});

describe("booking queries", () => {
  const base = `/v1/businesses/${BIZ}`;

  it("useBookings sends the range and comma-joined statuses", async () => {
    const api = stubApi({ [`GET ${base}/bookings`]: json({ items: [], nextCursor: null }) });
    const { result } = renderApiHook(() =>
      useBookings(BIZ, { from: "2026-10-05", to: "2026-10-11", status: ["confirmed", "pending_approval"] }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.last().query).toEqual({
      from: "2026-10-05",
      to: "2026-10-11",
      status: "confirmed,pending_approval",
    });
  });

  it("useBooking GETs the detail, once both ids are set", async () => {
    const api = stubApi({ [`GET ${base}/bookings/bk1`]: json({ id: "bk1" }) });
    const { result } = renderApiHook(() => ({ detail: useBooking(BIZ, "bk1"), none: useBooking(BIZ, "") }));
    await waitFor(() => expect(result.current.detail.data).toEqual({ id: "bk1" }));
    expect(result.current.none.fetchStatus).toBe("idle");
    expect(api.calls).toHaveLength(1);
  });

  it("useStaffAvailability waits for a service and range, then includes private services", async () => {
    const api = stubApi({ [`GET ${base}/availability`]: json({ days: [] }) });
    const range = { from: "2026-10-05", to: "2026-10-11" };
    const { result } = renderApiHook(() => ({
      slots: useStaffAvailability(BIZ, { serviceId: "s1", ...range, excludeBookingId: "bk1" }),
      noService: useStaffAvailability(BIZ, { serviceId: "", ...range }),
      noEnd: useStaffAvailability(BIZ, { serviceId: "s1", from: range.from, to: "" }),
    }));
    await waitFor(() => expect(result.current.slots.isSuccess).toBe(true));
    expect(result.current.noService.fetchStatus).toBe("idle");
    expect(result.current.noEnd.fetchStatus).toBe("idle");
    expect(api.calls.map((c) => c.query)).toEqual([
      { serviceId: "s1", ...range, excludeBookingId: "bk1", includePrivate: "true" },
    ]);
  });
});

describe("booking writes", () => {
  const base = `/v1/businesses/${BIZ}`;
  const changed = { id: "bk1", status: "cancelled", start: "2026-10-08T09:00:00Z" };
  /**
   * Every booking write: lists, the detail, slots, overview, reports, customers (counts), deals (redemptions) and
   * public pages.
   */
  const refreshed = keyNames(
    "offers",
    "overview",
    "bookingsList",
    "bookingsInfinite",
    "bookingDetail",
    "customersList",
    "customersInfinite",
    "customerDetail",
    "reports",
    "staffAvailability",
    ...PUBLIC,
  );
  const cachedDetail = { id: "bk1", status: "confirmed", payments: [{ id: "p1" }] };

  it("create POSTs with the idempotency key and refreshes every booking view", async () => {
    const input = { serviceId: "s1", start: "2026-10-08T09:00:00Z" } as CreateStaffBooking;
    const api = stubApi({ [`POST ${base}/bookings`]: json({ id: "bk9", checkoutUrl: null }, 201) });
    const view = renderApiHook(() => useCreateBooking(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync({ input, idempotencyKey: "idem-1" }));

    expect(api.last().body).toEqual(input);
    expect(api.last().headers["Idempotency-Key"]).toBe("idem-1");
    expect(view.invalidated()).toEqual(refreshed);
  });

  /** Each write as a hook returning "run it", with the request it must send. */
  const writes = {
    update: {
      route: `PATCH ${base}/bookings/bk1`,
      body: { internalNotes: "Prefers mornings" },
      useRun: () => {
        const m = useUpdateBooking(BIZ);
        return () => m.mutateAsync({ id: "bk1", input: { internalNotes: "Prefers mornings" } });
      },
    },
    cancel: {
      route: `POST ${base}/bookings/bk1/cancel`,
      body: { reason: null, refund: "policy", notifyCustomer: true },
      useRun: () => {
        const m = useCancelBooking(BIZ);
        return () =>
          m.mutateAsync({ id: "bk1", input: { reason: null, refund: "policy", notifyCustomer: true } });
      },
    },
    reschedule: {
      route: `POST ${base}/bookings/bk1/reschedule`,
      body: { start: "2026-10-09T09:00:00Z", notifyCustomer: false },
      useRun: () => {
        const m = useRescheduleBooking(BIZ);
        return () =>
          m.mutateAsync({ id: "bk1", input: { start: "2026-10-09T09:00:00Z", notifyCustomer: false } });
      },
    },
  };

  it.each(["update", "cancel", "reschedule"] as const)(
    "%s sends the change, merges the result into the cached detail and refreshes every booking view",
    async (name) => {
      const { route, body, useRun } = writes[name];
      const api = stubApi({ [route]: json(changed) });
      const view = renderApiHook(useRun, { seed: true, seedData: { bookingDetail: cachedDetail } });

      await act(() => view.result.current());

      expect(api.last().body).toEqual(body);
      // The detail keeps what only it has (payments) and takes the new status/time.
      expect(view.data("bookingDetail")).toEqual({ ...cachedDetail, ...changed });
      expect(view.invalidated()).toEqual(refreshed);
    },
  );

  it.each([
    ["  Fully booked that day  ", "Fully booked that day"],
    ["   ", null],
    [undefined, null],
  ])("decline sends the reason %j as %j", async (reason, sent) => {
    const api = stubApi({ [`POST ${base}/bookings/bk1/decline`]: json(changed) });
    const view = renderApiHook(() => useDeclineBooking(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync({ id: "bk1", reason }));

    expect(api.last().body).toEqual({ reason: sent });
    expect(view.invalidated()).toEqual(refreshed);
  });

  it("marking a booking completed POSTs the status and refreshes every booking view", async () => {
    const api = stubApi({ [`POST ${base}/bookings/bk1/status`]: json({ id: "bk1", status: "completed" }) });
    const view = renderApiHook(() => useSetBookingStatus(BIZ), {
      seed: true,
      seedData: { bookingDetail: cachedDetail },
    });

    await act(() => view.result.current.mutateAsync({ id: "bk1", status: "completed" }));

    expect(api.last().body).toEqual({ status: "completed" });
    expect(view.data("bookingDetail")).toEqual({ ...cachedDetail, status: "completed" });
    expect(view.invalidated()).toEqual(refreshed);
  });

  it("marking paid in person POSTs and refreshes every booking view", async () => {
    const paid = { id: "bk1", status: "completed", paymentStatus: "paid" };
    const api = stubApi({ [`POST ${base}/bookings/bk1/paid-in-person`]: json(paid) });
    const view = renderApiHook(() => useMarkPaidInPerson(BIZ), {
      seed: true,
      seedData: { bookingDetail: cachedDetail },
    });

    await act(() => view.result.current.mutateAsync("bk1"));

    expect(api.calls).toHaveLength(1);
    expect(view.data("bookingDetail")).toEqual({ ...cachedDetail, ...paid });
    expect(view.invalidated()).toEqual(refreshed);
  });

  it("finishes once the booking's detail has refetched, without waiting for the lists", async () => {
    const range = { from: "2026-10-01", to: "2026-10-31" };
    const page = json({ items: [], nextCursor: null });
    const list = held(page);
    const api = stubApi({
      [`GET ${base}/bookings`]: sequence(page, list.reply),
      [`GET ${base}/bookings/bk1`]: json(cachedDetail),
      [`POST ${base}/bookings/bk1/status`]: json({ id: "bk1", status: "completed" }),
    });
    const view = renderApiHook(() => ({
      list: useBookings(BIZ, range),
      detail: useBooking(BIZ, "bk1"),
      mark: useSetBookingStatus(BIZ),
    }));
    await waitFor(() =>
      expect(view.result.current.list.isSuccess && view.result.current.detail.isSuccess).toBe(true),
    );

    await act(() => view.result.current.mark.mutateAsync({ id: "bk1", status: "completed" }));

    expect(api.to(`GET ${base}/bookings/bk1`)).toHaveLength(2);
    // The list's refetch is still in flight.
    expect(view.queryClient.getQueryState(qk.business(BIZ).bookings.list(range))?.fetchStatus).toBe(
      "fetching",
    );
    list.release();
    await waitFor(() => expect(view.result.current.list.isFetching).toBe(false));
    expect(api.to(`GET ${base}/bookings`)).toHaveLength(2);
  });

  it("re-sending the payment link refreshes only that booking's detail", async () => {
    const api = stubApi({ [`POST ${base}/bookings/bk1/send-payment-link`]: json({ sentTo: "a@b.test" }) });
    const view = renderApiHook(() => useSendPaymentLink(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync("bk1"));

    expect(api.calls).toHaveLength(1);
    expect(view.invalidated()).toEqual(["bookingDetail"]);
  });
});

describe("a staff booking's time was just taken", () => {
  const base = `/v1/businesses/${BIZ}`;
  const input = { serviceId: "s1", start: "2026-10-02T09:00:00+01:00" } as CreateStaffBooking;

  it("creating refreshes the free times (and nothing else), then runs the caller's onError", async () => {
    stubApi({ [`POST ${base}/bookings`]: fail(409, "SLOT_UNAVAILABLE", "Taken.") });
    const onError = vi.fn();
    const view = renderApiHook(() => useCreateBooking(BIZ, { onError }), { seed: true });
    await act(async () => {
      await expect(view.result.current.mutateAsync({ input })).rejects.toThrow("Taken.");
    });
    expect(view.invalidated()).toEqual(keyNames("staffAvailability"));
    expect(onError).toHaveBeenCalled();
  });

  it("rescheduling refreshes the free times", async () => {
    stubApi({ [`POST ${base}/bookings/bk1/reschedule`]: fail(409, "SLOT_UNAVAILABLE", "Taken.") });
    const view = renderApiHook(() => useRescheduleBooking(BIZ), { seed: true });
    await act(async () => {
      await expect(
        view.result.current.mutateAsync({
          id: "bk1",
          input: { start: "2026-10-02T09:00:00+01:00", resourceIds: null, notifyCustomer: true },
        }),
      ).rejects.toThrow("Taken.");
    });
    expect(view.invalidated()).toEqual(keyNames("staffAvailability"));
  });

  it("other failures leave the free times alone", async () => {
    stubApi({ [`POST ${base}/bookings`]: fail(422, "POLICY_VIOLATION", "Too soon.") });
    const view = renderApiHook(() => useCreateBooking(BIZ), { seed: true });
    await act(async () => {
      await expect(view.result.current.mutateAsync({ input })).rejects.toThrow("Too soon.");
    });
    expect(view.invalidated()).toEqual([]);
  });
});

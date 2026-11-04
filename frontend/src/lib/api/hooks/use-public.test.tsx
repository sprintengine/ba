import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { managedBooking } from "@/lib/booking/__tests__/fixtures";
import { qk } from "../query-keys";
import type { CreatePublicBooking } from "../types";
import {
  useCancelManagedBooking,
  useCompleteDevPayment,
  useCreatePublicBooking,
  useDevPayment,
  useManagedAvailabilityWindows,
  useManagedBooking,
  usePayManagedBooking,
  usePublicAvailabilityWindows,
  usePublicBusiness,
  usePublicServices,
  useRescheduleManagedBooking,
  useTemplate,
  useTemplates,
} from "./use-public";
import { SLUG, fail, json, keyNames, renderApiHook, stubApi, type Reply } from "./__tests__/harness";

const fetchMock = vi.fn<typeof fetch>();
const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  // A cached availability window and My bookings, to see what gets invalidated.
  const window = qk.public.availability("lumen-physio", {
    serviceId: "s1",
    from: "2026-10-01",
    to: "2026-10-31",
  });
  queryClient.setQueryData(window, { days: [] });
  queryClient.setQueryData(qk.myBookings(), { upcoming: [], past: [] });
  queryClient.setQueryData(qk.public.offers("lumen-physio"), []);
  return { queryClient, wrapper, window };
}

const body: CreatePublicBooking = {
  serviceId: "s1",
  optionId: null,
  addonIds: [],
  groupId: null,
  resourceId: null,
  start: "2026-10-08T09:00:00.000Z",
  customer: { name: "Alex Morgan", email: "alex@example.com", phone: null },
  answers: {},
  customerNotes: null,
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("useCreatePublicBooking", () => {
  it("caches the new booking for its manage page and refreshes availability and My bookings", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { customer, ...booking } = managedBooking();
    fetchMock.mockResolvedValue(
      respond(201, { booking, manageToken: "tok", next: { type: "confirmed", checkoutUrl: null } }),
    );
    const { queryClient, wrapper, window } = setup();
    const { result } = renderHook(() => useCreatePublicBooking("lumen-physio"), { wrapper });

    await act(() => result.current.mutateAsync({ body, idempotencyKey: "k1" }));

    expect(queryClient.getQueryData(qk.public.manage("tok"))).toEqual({
      ...booking,
      customer: body.customer,
    });
    expect(queryClient.getQueryState(window)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(qk.myBookings())?.isInvalidated).toBe(true);
    // The booking may have taken a capped deal's last redemption.
    expect(queryClient.getQueryState(qk.public.offers("lumen-physio"))?.isInvalidated).toBe(true);
  });

  it("doesn't wait for the shown availability to refetch before resolving", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { customer, ...booking } = managedBooking();
    const { queryClient, wrapper, window } = setup();
    // The flow's availability is on screen: its refetch never answers.
    const observer = new QueryObserver(queryClient, {
      queryKey: window,
      queryFn: () => new Promise(() => {}),
    });
    const unsubscribe = observer.subscribe(() => {});
    fetchMock.mockResolvedValue(
      respond(201, { booking, manageToken: "tok", next: { type: "confirmed", checkoutUrl: null } }),
    );
    const { result } = renderHook(() => useCreatePublicBooking("lumen-physio"), { wrapper });

    await act(() => result.current.mutateAsync({ body, idempotencyKey: "k1" }));

    expect(queryClient.getQueryState(window)?.fetchStatus).toBe("fetching");
    unsubscribe();
  });

  it("refreshes availability when the time was just taken", async () => {
    fetchMock.mockResolvedValue(respond(409, { error: { code: "SLOT_UNAVAILABLE", message: "Taken." } }));
    const { queryClient, wrapper, window } = setup();
    const onError = vi.fn();
    const { result } = renderHook(() => useCreatePublicBooking("lumen-physio", { onError }), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ body, idempotencyKey: "k1" })).rejects.toThrow("Taken.");
    });

    expect(queryClient.getQueryState(window)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(qk.myBookings())?.isInvalidated).toBe(false);
    expect(onError).toHaveBeenCalled();
  });

  it("refreshes availability and the deals when the price changed", async () => {
    fetchMock.mockResolvedValue(
      respond(409, { error: { code: "PRICE_CHANGED", message: "The price has changed to €30." } }),
    );
    const { queryClient, wrapper, window } = setup();
    const { result } = renderHook(() => useCreatePublicBooking("lumen-physio"), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ body, idempotencyKey: "k1" })).rejects.toThrow("€30");
    });

    expect(queryClient.getQueryState(window)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(qk.public.offers("lumen-physio"))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(qk.myBookings())?.isInvalidated).toBe(false);
  });

  it("leaves availability alone for other errors", async () => {
    fetchMock.mockResolvedValue(respond(429, { error: { code: "RATE_LIMITED", message: "Slow down." } }));
    const { queryClient, wrapper, window } = setup();
    const { result } = renderHook(() => useCreatePublicBooking("lumen-physio"), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ body, idempotencyKey: "k1" })).rejects.toThrow();
    });

    expect(queryClient.getQueryState(window)?.isInvalidated).toBe(false);
  });
});

const pub = `/v1/public/businesses/${SLUG}`;

describe("public pages", () => {
  it("templates, a business and its services GET the public endpoints", async () => {
    stubApi({
      "GET /v1/public/templates": json([{ key: "physio" }]),
      "GET /v1/public/templates/physio": json({ business: { name: "Physio" } }),
      [`GET ${pub}`]: json({ slug: SLUG }),
      [`GET ${pub}/services`]: json([{ id: "s1" }]),
    });
    const { result } = renderApiHook(() => ({
      templates: useTemplates(),
      template: useTemplate("physio"),
      business: usePublicBusiness(SLUG),
      services: usePublicServices(SLUG),
    }));
    await waitFor(() => expect(result.current.templates.data).toEqual([{ key: "physio" }]));
    await waitFor(() => expect(result.current.template.data).toEqual({ business: { name: "Physio" } }));
    await waitFor(() => expect(result.current.business.data).toEqual({ slug: SLUG }));
    await waitFor(() => expect(result.current.services.data).toEqual([{ id: "s1" }]));
    // Templates never change while the app runs.
    expect(result.current.templates.isStale).toBe(false);
  });

  it("nothing loads without a key, slug, token or payment id", () => {
    const api = stubApi();
    const { result } = renderApiHook(() => [
      useTemplate(""),
      usePublicBusiness(""),
      usePublicServices(""),
      useManagedBooking(""),
      useDevPayment(""),
    ]);
    expect(result.current.map((q) => q.fetchStatus)).toEqual(["idle", "idle", "idle", "idle", "idle"]);
    expect(api.calls).toHaveLength(0);
  });
});

describe("managed bookings", () => {
  const booking = { id: "bk1", status: "cancelled", business: { slug: SLUG } };
  /**
   * The manage page's slots, the business's public slots and deals (a cancellation frees a redemption) and My
   * bookings (with its reschedule slots).
   */
  const refreshed = keyNames(
    "myBookings",
    "myBookingAvailability",
    "publicAvailability",
    "publicOffers",
    "manageAvailability",
  );

  it("useManagedBooking GETs the booking by its token", async () => {
    stubApi({ "GET /v1/public/manage/tok": json(booking) });
    const { result } = renderApiHook(() => useManagedBooking("tok"));
    await waitFor(() => expect(result.current.data).toEqual(booking));
  });

  it("cancelling stores the returned booking and refreshes the slots and My bookings", async () => {
    const api = stubApi({ "POST /v1/public/manage/tok/cancel": json(booking) });
    const view = renderApiHook(() => useCancelManagedBooking("tok"), { seed: true });

    await act(() => view.result.current.mutateAsync({ reason: "Can't make it" }));

    expect(api.last().body).toEqual({ reason: "Can't make it" });
    expect(view.data("manage")).toEqual(booking);
    expect(view.invalidated()).toEqual(refreshed);
  });

  it("rescheduling stores the returned booking and refreshes the same caches", async () => {
    const moved = { ...booking, status: "confirmed", start: "2026-10-09T10:00:00Z" };
    const api = stubApi({ "POST /v1/public/manage/tok/reschedule": json(moved) });
    const view = renderApiHook(() => useRescheduleManagedBooking("tok"), { seed: true });

    await act(() => view.result.current.mutateAsync({ start: "2026-10-09T10:00:00Z" }));

    expect(api.last().body).toEqual({ start: "2026-10-09T10:00:00Z" });
    expect(view.data("manage")).toEqual(moved);
    expect(view.invalidated()).toEqual(refreshed);
  });

  it("paying resolves to a fresh checkout URL and caches nothing", async () => {
    stubApi({ "POST /v1/public/manage/tok/pay": json({ checkoutUrl: "https://pay.test/1" }) });
    const view = renderApiHook(() => usePayManagedBooking("tok"), { seed: true });

    await expect(act(() => view.result.current.mutateAsync())).resolves.toEqual({
      checkoutUrl: "https://pay.test/1",
    });
    expect(view.invalidated()).toEqual([]);
  });

  it("the dev payment page loads the payment, and completing it refreshes it", async () => {
    const api = stubApi({
      "GET /v1/public/dev-payments/p1": json({ payment: { id: "p1" } }),
      "POST /v1/public/dev-payments/p1/complete": json({ redirectUrl: "/manage/tok" }),
    });
    const query = renderApiHook(() => useDevPayment("p1"));
    await waitFor(() => expect(query.result.current.data).toEqual({ payment: { id: "p1" } }));

    const view = renderApiHook(() => useCompleteDevPayment("p1"), { seed: true });
    await act(() => view.result.current.mutateAsync("succeeded"));

    expect(api.last().body).toEqual({ outcome: "succeeded" });
    expect(view.invalidated()).toEqual(["devPayment"]);
  });
});

describe("availability windows", () => {
  const windows = [
    { from: "2026-10-01", to: "2026-10-31" },
    { from: "2026-11-01", to: "2026-11-30" },
  ];
  /** One slot on each window's first day. */
  const firstDay: Reply = (call) =>
    json({ days: [{ date: call.query.from, slots: [{ start: `${call.query.from}T09:00:00Z` }] }] })(call);

  it("public windows load one request per window with the service query, merged by date", async () => {
    const api = stubApi({ [`GET ${pub}/availability`]: firstDay });
    const { result } = renderApiHook(() =>
      usePublicAvailabilityWindows(SLUG, { serviceId: "s1", addonIds: ["a1"] }, windows),
    );

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(api.calls.map((c) => c.query)).toEqual([
      { serviceId: "s1", addonIds: "a1", ...windows[0] },
      { serviceId: "s1", addonIds: "a1", ...windows[1] },
    ]);
    expect([...result.current.days.keys()]).toEqual(["2026-10-01", "2026-11-01"]);
    expect(result.current.days.get("2026-11-01")).toEqual([{ start: "2026-11-01T09:00:00Z" }]);
    expect(result.current.loaded("2026-10-31")).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("public windows wait for a service, without counting as loading", () => {
    const api = stubApi({ [`GET ${pub}/availability`]: firstDay });
    const { result } = renderApiHook(() => usePublicAvailabilityWindows(SLUG, { serviceId: "" }, windows));
    expect(result.current.isPending).toBe(false);
    expect(result.current.loaded("2026-10-01")).toBe(false);
    expect(api.calls).toHaveLength(0);
  });

  it("a failed window reports its error, keeps the others, and refetch retries it", async () => {
    let novemberFailures = 1;
    const api = stubApi({
      "GET /v1/public/manage/tok/availability": (call) =>
        call.query.from === "2026-11-01" && novemberFailures-- > 0
          ? fail(503, "DATABASE_UNAVAILABLE", "Down")(call)
          : firstDay(call),
    });
    const { result } = renderApiHook(() => useManagedAvailabilityWindows("tok", windows));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe("DATABASE_UNAVAILABLE");
    expect(result.current.loaded("2026-10-15")).toBe(true);
    expect(result.current.loaded("2026-11-15")).toBe(false);

    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.isError).toBe(false));
    expect(result.current.loaded("2026-11-15")).toBe(true);
    expect(api.calls.map((c) => c.query)).toEqual([...windows, ...windows]);
  });

  it("managed windows wait for a token", () => {
    const api = stubApi();
    const { result } = renderApiHook(() => useManagedAvailabilityWindows("", windows));
    expect(result.current.isFetching).toBe(false);
    expect(api.calls).toHaveLength(0);
  });
});

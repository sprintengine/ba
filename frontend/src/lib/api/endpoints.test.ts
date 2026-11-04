import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assistantApi } from "./assistant";
import { auditApi } from "./audit";
import { bookingsApi } from "./bookings";
import { businessApi } from "./business";
import { customersApi } from "./customers";
import { meApi } from "./me";
import { notificationsApi } from "./notifications";
import { onboardingApi } from "./onboarding";
import { publicApi } from "./public";
import { qk } from "./query-keys";
import { resourcesApi } from "./resources";
import { servicesApi } from "./services";
import { siteApi } from "./site";
import type { CreatePublicBooking, OfferInput, ServiceInput } from "./types";

const fetchMock = vi.fn<typeof fetch>();

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  const parsed = new URL(String(url), "http://localhost");
  return {
    method: init!.method,
    path: parsed.pathname,
    query: Object.fromEntries(parsed.searchParams),
    headers: init!.headers as Record<string, string>,
    body: init!.body === undefined ? undefined : JSON.parse(init!.body as string),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const BIZ = "b-1";

describe("endpoint modules", () => {
  it("publicApi.availability sends the query with comma-joined addonIds", async () => {
    await publicApi.availability("my shop", {
      serviceId: "s1",
      optionId: null,
      addonIds: ["a1", "a2"],
      from: "2026-10-01",
      to: "2026-10-07",
    });
    expect(lastCall()).toMatchObject({
      method: "GET",
      path: "/api/v1/public/businesses/my%20shop/availability",
      query: { serviceId: "s1", addonIds: "a1,a2", from: "2026-10-01", to: "2026-10-07" },
    });
  });

  it("publicApi.createBooking POSTs with the Idempotency-Key", async () => {
    const body = { serviceId: "s1", start: "2026-10-01T09:00:00+01:00" } as CreatePublicBooking;
    await publicApi.createBooking("salon", body, "idem-1");
    const call = lastCall();
    expect(call).toMatchObject({ method: "POST", path: "/api/v1/public/businesses/salon/bookings", body });
    expect(call.headers["Idempotency-Key"]).toBe("idem-1");
  });

  it("publicApi.completeDevPayment posts the outcome", async () => {
    await publicApi.completeDevPayment("p1", "succeeded");
    expect(lastCall()).toMatchObject({
      method: "POST",
      path: "/api/v1/public/dev-payments/p1/complete",
      body: { outcome: "succeeded" },
    });
  });

  it("meApi booking availability and pay use the signed-in booking paths", async () => {
    await meApi.bookingAvailability("bk1", { from: "2026-10-01", to: "2026-10-31" });
    expect(lastCall()).toMatchObject({
      method: "GET",
      path: "/api/v1/me/bookings/bk1/availability",
      query: { from: "2026-10-01", to: "2026-10-31" },
    });
    await meApi.payBooking("bk1");
    expect(lastCall()).toMatchObject({ method: "POST", path: "/api/v1/me/bookings/bk1/pay" });
  });

  it("bookingsApi sends the decline reason, payment link and reschedule availability", async () => {
    await bookingsApi.decline(BIZ, "bk1", { reason: "Fully booked" });
    expect(lastCall()).toMatchObject({
      method: "POST",
      path: `/api/v1/businesses/${BIZ}/bookings/bk1/decline`,
      body: { reason: "Fully booked" },
    });
    await bookingsApi.sendPaymentLink(BIZ, "bk1");
    expect(lastCall()).toMatchObject({
      method: "POST",
      path: `/api/v1/businesses/${BIZ}/bookings/bk1/send-payment-link`,
    });
    await bookingsApi.availability(BIZ, {
      serviceId: "s1",
      excludeBookingId: "bk1",
      from: "2026-10-01",
      to: "2026-10-07",
    });
    expect(lastCall().query).toMatchObject({
      serviceId: "s1",
      excludeBookingId: "bk1",
      includePrivate: "true",
    });
    await bookingsApi.availability(BIZ, {
      serviceId: "s1",
      excludeBookingId: null,
      from: "2026-10-01",
      to: "2026-10-07",
    });
    expect(lastCall().query).not.toHaveProperty("excludeBookingId");
  });

  it("meApi.cancelBooking and acceptInvitation use the right paths", async () => {
    await meApi.cancelBooking("bk1", { reason: "ill" });
    expect(lastCall()).toMatchObject({
      method: "POST",
      path: "/api/v1/me/bookings/bk1/cancel",
      body: { reason: "ill" },
    });
    await meApi.acceptInvitation("t/1");
    expect(lastCall()).toMatchObject({ method: "POST", path: "/api/v1/invitations/t%2F1/accept" });
  });

  it("notificationsApi registers a push device and unregisters it by token, in the body", async () => {
    const input = { token: "ExponentPushToken[abc]", platform: "ios", appVariant: "production" } as const;
    await notificationsApi.registerPushDevice(input);
    expect(lastCall()).toMatchObject({ method: "POST", path: "/api/v1/me/push-devices", body: input });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(notificationsApi.unregisterPushDevice("ExponentPushToken[abc]")).resolves.toBeUndefined();
    expect(lastCall()).toMatchObject({
      method: "DELETE",
      path: "/api/v1/me/push-devices",
      headers: { "Content-Type": "application/json" },
      body: { token: "ExponentPushToken[abc]" },
    });
  });

  it("onboardingApi.slugAvailable passes the slug as a query param", async () => {
    await onboardingApi.slugAvailable("acme");
    expect(lastCall()).toMatchObject({
      method: "GET",
      path: "/api/v1/businesses/slug-available",
      query: { slug: "acme" },
    });
  });

  it("businessApi.getBySlug reads the business at its slug, as by id", async () => {
    await businessApi.getBySlug("lumen physio");
    expect(lastCall()).toMatchObject({ method: "GET", path: "/api/v1/businesses/lumen%20physio" });
  });

  it("businessApi.update PATCHes the business root", async () => {
    await businessApi.update(BIZ, { name: "New name" });
    expect(lastCall()).toMatchObject({
      method: "PATCH",
      path: `/api/v1/businesses/${BIZ}`,
      body: { name: "New name" },
    });
  });

  it("servicesApi.replace PUTs the full service", async () => {
    const input = { name: "Wash" } as ServiceInput;
    await servicesApi.replace(BIZ, "svc 1", input);
    expect(lastCall()).toMatchObject({
      method: "PUT",
      path: `/api/v1/businesses/${BIZ}/services/svc%201`,
      body: input,
    });
  });

  it("resourcesApi.replaceRules wraps rules and deleteOverride uses the business-level path", async () => {
    await resourcesApi.replaceRules(BIZ, "r1", []);
    expect(lastCall()).toMatchObject({
      method: "PUT",
      path: `/api/v1/businesses/${BIZ}/resources/r1/rules`,
      body: { rules: [] },
    });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await resourcesApi.deleteOverride(BIZ, "o1");
    expect(lastCall()).toMatchObject({ method: "DELETE", path: `/api/v1/businesses/${BIZ}/overrides/o1` });
  });

  it("bookingsApi.list comma-joins statuses", async () => {
    await bookingsApi.list(BIZ, { from: "2026-10-01", status: ["confirmed", "held"], cursor: null });
    expect(lastCall()).toMatchObject({
      method: "GET",
      path: `/api/v1/businesses/${BIZ}/bookings`,
      query: { from: "2026-10-01", status: "confirmed,held" },
    });
  });

  it("bookingsApi.cancel POSTs the cancel body", async () => {
    await bookingsApi.cancel(BIZ, "bk1", { refund: "full", notifyCustomer: true, reason: "Closed" });
    expect(lastCall()).toMatchObject({
      method: "POST",
      path: `/api/v1/businesses/${BIZ}/bookings/bk1/cancel`,
      body: { refund: "full", notifyCustomer: true, reason: "Closed" },
    });
  });

  it("bookingsApi.setStatus posts the status", async () => {
    await bookingsApi.setStatus(BIZ, "bk1", "no_show");
    expect(lastCall()).toMatchObject({
      path: `/api/v1/businesses/${BIZ}/bookings/bk1/status`,
      body: { status: "no_show" },
    });
  });

  it("bookingsApi.availability defaults includePrivate to true", async () => {
    await bookingsApi.availability(BIZ, { serviceId: "s1", from: "2026-10-01", to: "2026-10-02" });
    expect(lastCall().query).toMatchObject({ includePrivate: "true", serviceId: "s1" });
    await bookingsApi.availability(BIZ, {
      serviceId: "s1",
      from: "2026-10-01",
      to: "2026-10-02",
      includePrivate: false,
    });
    expect(lastCall().query.includePrivate).toBe("false");
  });

  it("customersApi.erase DELETEs and export GETs", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await customersApi.erase(BIZ, "c1");
    expect(lastCall()).toMatchObject({ method: "DELETE", path: `/api/v1/businesses/${BIZ}/customers/c1` });
    await customersApi.export(BIZ, "c1");
    expect(lastCall()).toMatchObject({
      method: "GET",
      path: `/api/v1/businesses/${BIZ}/customers/c1/export`,
    });
  });

  it("auditApi.list GETs the audit log with its filter and cursor", async () => {
    await auditApi.list(BIZ, { entityId: "bk1", limit: 20, cursor: "c2" });
    expect(lastCall()).toMatchObject({
      method: "GET",
      path: `/api/v1/businesses/${BIZ}/audit`,
      query: { entityId: "bk1", limit: "20", cursor: "c2" },
    });
  });

  it("assistantApi.deleteThread DELETEs the thread", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await assistantApi.deleteThread(BIZ, "t 1");
    expect(lastCall()).toMatchObject({
      method: "DELETE",
      path: `/api/v1/businesses/${BIZ}/assistant/threads/t%201`,
    });
  });

  it("siteApi.version GETs one version", async () => {
    await siteApi.version(BIZ, 7);
    expect(lastCall()).toMatchObject({ method: "GET", path: `/api/v1/businesses/${BIZ}/site/versions/7` });
  });

  it("assistantApi.threads and publicApi.health GET their paths", async () => {
    await assistantApi.threads(BIZ);
    expect(lastCall()).toMatchObject({ method: "GET", path: `/api/v1/businesses/${BIZ}/assistant/threads` });
    await publicApi.health();
    expect(lastCall()).toMatchObject({ method: "GET", path: "/api/v1/health" });
  });

  it("assistantApi.send streams the message and yields only valid turn events", async () => {
    const frames = [
      'event: text\ndata: {"type":"text","delta":"Hi"}\n\n',
      "data: not json\n\n",
      'data: {"type":"mystery","x":1}\n\n',
      'data: {"type":"text"}\n\n',
      'data: {"type":"error","code":"AI_LIMIT_REACHED","message":"Out of credits"}\n\n',
    ];
    fetchMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const frame of frames) controller.enqueue(new TextEncoder().encode(frame));
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );

    const events = [];
    for await (const event of assistantApi.send(BIZ, "t 1", "Hello")) events.push(event);

    expect(lastCall()).toMatchObject({
      method: "POST",
      path: `/api/v1/businesses/${BIZ}/assistant/threads/t%201/messages`,
      body: { text: "Hello" },
    });
    expect(events).toEqual([
      { type: "text", delta: "Hi" },
      { type: "error", code: "AI_LIMIT_REACHED", message: "Out of credits" },
    ]);
  });
});

describe("query keys", () => {
  it("scopes every business key under the business root", () => {
    const b = qk.business(BIZ);
    const root = b.root();
    const keys = [
      b.detail(),
      b.overview(),
      b.bookings.all(),
      b.bookings.list({ from: "x" }),
      b.bookings.infinite(),
      b.bookings.detail("bk1"),
      b.customers.detail("c1"),
      b.services(),
      b.resourceAvailability("r1"),
      b.reports({ from: "a", to: "b" }),
      b.availability({ serviceId: "s", from: "a", to: "b" }),
    ];
    for (const key of keys) expect(key.slice(0, root.length)).toEqual([...root]);
    expect(b.bookings.detail("bk1").slice(0, 3)).toEqual([...b.bookings.all()]);
    expect(b.resourceAvailability("r1").slice(0, 3)).toEqual([...b.resources()]);
    const threads = b.assistantThreads();
    expect(b.assistantThread("t1").slice(0, threads.length)).toEqual([...threads]);
    expect(threads.slice(0, b.assistant().length)).toEqual([...b.assistant()]);
  });

  it("nests the keys that partial invalidation relies on", () => {
    const b = qk.business(BIZ);
    const range = { from: "2026-10-01", to: "2026-10-31" };
    const startsWith = (key: readonly unknown[], prefix: readonly unknown[]) =>
      expect(key.slice(0, prefix.length)).toEqual([...prefix]);

    expect(qk.health()).toEqual(["health"]);
    startsWith(qk.myBookingAvailability("bk1", range), qk.myBookings());
    startsWith(qk.public.availability("s", { serviceId: "x", ...range }), qk.public.availabilityAll("s"));
    startsWith(qk.public.availabilityAll("s"), qk.public.business("s"));
    startsWith(qk.public.manageAvailability("t", range), qk.public.manageAvailabilityAll("t"));
    startsWith(qk.public.manageAvailabilityAll("t"), qk.public.manage("t"));
    startsWith(qk.public.offers("s"), qk.public.business("s"));
    startsWith(qk.marketplace.search({ city: "cork" }), qk.marketplace.all());
    startsWith(b.siteVersions(), b.site());
    startsWith(b.availability({ serviceId: "x", ...range }), b.availabilityAll());
    // A preview is under the offers list, so changing an offer refreshes its preview too.
    startsWith(b.offerPreview({ offer: {} as OfferInput, days: 7 }), b.offers());
    // Reports for any range are refreshed together.
    startsWith(b.reports(range), b.reportsAll());
  });
});

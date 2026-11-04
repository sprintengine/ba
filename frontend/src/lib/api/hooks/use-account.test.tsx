/** The signed-in user's own data: me, my bookings, invitations, onboarding and connected apps (OAuth). */
import { QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthorizeRequest, BusinessSetup } from "../types";
import {
  useAcceptInvitation,
  useCancelMyBooking,
  useMe,
  useMyBookingAvailabilityWindows,
  useMyBookings,
  usePayMyBooking,
  useRescheduleMyBooking,
} from "./use-me";
import {
  useAuthorizeCheck,
  useAuthorizeDecision,
  useConnectedApps,
  useRevokeConnectedApp,
} from "./use-oauth";
import { useAiBusinessDraft, useCreateBusiness, useSlugAvailability } from "./use-onboarding";
import { SLUG, fail, json, noContent, renderApiHook, stubApi } from "./__tests__/harness";

afterEach(() => vi.unstubAllGlobals());

const myBooking = { id: "bk1", business: { id: "b1", slug: SLUG } };

describe("me", () => {
  it("useMe and useMyBookings GET the signed-in user's data", async () => {
    stubApi({
      "GET /v1/me": json({ user: { id: "u1" } }),
      "GET /v1/me/bookings": json({ upcoming: [], past: [] }),
    });
    const { result } = renderApiHook(() => ({ me: useMe(), bookings: useMyBookings() }));
    await waitFor(() => expect(result.current.me.data).toEqual({ user: { id: "u1" } }));
    await waitFor(() => expect(result.current.bookings.data).toEqual({ upcoming: [], past: [] }));
  });

  it("cancelling one of my bookings refreshes my bookings and that business's public availability", async () => {
    const api = stubApi({ "POST /v1/me/bookings/bk1/cancel": json(myBooking) });
    const view = renderApiHook(() => useCancelMyBooking(), { seed: true });

    await act(() => view.result.current.mutateAsync({ id: "bk1", input: { reason: "Ill" } }));

    expect(api.last().body).toEqual({ reason: "Ill" });
    expect(view.invalidated()).toEqual([
      "myBookings",
      "myBookingAvailability",
      "publicAvailability",
      "publicOffers",
    ]);
  });

  it("cancelling without a reason sends an empty body", async () => {
    const api = stubApi({ "POST /v1/me/bookings/bk1/cancel": json(myBooking) });
    const view = renderApiHook(() => useCancelMyBooking());
    await act(() => view.result.current.mutateAsync({ id: "bk1" }));
    expect(api.last().body).toEqual({});
  });

  it("rescheduling one of my bookings refreshes the same caches", async () => {
    const input = { start: "2026-10-09T10:00:00.000Z" };
    const api = stubApi({ "POST /v1/me/bookings/bk1/reschedule": json(myBooking) });
    const view = renderApiHook(() => useRescheduleMyBooking(), { seed: true });

    await act(() => view.result.current.mutateAsync({ id: "bk1", input }));

    expect(api.last().body).toEqual(input);
    expect(view.invalidated()).toEqual([
      "myBookings",
      "myBookingAvailability",
      "publicAvailability",
      "publicOffers",
    ]);
  });

  it("paying for a held booking resolves to the checkout URL and caches nothing", async () => {
    stubApi({ "POST /v1/me/bookings/bk1/pay": json({ checkoutUrl: "https://pay.test/x" }) });
    const view = renderApiHook(() => usePayMyBooking(), { seed: true });

    await expect(act(() => view.result.current.mutateAsync("bk1"))).resolves.toEqual({
      checkoutUrl: "https://pay.test/x",
    });
    expect(view.invalidated()).toEqual([]);
  });

  it("accepting an invitation stores the returned me", async () => {
    const me = { user: { id: "u1" }, memberships: [{ businessId: "b9" }] };
    stubApi({ "POST /v1/invitations/inv%201/accept": json(me) });
    const view = renderApiHook(() => useAcceptInvitation(), { seed: true });

    await act(() => view.result.current.mutateAsync("inv 1"));

    expect(view.data("me")).toEqual(me);
  });

  it("reschedule slots for my booking merge several windows", async () => {
    const windows = [
      { from: "2026-10-01", to: "2026-10-31" },
      { from: "2026-11-01", to: "2026-11-30" },
    ];
    const api = stubApi({
      "GET /v1/me/bookings/bk1/availability": (call) =>
        json({
          days: [{ date: call.query.from, slots: [{ start: `${call.query.from}T09:00:00Z` }] }],
        })(call),
    });
    const { result } = renderApiHook(() => useMyBookingAvailabilityWindows("bk1", windows));

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(api.calls.map((c) => c.query)).toEqual(windows);
    expect([...result.current.days.keys()]).toEqual(["2026-10-01", "2026-11-01"]);
    expect(result.current.loaded("2026-11-15")).toBe(true);
    expect(result.current.loaded("2026-12-01")).toBe(false);
  });

  it("reschedule slots wait until enabled", () => {
    const api = stubApi();
    const { result } = renderApiHook(() =>
      useMyBookingAvailabilityWindows("bk1", [{ from: "2026-10-01", to: "2026-10-31" }], false),
    );
    expect(result.current.isPending).toBe(false);
    expect(api.calls).toHaveLength(0);
  });
});

describe("onboarding", () => {
  it("useSlugAvailability asks about the slug, and waits for one", async () => {
    const api = stubApi({ "GET /v1/businesses/slug-available": json({ available: true }) });
    const { result } = renderApiHook(() => ({
      slug: useSlugAvailability("lumen"),
      empty: useSlugAvailability(""),
    }));
    await waitFor(() => expect(result.current.slug.data).toEqual({ available: true }));
    expect(result.current.empty.fetchStatus).toBe("idle");
    expect(api.calls.map((c) => c.query)).toEqual([{ slug: "lumen" }]);
  });

  it("creating a business stores it and refreshes me (the new membership)", async () => {
    const setup = { business: { name: "Lumen" } } as unknown as BusinessSetup;
    const api = stubApi({ "POST /v1/businesses": json({ id: "b9", name: "Lumen" }) });
    const view = renderApiHook(() => useCreateBusiness(), { seed: true });

    await act(() => view.result.current.mutateAsync(setup));

    expect(api.last().body).toEqual(setup);
    expect(view.queryClient.getQueryData(["business", "b9", "detail"])).toEqual({ id: "b9", name: "Lumen" });
    expect(view.invalidated()).toEqual(["me"]);
  });

  it("an AI draft is returned for review and nothing is cached", async () => {
    const api = stubApi({ "POST /v1/ai/business-draft": json({ source: "template" }) });
    const view = renderApiHook(() => useAiBusinessDraft(), { seed: true });

    await act(() => view.result.current.mutateAsync({ description: "A physio clinic" }));

    expect(api.last().body).toEqual({ description: "A physio clinic" });
    expect(view.invalidated()).toEqual([]);
  });
});

describe("OAuth consent and connected apps", () => {
  const request: AuthorizeRequest = {
    clientId: "client-1",
    redirectUri: "http://127.0.0.1:5000/cb",
    responseType: "code",
    codeChallenge: "abc",
    codeChallengeMethod: "S256",
    scope: "bookings:read",
    state: "xyz",
    resource: null,
  };

  it("checks the request with snake_case parameters, dropping empty ones", async () => {
    const api = stubApi({ "GET /v1/oauth/authorize": json({ client: { clientId: "client-1" } }) });
    const { result } = renderApiHook(() => useAuthorizeCheck(request));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.last().query).toEqual({
      client_id: "client-1",
      redirect_uri: "http://127.0.0.1:5000/cb",
      response_type: "code",
      code_challenge: "abc",
      code_challenge_method: "S256",
      scope: "bookings:read",
      state: "xyz",
    });
  });

  it("does not check a request without a client id", () => {
    const api = stubApi();
    const { result } = renderApiHook(() => useAuthorizeCheck({ ...request, clientId: null }));
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.calls).toHaveLength(0);
  });

  it("never retries a failed check, even when the client defaults would", async () => {
    const api = stubApi({ "GET /v1/oauth/authorize": fail(400, "INVALID_REQUEST", "Bad redirect") });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 0 } } });
    const view = renderApiHook(() => useAuthorizeCheck(request), { queryClient });
    await waitFor(() => expect(view.result.current.isError).toBe(true));
    expect(api.calls).toHaveLength(1);
  });

  it("a decision resolves to the redirect and refreshes the connected apps", async () => {
    const api = stubApi({
      "POST /v1/oauth/authorize": json({ redirectTo: "http://127.0.0.1:5000/cb?code=1" }),
    });
    const view = renderApiHook(() => useAuthorizeDecision(), { seed: true });

    const decision = { request, approve: true };
    await expect(act(() => view.result.current.mutateAsync(decision))).resolves.toEqual({
      redirectTo: "http://127.0.0.1:5000/cb?code=1",
    });
    expect(api.last().body).toEqual(decision);
    expect(view.invalidated()).toEqual(["connectedApps"]);
  });

  it("lists connected apps, and revoking one drops it and refreshes the list", async () => {
    stubApi({
      "GET /v1/me/connected-apps": json([{ id: "g1" }, { id: "g2" }]),
      "DELETE /v1/me/connected-apps/g1": noContent,
    });
    const list = renderApiHook(() => useConnectedApps());
    await waitFor(() => expect(list.result.current.data).toHaveLength(2));

    const view = renderApiHook(() => useRevokeConnectedApp(), {
      seed: true,
      seedData: { connectedApps: [{ id: "g1" }, { id: "g2" }] },
    });
    await act(() => view.result.current.mutateAsync("g1"));

    expect(view.data("connectedApps")).toEqual([{ id: "g2" }]);
    expect(view.invalidated()).toEqual(["connectedApps"]);
  });
});

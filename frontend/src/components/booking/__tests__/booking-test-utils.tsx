/**
 * Shared helpers for the customer-side booking tests: a provider wrapper, a fetch stub that sees query strings,
 * availability and booking builders, and API error responses. Fixture data lives in `lib/booking/__tests__`.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import type {
  Availability,
  CustomerBooking,
  ManagedBooking,
  Slot,
  SlotOffer,
  Vocabulary,
} from "@/lib/api/types";
import { managedBooking } from "@/lib/booking/__tests__/fixtures";
import { addDaysToPlainDate, zonedToIso, type PlainDate } from "@/lib/format";
import { VocabularyProvider } from "@/lib/vocabulary";
import { TooltipProvider } from "@/components/ui/tooltip";

export const TZ = "Europe/Dublin";
/** Thursday 1 October 2026, 10:00 in Dublin: "now" in every test that pins the clock. */
export const NOW = "2026-10-01T09:00:00Z";

/** Pins `Date` only (so userEvent's timers stay real) to [NOW]. Call in `beforeEach`; undo with `vi.useRealTimers()`. */
export function pinNow(iso: string = NOW) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

export function renderWithProviders(
  ui: React.ReactElement,
  { vocabulary }: { vocabulary?: Vocabulary } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = (
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>
  );
  return {
    client,
    ...render(vocabulary ? <VocabularyProvider vocabulary={vocabulary}>{tree}</VocabularyProvider> : tree),
  };
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** An API error response (`{ error: { code, message, fields } }`). */
export const apiError = (
  status: number,
  code: string,
  message: string,
  fields: Record<string, string> = {},
) => json({ error: { code, message, fields } }, status);

export type ApiRequest = {
  method: string;
  /** Path without the `/api` prefix, e.g. `/v1/me/bookings`. */
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
};

/**
 * Stubs `fetch` with a router that sees the query string (for availability windows). Return a `Response` for
 * errors, anything else is sent as JSON; `undefined` is a 404. Returns every request, in order.
 */
export function stubApi(route: (req: ApiRequest) => unknown) {
  const requests: ApiRequest[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const req: ApiRequest = {
      method: init?.method ?? "GET",
      path: url.pathname.replace(/^\/api/, ""),
      query: url.searchParams,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    };
    requests.push(req);
    // A promise is awaited, so one that never settles keeps the request loading.
    const result = await route(req);
    if (result instanceof Response) return result;
    if (result === undefined) return apiError(404, "NOT_FOUND", `No route for ${req.method} ${req.path}`);
    return json(result);
  });
  vi.stubGlobal("fetch", fetchMock);
  return requests;
}

/** "GET /v1/me/bookings" for each request. */
export const calls = (requests: ApiRequest[]) => requests.map((r) => `${r.method} ${r.path}`);

/** A slot at `time` (business wall clock) on `date`. */
export function slotAt(
  date: PlainDate,
  time: string,
  {
    minutes = 60,
    offer = null,
    seatsLeft = null,
  }: { minutes?: number; offer?: SlotOffer | null; seatsLeft?: number | null } = {},
): Slot {
  const start = zonedToIso(date, time, TZ);
  const end = new Date(new Date(start).getTime() + minutes * 60_000).toISOString();
  return { start, end, resourceIds: ["r1"], seatsLeft, offer };
}

/**
 * The availability response for a request's `from`..`to`: `slotsOn(date)` for each day (default one slot at
 * 10:00 every day).
 */
export function availabilityFor(
  query: URLSearchParams,
  slotsOn: (date: PlainDate) => Slot[] = (d) => [slotAt(d, "10:00")],
): Availability {
  const from = query.get("from") ?? "";
  const to = query.get("to") ?? "";
  const days: Availability["days"] = [];
  for (let d = from; d && d <= to; d = addDaysToPlainDate(d, 1))
    days.push({ date: d, slots: slotsOn(d), opensAt: null, held: false });
  return { timezone: TZ, from, to, durationMinutes: 60, days, nextAvailableOnly: false };
}

/**
 * The availability response of a business that offers its next available time only: like [availabilityFor],
 * cut to the first slot starting after the request's `after` (none: the first in the range), as the server does.
 */
export function nextOnlyAvailabilityFor(
  query: URLSearchParams,
  slotsOn: (date: PlainDate) => Slot[] = (d) => [slotAt(d, "10:00")],
): Availability {
  const all = availabilityFor(query, slotsOn);
  const after = query.get("after");
  const first = all.days
    .flatMap((d) => d.slots)
    .find((s) => !after || new Date(s.start).getTime() > new Date(after).getTime());
  const days = all.days.map((d) => ({ ...d, slots: d.slots.filter((s) => s === first) }));
  return { ...all, days, nextAvailableOnly: true };
}

/** A booking as My bookings lists it (a managed booking without the customer). */
export function customerBooking(patch: Partial<CustomerBooking> = {}): CustomerBooking {
  const rest: Partial<ManagedBooking> = { ...managedBooking() };
  delete rest.customer;
  return { ...(rest as CustomerBooking), ...patch };
}

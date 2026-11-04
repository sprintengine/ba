/**
 * Test support for the API hooks: a routed `fetch` stub that records every request, a QueryClient seeded with one
 * query per key family (so a test can assert exactly which caches a mutation invalidated, wrote or removed), and
 * `renderApiHook` to render a hook against it.
 */
import { QueryClient, QueryClientProvider, type QueryKey } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { must } from "@/test/must";
import { qk } from "../../query-keys";

/** One recorded request. `path` has no `/api` prefix and no query string. */
export type Call = {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  /** Parsed JSON, a FormData as sent, or undefined. */
  body: unknown;
};

/** Answers a routed request; called once per request, so each gets a fresh Response. */
export type Reply = (call: Call) => Response | Promise<Response>;

export const json =
  (body: unknown, status = 200): Reply =>
  () =>
    new Response(JSON.stringify(body), { status });

export const noContent: Reply = () => new Response(null, { status: 204 });

/** The backend's error envelope. */
export const fail =
  (status: number, code: string, message = code, fields: Record<string, string> = {}): Reply =>
  () =>
    new Response(JSON.stringify({ error: { code, message, fields } }), { status });

/** A reply that waits for `release()` (to observe what happens while a request is in flight). */
export function held(reply: Reply) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const heldReply: Reply = async (call) => {
    await gate;
    return reply(call);
  };
  return { reply: heldReply, release: () => release() };
}

/** Answers the n-th request with the n-th reply (the last one repeats). */
export function sequence(...replies: Reply[]): Reply {
  let index = 0;
  return (call) => must(replies[Math.min(index++, replies.length - 1)], "a reply")(call);
}

/**
 * Stubs global `fetch` with a router keyed `"METHOD /path"` (e.g. `"GET /v1/businesses/b1/team"`). An unrouted
 * request answers 501 with a message naming it, so the test fails with that message.
 */
export function stubApi(routes: Record<string, Reply> = {}) {
  const calls: Call[] = [];
  const table = new Map(Object.entries(routes));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const call: Call = {
        method: init?.method ?? "GET",
        path: url.pathname.replace(/^\/api/, ""),
        query: Object.fromEntries(url.searchParams),
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : (init?.body ?? undefined),
      };
      calls.push(call);
      const reply = table.get(`${call.method} ${call.path}`);
      if (reply) return reply(call);
      const message = `Unrouted request: ${call.method} ${call.path}`;
      return new Response(JSON.stringify({ error: { code: "UNROUTED", message } }), { status: 501 });
    }),
  );
  return {
    calls,
    route: (key: string, reply: Reply) => void table.set(key, reply),
    /** The requests to `"METHOD /path"`. */
    to: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key),
    last: () => must(calls.at(-1), "a request"),
  };
}

export const BIZ = "b1";
export const SLUG = "lumen-physio";
const b = qk.business(BIZ);
const range = { from: "2026-10-01", to: "2026-10-31" };
const slots = { serviceId: "s1", ...range };

/** One cached query per key family of business `b1` (plus a few outside it), named for assertions. */
export const KEYS = {
  detail: b.detail(),
  overview: b.overview(),
  bookingsList: b.bookings.list(range),
  bookingsInfinite: b.bookings.infinite({ status: "confirmed" }),
  bookingDetail: b.bookings.detail("bk1"),
  customersList: b.customers.list({ q: "al" }),
  customersInfinite: b.customers.infinite(),
  customerDetail: b.customers.detail("c1"),
  services: b.services(),
  resources: b.resources(),
  resourceAvailability: b.resourceAvailability("r1"),
  closures: b.closures(),
  customerGroups: b.customerGroups(),
  questions: b.questions(),
  team: b.team(),
  reports: b.reports(range),
  payments: b.payments(),
  billing: b.billing(),
  aiUsage: b.aiUsage(),
  assistant: b.assistant(),
  assistantThread: b.assistantThread("t1"),
  assistantMemory: b.assistantMemory(),
  site: b.site(),
  siteVersions: b.siteVersions(),
  stock: b.stock("beach", 1),
  staffAvailability: b.availability(slots),
  offers: b.offers(),
  marketplaceSettings: b.marketplace(),
  otherBusiness: qk.business("b2").detail(),
  me: qk.me(),
  myBookings: qk.myBookings(),
  myBookingAvailability: qk.myBookingAvailability("bk1", range),
  templates: qk.templates.all(),
  publicServices: qk.public.services(SLUG),
  publicAvailability: qk.public.availability(SLUG, slots),
  otherPublicAvailability: qk.public.availability("other-shop", slots),
  publicOffers: qk.public.offers(SLUG),
  manage: qk.public.manage("tok"),
  manageAvailability: qk.public.manageAvailability("tok", range),
  devPayment: qk.public.devPayment("p1"),
  marketplaceMeta: qk.marketplace.meta(),
  marketplaceSearch: qk.marketplace.search({ city: "cork" }),
  connectedApps: qk.connectedApps(),
  slugAvailable: qk.onboarding.slugAvailable("lumen"),
} satisfies Record<string, QueryKey>;

export type KeyName = keyof typeof KEYS;
const NAMES = Object.keys(KEYS) as KeyName[];

/** The seeded keys under `qk.public.all()` (every public page and manage link) and `qk.marketplace.all()`. */
export const PUBLIC = NAMES.filter((name) => KEYS[name][0] === "public");
export const MARKETPLACE = NAMES.filter((name) => KEYS[name][0] === "marketplace");
/** The seeded keys of business `b1` (everything under `qk.business("b1").root()`). */
export const BUSINESS = NAMES.filter((name) => KEYS[name][0] === "business" && KEYS[name][1] === BIZ);

/** Cached arrays (so list updaters have something to map), the assistant state with nudges, else an object. */
const LIST_KEYS = new Set<KeyName>([
  "services",
  "resources",
  "closures",
  "customerGroups",
  "questions",
  "team",
  "offers",
  "connectedApps",
]);

function seedValue(name: KeyName): unknown {
  if (LIST_KEYS.has(name)) return [];
  if (name === "assistant") return { nudges: [] };
  if (name === "bookingsInfinite" || name === "customersInfinite") return { pages: [], pageParams: [] };
  return {};
}

/** What table-driven tests read from any query hook (`renderApiHook<QueryView>(hook)` accepts a union of hooks). */
export type QueryView = { data: unknown; fetchStatus: string };

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

/** Seeds every key in `KEYS`; `overrides` replace the seeded data of some. */
export function seedCache(queryClient: QueryClient, overrides: Partial<Record<KeyName, unknown>> = {}) {
  for (const name of NAMES) queryClient.setQueryData(KEYS[name], overrides[name] ?? seedValue(name));
}

/** Names of the seeded keys now invalidated, in `KEYS` order. */
export function invalidatedKeys(queryClient: QueryClient): KeyName[] {
  return NAMES.filter((name) => queryClient.getQueryState(KEYS[name])?.isInvalidated === true);
}

/** Names of the seeded keys no longer cached at all. */
export function removedKeys(queryClient: QueryClient): KeyName[] {
  return NAMES.filter((name) => queryClient.getQueryState(KEYS[name]) === undefined);
}

/** Sorts names into `KEYS` order, so expectations can list them in any order. */
export function keyNames(...names: KeyName[]): KeyName[] {
  return NAMES.filter((name) => names.includes(name));
}

/**
 * Renders `hook` with a fresh test QueryClient (or `queryClient`). `seed: true` caches every `KEYS` entry first (for
 * mutations); `seedData` overrides some of the seeded values.
 */
export function renderApiHook<R>(
  hook: () => R,
  {
    seed = false,
    seedData = {},
    queryClient = createTestQueryClient(),
  }: { seed?: boolean; seedData?: Partial<Record<KeyName, unknown>>; queryClient?: QueryClient } = {},
) {
  if (seed) seedCache(queryClient, seedData);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(hook, { wrapper });
  return {
    ...view,
    queryClient,
    invalidated: () => invalidatedKeys(queryClient),
    removed: () => removedKeys(queryClient),
    data: (name: KeyName): unknown => queryClient.getQueryData(KEYS[name]),
  };
}

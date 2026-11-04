/** Test helpers: render dashboard components with business context, vocabulary, query client and a mocked fetch. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { Booking, Business, Me, MemberRole } from "@/lib/api/types";
import { BusinessContextProvider } from "@/lib/business/business-context";
import { VocabularyProvider } from "@/lib/vocabulary";
import { TooltipProvider } from "@/components/ui/tooltip";

export const business: Business = {
  id: "b1",
  slug: "lumen-physio",
  name: "Lumen Physiotherapy",
  description: null,
  industry: "physio",
  timezone: "Europe/Dublin",
  currency: "EUR",
  locale: "en-IE",
  contactEmail: null,
  contactPhone: null,
  websiteUrl: null,
  address: { line1: null, line2: null, city: null, postcode: null },
  branding: { primaryColor: "#0e7c70", logoUrl: null, coverImageUrl: null, portalStyle: "calm" },
  vocabulary: {
    resource: "therapist",
    resources: "therapists",
    customer: "patient",
    customers: "patients",
    booking: "appointment",
    bookings: "appointments",
  },
  policies: {
    minNoticeMinutes: 60,
    maxAdvanceDays: 60,
    cancellationNoticeHours: 24,
    lateCancellationRefundPercent: 0,
    allowCustomerCancel: true,
    allowCustomerReschedule: true,
    holdMinutes: 30,
    requireCustomerPhone: false,
    nextAvailableOnly: false,
  },
  customerGroups: [],
  paymentsEnabled: true,
  showBadge: false,
  status: "active",
  country: "IE",
  plan: "pro",
  myRole: "owner",
  createdAt: "2026-01-01T00:00:00Z",
};

export const me: Me = {
  user: { id: "u1", email: "owner@example.test", name: "Avery Morgan", emailVerified: true },
  memberships: [],
  pendingInvitations: [],
  hasCustomerBookings: false,
};

export function booking(patch: Partial<Booking> = {}): Booking {
  return {
    id: "bk1",
    reference: "BA-TEST01",
    status: "confirmed",
    paymentStatus: "paid",
    source: "public",
    start: "2099-10-01T09:00:00+01:00",
    end: "2099-10-01T09:45:00+01:00",
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    customer: { id: "c1", name: "Alex Morgan", email: "alex@example.test", phone: null, groupId: null },
    service: { id: "s1", name: "Follow-up", color: "#0e7c70" },
    option: null,
    addons: [],
    resources: [{ id: "r1", name: "Sam Rivers", kind: "person", requirementId: null }],
    groupId: null,
    answers: [],
    customerNotes: null,
    internalNotes: null,
    priceCents: 4500,
    depositCents: null,
    amountPaidCents: 4500,
    amountPaidInPersonCents: 0,
    amountRefundedCents: 0,
    currency: "EUR",
    holdExpiresAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:00:00Z",
    ...patch,
  };
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/**
 * What the release endpoints answer when a test doesn't route them (no schedules): the calendar, the overview and the
 * service editor read them in passing, and most tests' routers answer anything they don't know with an object.
 */
function releaseDefault(method: string, path: string, result: unknown): unknown {
  if (method !== "GET") return result;
  if (/\/release-schedules$/.test(path) && !Array.isArray(result)) return [];
  if (
    /\/releases$/.test(path) &&
    !(result instanceof Response) &&
    !(result as { schedules?: unknown } | null)?.schedules
  ) {
    return { timezone: "Europe/Dublin", from: "", to: "", schedules: [] };
  }
  return result;
}

/** Stub `fetch` with a router: `(method, path) => body`. Returns the mock for assertions. */
export function mockApi(route: (method: string, path: string, body: unknown) => unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    const path = url.pathname.replace(/^\/api/, "");
    const result = releaseDefault(method, path, route(method, path, body));
    if (result instanceof Response) return result;
    return json(result ?? {});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** For the site builder's tests: a deployment with business websites on (`SITES_ENABLED`). */
export const SITES_ON: Partial<Business> = { sitesEnabled: true };

/** A deployment that offers Bo (`ASSISTANT_ENABLED` and a model); off by default, like production. */
export const ASSISTANT_ON: Partial<Business> = { assistantAvailable: true };

export function renderDashboard(
  ui: React.ReactElement,
  role: MemberRole = "owner",
  patch: Partial<Business> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BusinessContextProvider value={{ business: { ...business, ...patch, myRole: role }, role, me }}>
        <VocabularyProvider vocabulary={business.vocabulary}>
          <TooltipProvider>{ui}</TooltipProvider>
        </VocabularyProvider>
      </BusinessContextProvider>
    </QueryClientProvider>,
  );
}

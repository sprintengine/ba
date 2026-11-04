/**
 * Hierarchical TanStack Query key factory.
 *
 * Every business-scoped key starts with `["business", businessId, …]`, so
 * `invalidateQueries({ queryKey: qk.business(id).root() })` refreshes all of a
 * business's data. `*.all()` keys are prefixes for partial-match invalidation.
 * Infinite and plain list queries use different keys because their cached
 * data shapes differ.
 */
import type {
  BookingListQuery,
  CustomerAvailabilityRange,
  CustomerListQuery,
  DateRange,
  MarketplaceSearchQuery,
  OfferPreviewInput,
  PublicAvailabilityQuery,
  StaffAvailabilityQuery,
} from "./types";

function businessKeys(businessId: string) {
  const root = ["business", businessId] as const;
  return {
    root: () => root,
    detail: () => [...root, "detail"] as const,
    /** `today`: the business's date the overview is for (its "today" list and counts change at midnight). */
    overview: (today?: string) => [...root, "overview", ...(today ? [today] : [])] as const,

    bookings: {
      all: () => [...root, "bookings"] as const,
      list: (query: BookingListQuery = {}) => [...root, "bookings", "list", query] as const,
      infinite: (query: Omit<BookingListQuery, "cursor"> = {}) =>
        [...root, "bookings", "infinite", query] as const,
      detail: (bookingId: string) => [...root, "bookings", "detail", bookingId] as const,
    },

    customers: {
      all: () => [...root, "customers"] as const,
      list: (query: CustomerListQuery = {}) => [...root, "customers", "list", query] as const,
      infinite: (query: Omit<CustomerListQuery, "cursor"> = {}) =>
        [...root, "customers", "infinite", query] as const,
      detail: (customerId: string) => [...root, "customers", "detail", customerId] as const,
    },

    services: () => [...root, "services"] as const,
    /** Prefix of `resourceAvailability`, so invalidating it refreshes every resource's rules too. */
    resources: () => [...root, "resources"] as const,
    /** `from`: overrides from that date (the API's default is 30 days ago). */
    resourceAvailability: (resourceId: string, from?: string) =>
      [...root, "resources", resourceId, "availability", ...(from ? [{ from }] : [])] as const,
    /** `from`: closures from that date (the API's default is 30 days ago). */
    closures: (from?: string) => [...root, "closures", ...(from ? [{ from }] : [])] as const,
    customerGroups: () => [...root, "customer-groups"] as const,
    questions: () => [...root, "questions"] as const,
    team: () => [...root, "team"] as const,
    reportsAll: () => [...root, "reports"] as const,
    reports: (range: DateRange) => [...root, "reports", range] as const,
    payments: () => [...root, "payments"] as const,
    billing: () => [...root, "billing"] as const,
    aiUsage: () => [...root, "ai-usage"] as const,
    assistant: () => [...root, "assistant"] as const,
    /** Every assistant thread (prefix of `assistantThread`). */
    assistantThreads: () => [...root, "assistant", "thread"] as const,
    assistantThread: (threadId: string) => [...root, "assistant", "thread", threadId] as const,
    assistantMemory: () => [...root, "assistant", "memory"] as const,
    /** The member's own AI apps' proposals (prefix of `agentRequest`). */
    agentRequests: () => [...root, "agent-requests"] as const,
    agentRequest: (id: string) => [...root, "agent-requests", id] as const,
    site: () => [...root, "site"] as const,
    siteVersions: () => [...root, "site", "versions"] as const,
    stock: (q: string, page: number) => [...root, "stock", q, page] as const,
    availabilityAll: () => [...root, "availability"] as const,
    availability: (query: StaffAvailabilityQuery) => [...root, "availability", query] as const,
    offers: () => [...root, "offers"] as const,
    offerPreview: (input: OfferPreviewInput) => [...root, "offers", "preview", input] as const,
    releaseSchedules: () => [...root, "release-schedules"] as const,
    /** Prefix of every `releases` range. */
    releasesAll: () => [...root, "releases"] as const,
    releases: (range: DateRange) => [...root, "releases", range] as const,
    marketplace: () => [...root, "marketplace"] as const,
  };
}

export const qk = {
  health: () => ["health"] as const,
  me: () => ["me"] as const,
  myBookings: () => ["my-bookings"] as const,
  /** The bell (§22). */
  notifications: () => ["notifications"] as const,
  notificationSettings: () => ["notification-settings"] as const,
  /** The customer's own AI apps' requests (prefix of `myAgentRequest`). */
  myAgentRequests: () => ["my-agent-requests"] as const,
  myAgentRequest: (id: string) => ["my-agent-requests", id] as const,
  myAgentSettings: () => ["my-agent-settings"] as const,
  /** Under `myBookings()`, so invalidating my bookings refreshes reschedule slots too. */
  myBookingAvailability: (bookingId: string, range: CustomerAvailabilityRange) =>
    ["my-bookings", bookingId, "availability", range] as const,
  /** The next free time to move a booking to, searched over `range` (see `useNextSlot`). */
  myBookingNextSlot: (bookingId: string, range: CustomerAvailabilityRange) =>
    ["my-bookings", bookingId, "availability", "next", range] as const,

  templates: {
    all: () => ["templates"] as const,
    detail: (key: string) => ["templates", key] as const,
  },

  onboarding: {
    slugAvailable: (slug: string) => ["onboarding", "slug-available", slug] as const,
  },

  public: {
    all: () => ["public"] as const,
    /** Prefix for everything about one public business page (services, availability). */
    business: (slug: string) => ["public", "business", slug] as const,
    services: (slug: string) => ["public", "business", slug, "services"] as const,
    availabilityAll: (slug: string) => ["public", "business", slug, "availability"] as const,
    availability: (slug: string, query: PublicAvailabilityQuery) =>
      ["public", "business", slug, "availability", query] as const,
    /** The next free time for `query`, searched from `from` to `to` (see `useNextSlot`). */
    nextSlot: (slug: string, query: PublicAvailabilityQuery) =>
      ["public", "business", slug, "availability", "next", query] as const,
    /** Prefix for a managed booking and its reschedule availability. */
    manage: (token: string) => ["public", "manage", token] as const,
    manageAvailabilityAll: (token: string) => ["public", "manage", token, "availability"] as const,
    manageAvailability: (token: string, range: CustomerAvailabilityRange) =>
      ["public", "manage", token, "availability", range] as const,
    manageNextSlot: (token: string, range: CustomerAvailabilityRange) =>
      ["public", "manage", token, "availability", "next", range] as const,
    devPayment: (paymentId: string) => ["public", "dev-payment", paymentId] as const,
    offers: (slug: string) => ["public", "business", slug, "offers"] as const,
  },

  marketplace: {
    all: () => ["marketplace"] as const,
    meta: () => ["marketplace", "meta"] as const,
    search: (query: Omit<MarketplaceSearchQuery, "cursor">) => ["marketplace", "search", query] as const,
  },

  /** OAuth consent (§20): the validated authorization request. */
  oauthAuthorize: (request: Record<string, string | null>) => ["oauth", "authorize", request] as const,
  connectedApps: () => ["connected-apps"] as const,

  business: businessKeys,
  /** Which business a dashboard slug is (its id, or null), read alongside `/me` (see `useBusinessBySlug`). */
  businessBySlug: (slug: string) => ["business-by-slug", slug] as const,
};

export type BusinessKeys = ReturnType<typeof businessKeys>;

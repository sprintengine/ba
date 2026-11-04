/**
 * Server-safe API surface: client, contract types, endpoint modules and query
 * keys. React Query hooks are client-only — import them from `@/lib/api/hooks`.
 */
export * from "./client";
export type * from "./types";
export { qk } from "./query-keys";
export type { BusinessKeys } from "./query-keys";

export { publicApi } from "./public";
export { meApi } from "./me";
export { notificationsApi } from "./notifications";
export { onboardingApi } from "./onboarding";
export { businessApi } from "./business";
export { resourcesApi } from "./resources";
export { servicesApi } from "./services";
export { bookingsApi } from "./bookings";
export { customersApi } from "./customers";
export { teamApi } from "./team";
export { reportsApi } from "./reports";
export { auditApi } from "./audit";
export { paymentsApi } from "./payments";
export { billingApi } from "./billing";
export { siteApi } from "./site";
export { aiApi } from "./ai";
export { assistantApi } from "./assistant";
export { marketplaceApi } from "./marketplace";
export { offersApi } from "./offers";
export { releasesApi } from "./releases";
export { oauthApi } from "./oauth";

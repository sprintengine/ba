/**
 * API contract types — mirrors docs/architecture.md §6.9 exactly, plus named
 * types for the inline request/response shapes in the §6 tables.
 *
 * Conventions (§2):
 * - IDs are UUID strings.
 * - Money is integer minor units (`*Cents`, e.g. 1250 = €12.50) with an ISO
 *   currency code (`"EUR"`).
 * - Instants are ISO-8601 strings with offset, rendered in the business
 *   timezone, e.g. `"2026-10-01T09:00:00+01:00"`.
 * - Dates are `YYYY-MM-DD`, interpreted in the business timezone.
 * - Times of day are `HH:mm`.
 */
export type * from "./types/common";
export type * from "./types/business";
export type * from "./types/resources";
export type * from "./types/questions";
export type * from "./types/services";
export type * from "./types/availability";
export type * from "./types/bookings";
export type * from "./types/customers";
export type * from "./types/team";
export type * from "./types/me";
export type * from "./types/reports";
export type * from "./types/onboarding";
export type * from "./types/payments";
export type * from "./types/site";
export type * from "./types/offers";
export type * from "./types/releases";
export type * from "./types/marketplace";
export type * from "./types/oauth";
export type * from "./types/notifications";
export type * from "./ai-types";
export type * from "./assistant-schema";

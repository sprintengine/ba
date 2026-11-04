/** API types: Availability. Import them from `@/lib/api/types`. */
import type { SlotOffer } from "./offers";

export type Slot = {
  /** ISO instant */
  start: string;
  /** ISO instant */
  end: string;
  /** One example assignment of resources for this slot. */
  resourceIds: string[];
  /** Remaining seats for capacity > 1 services; null otherwise. */
  seatsLeft: number | null;
  /** Set when a deal discounts this slot (public availability; §19). */
  offer?: SlotOffer | null;
};

/**
 * One day of availability. On customer availability, a day a release schedule keeps closed (§21) that would have times
 * has none, and says when it opens (`opensAt`) or that it is held until the business opens it (`held`).
 */
export type AvailabilityDay = {
  /** `YYYY-MM-DD` */
  date: string;
  slots: Slot[];
  /** ISO instant; null when the day is open (always for staff). */
  opensAt: string | null;
  held: boolean;
};

export type Availability = {
  timezone: string;
  /** `YYYY-MM-DD` */
  from: string;
  /** `YYYY-MM-DD` */
  to: string;
  durationMinutes: number;
  days: AvailabilityDay[];
  /** The business offers its next available time only: at most one slot, the earliest after `after`. */
  nextAvailableOnly: boolean;
};

/** Query for public (`/public/businesses/{slug}/availability`) and staff (`/availability`) availability. */
export type AvailabilityQuery = {
  serviceId: string;
  optionId?: string | null;
  addonIds?: string[];
  groupId?: string | null;
  resourceId?: string | null;
  /** `YYYY-MM-DD` */
  from: string;
  /** `YYYY-MM-DD` */
  to: string;
};

/** Public availability: optionally only slots starting after `after` (ISO instant), to step to later times. */
export type PublicAvailabilityQuery = AvailabilityQuery & { after?: string | null };

/** Staff availability query; `includePrivate` defaults to true in `bookingsApi.availability`. */
export type StaffAvailabilityQuery = AvailabilityQuery & {
  includePrivate?: boolean;
  /**
   * Rescheduling: slots this booking can move to. Its own allocations are ignored and its
   * service, duration and customer group are used (option/add-ons/group are ignored).
   */
  excludeBookingId?: string | null;
};

/** `YYYY-MM-DD` range. */
export type DateRange = { from: string; to: string };

/** A customer reschedule window: a date range and, optionally, only slots starting after `after` (ISO instant). */
export type CustomerAvailabilityRange = DateRange & { after?: string | null };

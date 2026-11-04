/** API types: Overview, reports, audit. Import them from `@/lib/api/types`. */
import type { Booking } from "./bookings";

export type ChecklistKey = "services" | "resources" | "availability" | "payments" | "branding" | "publish";

export type Overview = {
  today: Booking[];
  upcomingCount7d: number;
  revenueCents30d: number;
  bookings30d: number;
  checklist: { key: ChecklistKey; done: boolean }[];
};

export type ReportSummary = {
  from: string;
  to: string;
  currency: string;
  totals: {
    bookings: number;
    confirmed: number;
    cancelled: number;
    noShows: number;
    revenueCents: number;
    refundedCents: number;
    newCustomers: number;
  };
  byDay: { date: string; bookings: number; revenueCents: number }[];
  byService: { serviceId: string; name: string; bookings: number; revenueCents: number }[];
  byResource: {
    resourceId: string;
    name: string;
    bookedMinutes: number;
    availableMinutes: number;
    /** 0..1 */
    utilisation: number;
  }[];
};

export type AuditListQuery = { entityId?: string; limit?: number; cursor?: string | null };

/** API types: Customers. Import them from `@/lib/api/types`. */
import type { Booking } from "./bookings";

export type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  groupId: string | null;
  /** Linked to a signed-in user account. */
  hasAccount: boolean;
  bookingCount: number;
  lastBookingAt: string | null;
  createdAt: string;
};

export type CustomerDetail = Customer & { bookings: Booking[] };

export type CustomerListQuery = { q?: string; limit?: number; cursor?: string | null };

/** `GET /customers/{id}/export` — opaque GDPR export document. */
export type CustomerExport = Record<string, unknown>;

/** Builders shared by the customer page tests. */
import type { Customer, CustomerDetail } from "@/lib/api/types";

export const customer = (patch: Partial<Customer> = {}): Customer => ({
  id: "c1",
  name: "Alex Morgan",
  email: "alex@example.test",
  phone: null,
  notes: null,
  groupId: null,
  hasAccount: false,
  bookingCount: 0,
  lastBookingAt: null,
  createdAt: "2026-01-15T10:00:00Z",
  ...patch,
});

export const customerDetail = (patch: Partial<CustomerDetail> = {}): CustomerDetail => ({
  ...customer(),
  bookings: [],
  ...patch,
});

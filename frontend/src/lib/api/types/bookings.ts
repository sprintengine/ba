/** API types: Bookings. Import them from `@/lib/api/types`. */
import type { Address, Branding } from "./business";
import type { BookingSource, BookingStatus, PaymentStatus, ResourceKind } from "./common";
import type { BookingOffer } from "./offers";

export type CustomerInput = {
  name: string;
  email: string | null;
  phone: string | null;
  notes?: string | null;
  groupId?: string | null;
};

export type CreatePublicBooking = {
  serviceId: string;
  optionId: string | null;
  addonIds: string[];
  groupId: string | null;
  resourceId: string | null;
  /** ISO instant — a `Slot.start`. */
  start: string;
  customer: { name: string; email: string; phone: string | null };
  /** questionId → answer */
  answers: Record<string, string>;
  customerNotes: string | null;
  /** Frontend origin used to build payment success/cancel URLs. */
  returnUrl?: string;
  /** `at_venue` for a service with `allowPayAtVenue`, when the customer chooses to pay there; online otherwise. */
  payment?: "online" | "at_venue" | null;
  /**
   * The total the customer was shown (with the time's deal). When the booking would now cost anything else, it is
   * refused with 409 `PRICE_CHANGED` (the new price in the message) and nothing is booked.
   */
  expectedTotalCents?: number | null;
};

export type BookingResult = {
  booking: CustomerBooking;
  /** Token for `/manage/{token}`. */
  manageToken: string;
  next: {
    /** `expired` and `cancelled` only when a repeated request finds its booking already over. */
    type: "confirmed" | "pending_approval" | "payment_required" | "expired" | "cancelled";
    checkoutUrl: string | null;
  };
};

export type CustomerBooking = {
  id: string;
  /** Human code, e.g. `BA-7K3F9Q`. */
  reference: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  start: string;
  end: string;
  timezone: string;
  business: {
    id: string;
    slug: string;
    name: string;
    branding: Branding;
    contactEmail: string | null;
    contactPhone: string | null;
    address: Address;
  };
  service: { id: string; name: string };
  option: { id: string; name: string } | null;
  addons: { id: string; name: string }[];
  resources: { id: string; name: string; kind: ResourceKind }[];
  priceCents: number;
  depositCents: number | null;
  amountPaidCents: number;
  /** The part of `amountPaidCents` taken in person, which an online refund can't return. */
  amountPaidInPersonCents: number;
  amountRefundedCents: number;
  currency: string;
  /** While `held`: when the unpaid hold lapses. */
  holdExpiresAt: string | null;
  canCancel: boolean;
  canReschedule: boolean;
  /** What a cancellation right now would refund. */
  refundPreview: { amountCents: number; reason: string } | null;
  /** Price before the applied deal (null when none applied); `priceCents` is what is owed (§19). */
  originalPriceCents?: number | null;
  offer?: BookingOffer | null;
};

export type ManagedBooking = CustomerBooking & {
  /** Name and phone are null when someone else booked with the customer's email (the view shows what they typed). */
  customer: { name: string | null; email: string | null; phone: string | null };
};

/** `GET /me/bookings` */
export type MyBookings = { upcoming: CustomerBooking[]; past: CustomerBooking[] };

export type Booking = {
  id: string;
  reference: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  source: BookingSource;
  start: string;
  end: string;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  customer: { id: string; name: string; email: string | null; phone: string | null; groupId: string | null };
  service: { id: string; name: string; color: string };
  option: { id: string; name: string } | null;
  addons: { id: string; name: string; extraMinutes: number; priceCents: number }[];
  resources: { id: string; name: string; kind: ResourceKind; requirementId: string | null }[];
  groupId: string | null;
  answers: { questionId: string; label: string; value: string; sensitive: boolean }[];
  customerNotes: string | null;
  internalNotes: string | null;
  priceCents: number;
  depositCents: number | null;
  amountPaidCents: number;
  /** The part of `amountPaidCents` taken in person, which an online refund can't return. */
  amountPaidInPersonCents: number;
  amountRefundedCents: number;
  currency: string;
  holdExpiresAt: string | null;
  cancelledAt: string | null;
  cancelledBy: "customer" | "business" | "system" | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  /** Price before the applied deal (null when none applied). */
  originalPriceCents?: number | null;
  offer?: BookingOffer | null;
};

export type Payment = {
  id: string;
  kind: "charge" | "refund";
  provider: string;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  actorType: string;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: Record<string, unknown>;
  occurredAt: string;
};

export type BookingDetail = Booking & {
  payments: Payment[];
  history: AuditEvent[];
  /** Pending checkout link while `held` and the hold is still valid; otherwise null. */
  checkoutUrl: string | null;
};

/** `POST /bookings` response: the booking plus its payment link when held for `collect_online`. */
export type CreatedBooking = Booking & { checkoutUrl: string | null };

/** `POST /bookings/{id}/send-payment-link` */
export type PaymentLinkSent = { checkoutUrl: string; sentTo: string };

/** `POST /bookings/{id}/decline` */
export type DeclineBookingInput = { reason?: string | null };

export type CreateStaffBooking = {
  serviceId: string;
  optionId: string | null;
  addonIds: string[];
  groupId: string | null;
  /** null = auto-assign. */
  resourceIds: string[] | null;
  start: string;
  /** Existing customer, or… */
  customerId: string | null;
  /** …a new customer (exactly one of `customerId` / `customer`). */
  customer: CustomerInput | null;
  answers: Record<string, string>;
  internalNotes: string | null;
  paymentMode: "collect_online" | "at_venue" | "none";
  notifyCustomer: boolean;
};

/** `PATCH /bookings/{id}` */
export type UpdateBookingInput = {
  internalNotes?: string | null;
  customerNotes?: string | null;
  answers?: Record<string, string>;
};

/** `POST /bookings/{id}/cancel` (staff) */
export type CancelStaffBookingInput = {
  reason?: string | null;
  /** `policy` applies the business refund policy; staff may override. */
  refund: "policy" | "full" | "none";
  notifyCustomer: boolean;
};

/** `POST /bookings/{id}/reschedule` (staff) */
export type RescheduleStaffBookingInput = {
  start: string;
  /** null/omitted = keep or auto-assign. */
  resourceIds?: string[] | null;
  notifyCustomer: boolean;
};

/** `POST /bookings/{id}/status` */
export type TerminalBookingStatus = "completed" | "no_show";

/** Customer/guest reschedule (`/me/bookings/{id}/reschedule`, `/public/manage/{token}/reschedule`). */
export type RescheduleInput = { start: string; resourceId?: string | null };

/** Customer/guest cancel. */
export type CancelInput = { reason?: string | null };

/** `GET /bookings` query. */
export type BookingListQuery = {
  /** `YYYY-MM-DD` */
  from?: string;
  /** `YYYY-MM-DD` */
  to?: string;
  status?: BookingStatus | BookingStatus[];
  resourceId?: string;
  serviceId?: string;
  /** Backend extension: only this customer's bookings. */
  customerId?: string;
  q?: string;
  limit?: number;
  cursor?: string | null;
};

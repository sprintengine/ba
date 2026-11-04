import { api } from "./client";
import { businessPath, seg } from "./paths";
import type {
  Availability,
  Booking,
  BookingDetail,
  BookingListQuery,
  CancelStaffBookingInput,
  CreateStaffBooking,
  CreatedBooking,
  DeclineBookingInput,
  Page,
  PaymentLinkSent,
  RescheduleStaffBookingInput,
  StaffAvailabilityQuery,
  TerminalBookingStatus,
  UpdateBookingInput,
} from "./types";

const bookingPath = (businessId: string, bookingId: string, suffix = "") =>
  businessPath(businessId, `/bookings/${seg(bookingId)}${suffix}`);

/** Staff booking endpoints and staff availability (§6.7). */
export const bookingsApi = {
  /** Staff see bookings on their own resources only. */
  list: (businessId: string, query: BookingListQuery = {}): Promise<Page<Booking>> =>
    api.get<Page<Booking>>(businessPath(businessId, "/bookings"), query),

  get: (businessId: string, bookingId: string): Promise<BookingDetail> =>
    api.get<BookingDetail>(bookingPath(businessId, bookingId)),

  /** `checkoutUrl` is set when the booking is held for online payment (`collect_online`). */
  create: (businessId: string, body: CreateStaffBooking, idempotencyKey?: string): Promise<CreatedBooking> =>
    api.post<CreatedBooking>(businessPath(businessId, "/bookings"), body, { idempotencyKey }),

  update: (businessId: string, bookingId: string, body: UpdateBookingInput): Promise<Booking> =>
    api.patch<Booking>(bookingPath(businessId, bookingId), body),

  cancel: (businessId: string, bookingId: string, body: CancelStaffBookingInput): Promise<Booking> =>
    api.post<Booking>(bookingPath(businessId, bookingId, "/cancel"), body),

  reschedule: (businessId: string, bookingId: string, body: RescheduleStaffBookingInput): Promise<Booking> =>
    api.post<Booking>(bookingPath(businessId, bookingId, "/reschedule"), body),

  approve: (businessId: string, bookingId: string): Promise<Booking> =>
    api.post<Booking>(bookingPath(businessId, bookingId, "/approve")),

  /** The reason is stored as `cancellationReason` and quoted in the email to the customer. */
  decline: (businessId: string, bookingId: string, body: DeclineBookingInput = {}): Promise<Booking> =>
    api.post<Booking>(bookingPath(businessId, bookingId, "/decline"), body),

  /** Emails the checkout link of a held booking to the customer again. */
  sendPaymentLink: (businessId: string, bookingId: string): Promise<PaymentLinkSent> =>
    api.post<PaymentLinkSent>(bookingPath(businessId, bookingId, "/send-payment-link")),

  /** Records that what was due at the venue (the price, or a deposit's balance) was paid in person. */
  markPaidInPerson: (businessId: string, bookingId: string): Promise<Booking> =>
    api.post<Booking>(bookingPath(businessId, bookingId, "/paid-in-person")),

  setStatus: (businessId: string, bookingId: string, status: TerminalBookingStatus): Promise<Booking> =>
    api.post<Booking>(bookingPath(businessId, bookingId, "/status"), { status }),

  /**
   * Staff availability; `includePrivate` defaults to true (includes non-public services).
   * With `excludeBookingId`: where that booking can be rescheduled to.
   */
  availability: (businessId: string, query: StaffAvailabilityQuery): Promise<Availability> =>
    api.get<Availability>(businessPath(businessId, "/availability"), {
      ...query,
      includePrivate: query.includePrivate ?? true,
    }),
};

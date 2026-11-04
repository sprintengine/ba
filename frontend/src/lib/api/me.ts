import { api } from "./client";
import { seg } from "./paths";
import type {
  AcceptedInvitation,
  Availability,
  CancelInput,
  CheckoutUrl,
  CustomerBooking,
  CustomerAvailabilityRange,
  Me,
  MyBookings,
  RescheduleInput,
} from "./types";

/** Signed-in user endpoints (§6.2). */
export const meApi = {
  /** Also links customer records by verified email and auto-accepts matching invitations. */
  me: (): Promise<Me> => api.get<Me>("/v1/me"),

  bookings: (): Promise<MyBookings> => api.get<MyBookings>("/v1/me/bookings"),

  cancelBooking: (bookingId: string, body: CancelInput = {}): Promise<CustomerBooking> =>
    api.post<CustomerBooking>(`/v1/me/bookings/${seg(bookingId)}/cancel`, body),

  rescheduleBooking: (bookingId: string, body: RescheduleInput): Promise<CustomerBooking> =>
    api.post<CustomerBooking>(`/v1/me/bookings/${seg(bookingId)}/reschedule`, body),

  /** Slots for moving one of my bookings (its service, duration and customer group; ignores the booking itself). */
  bookingAvailability: (bookingId: string, range: CustomerAvailabilityRange): Promise<Availability> =>
    api.get<Availability>(`/v1/me/bookings/${seg(bookingId)}/availability`, range),

  /** Checkout URL for one of my held, unpaid bookings; redirect to it. */
  payBooking: (bookingId: string): Promise<CheckoutUrl> =>
    api.post<CheckoutUrl>(`/v1/me/bookings/${seg(bookingId)}/pay`),

  /** Also answers the user who already joined through it (`me` accepts invitations for their email). */
  acceptInvitation: (token: string): Promise<AcceptedInvitation> =>
    api.post<AcceptedInvitation>(`/v1/invitations/${seg(token)}/accept`),
};

/**
 * Booking fixtures: availability, the public booking request and result, the customer's and the staff's views of a
 * booking, and customers. `x` is complete; `xSparse` has every nullable property null and optional ones left out.
 */
import type {
  Availability,
  Booking,
  BookingDetail,
  BookingResult,
  CreatePublicBooking,
  Customer,
  CustomerBooking,
  ManagedBooking,
  Slot,
} from "@/lib/api/types";
import { publicBusiness } from "./business";
import { ids } from "./ids";
import { bookingOffer, slotOffer } from "./offers";

export const slot = {
  start: "2026-10-06T13:00:00+01:00",
  end: "2026-10-06T14:00:00+01:00",
  resourceIds: [ids.resource],
  seatsLeft: 3,
  offer: slotOffer,
} satisfies Slot;

export const slotSparse = { ...slot, seatsLeft: null, offer: null } satisfies Slot;

export const availability = {
  timezone: "Europe/Dublin",
  from: "2026-10-06",
  to: "2026-10-07",
  durationMinutes: 60,
  nextAvailableOnly: false,
  days: [
    { date: "2026-10-06", slots: [slot, slotSparse], opensAt: null, held: false },
    { date: "2026-10-07", slots: [], opensAt: "2026-10-06T17:00:00+01:00", held: false },
    { date: "2026-10-08", slots: [], opensAt: null, held: true },
  ],
} satisfies Availability;

export const createPublicBooking = {
  serviceId: ids.service,
  optionId: ids.option,
  addonIds: [ids.addon],
  groupId: ids.group,
  resourceId: ids.resource,
  start: slot.start,
  customer: { name: "Rowan Example", email: "rowan@example.test", phone: "+353 85 555 0199" },
  answers: { [ids.question]: "Left" },
  customerNotes: "Sore since Saturday's match.",
  returnUrl: "https://bookanything.test/lumen-physio/book",
  payment: "at_venue",
  expectedTotalCents: 4000,
} satisfies CreatePublicBooking;

export const createPublicBookingSparse = {
  serviceId: ids.service,
  optionId: null,
  addonIds: [],
  groupId: null,
  resourceId: null,
  start: slot.start,
  customer: { name: "Rowan Example", email: "rowan@example.test", phone: null },
  answers: {},
  customerNotes: null,
} satisfies CreatePublicBooking;

export const customerBooking = {
  id: ids.booking,
  reference: "BA-7K3F9Q",
  status: "confirmed",
  paymentStatus: "partially_refunded",
  start: slot.start,
  end: slot.end,
  timezone: "Europe/Dublin",
  business: {
    id: ids.business,
    slug: publicBusiness.slug,
    name: publicBusiness.name,
    branding: publicBusiness.branding,
    contactEmail: publicBusiness.contactEmail,
    contactPhone: publicBusiness.contactPhone,
    address: publicBusiness.address,
  },
  service: { id: ids.service, name: "Initial assessment" },
  option: { id: ids.option, name: "Extended" },
  addons: [{ id: ids.addon, name: "Taping" }],
  resources: [{ id: ids.resource, name: "Alex Morgan", kind: "person" }],
  priceCents: 5600,
  depositCents: 2000,
  amountPaidCents: 2000,
  amountPaidInPersonCents: 0,
  amountRefundedCents: 500,
  currency: "EUR",
  holdExpiresAt: "2026-10-01T09:30:00+01:00",
  canCancel: true,
  canReschedule: true,
  refundPreview: { amountCents: 1500, reason: "More than 24 hours' notice: full refund." },
  originalPriceCents: 7000,
  offer: bookingOffer,
} satisfies CustomerBooking;

export const customerBookingSparse = {
  ...customerBooking,
  business: {
    ...customerBooking.business,
    branding: { primaryColor: "#0e7c70", logoUrl: null, coverImageUrl: null },
    contactEmail: null,
    contactPhone: null,
    address: { line1: null, line2: null, city: null, postcode: null },
  },
  option: null,
  depositCents: null,
  holdExpiresAt: null,
  refundPreview: null,
  originalPriceCents: null,
  offer: null,
} satisfies CustomerBooking;

export const managedBooking = {
  ...customerBooking,
  customer: { name: "Rowan Example", email: "rowan@example.test", phone: "+353 85 555 0199" },
} satisfies ManagedBooking;

export const managedBookingSparse = {
  ...customerBookingSparse,
  customer: { name: null, email: null, phone: null },
} satisfies ManagedBooking;

export const bookingResult = {
  booking: customerBooking,
  manageToken: "mt_3s9Qk2",
  next: { type: "payment_required", checkoutUrl: "https://checkout.stripe.test/c/pay_1" },
} satisfies BookingResult;

export const bookingResultSparse = {
  booking: customerBookingSparse,
  manageToken: "mt_3s9Qk2",
  next: { type: "confirmed", checkoutUrl: null },
} satisfies BookingResult;

export const booking = {
  id: ids.booking,
  reference: "BA-7K3F9Q",
  status: "cancelled",
  paymentStatus: "partially_refunded",
  source: "public",
  start: slot.start,
  end: slot.end,
  bufferBeforeMinutes: 5,
  bufferAfterMinutes: 10,
  customer: {
    id: ids.customer,
    name: "Rowan Example",
    email: "rowan@example.test",
    phone: "+353 85 555 0199",
    groupId: ids.group,
  },
  service: { id: ids.service, name: "Initial assessment", color: "#0e7c70" },
  option: { id: ids.option, name: "Extended" },
  addons: [{ id: ids.addon, name: "Taping", extraMinutes: 10, priceCents: 1000 }],
  resources: [{ id: ids.resource, name: "Alex Morgan", kind: "person", requirementId: ids.requirement }],
  groupId: ids.group,
  answers: [{ questionId: ids.question, label: "Which knee?", value: "Left", sensitive: false }],
  customerNotes: "Sore since Saturday's match.",
  internalNotes: "Prefers mornings.",
  priceCents: 5600,
  depositCents: 2000,
  amountPaidCents: 2000,
  amountPaidInPersonCents: 0,
  amountRefundedCents: 500,
  currency: "EUR",
  holdExpiresAt: "2026-10-01T09:30:00+01:00",
  cancelledAt: "2026-10-02T10:00:00+01:00",
  cancelledBy: "customer",
  cancellationReason: "Feeling better",
  createdAt: "2026-10-01T09:00:00Z",
  updatedAt: "2026-10-02T09:00:00Z",
  originalPriceCents: 7000,
  offer: bookingOffer,
} satisfies Booking;

export const bookingSparse = {
  ...booking,
  status: "confirmed",
  customer: { id: ids.customer, name: "Rowan Example", email: null, phone: null, groupId: null },
  option: null,
  resources: [{ id: ids.resource, name: "Alex Morgan", kind: "person", requirementId: null }],
  groupId: null,
  customerNotes: null,
  internalNotes: null,
  depositCents: null,
  holdExpiresAt: null,
  cancelledAt: null,
  cancelledBy: null,
  cancellationReason: null,
  originalPriceCents: null,
  offer: null,
} satisfies Booking;

export const bookingDetail = {
  ...booking,
  payments: [
    {
      id: ids.payment,
      kind: "charge",
      provider: "stripe",
      amountCents: 2000,
      currency: "EUR",
      status: "succeeded",
      createdAt: "2026-10-01T09:05:00Z",
    },
  ],
  history: [
    {
      id: ids.audit,
      actorType: "customer",
      actorName: "Rowan Example",
      action: "booking.cancelled",
      entityType: "booking",
      entityId: ids.booking,
      summary: { reason: "Feeling better" },
      occurredAt: "2026-10-02T09:00:00Z",
    },
  ],
  checkoutUrl: "https://checkout.stripe.test/c/pay_1",
} satisfies BookingDetail;

export const bookingDetailSparse = {
  ...bookingSparse,
  payments: [],
  history: [
    {
      id: ids.audit,
      actorType: "system",
      actorName: null,
      action: "booking.created",
      entityType: "booking",
      entityId: ids.booking,
      summary: {},
      occurredAt: "2026-10-01T09:00:00Z",
    },
  ],
  checkoutUrl: null,
} satisfies BookingDetail;

export const customer = {
  id: ids.customer,
  name: "Rowan Example",
  email: "rowan@example.test",
  phone: "+353 85 555 0199",
  notes: "Runs marathons.",
  groupId: ids.group,
  hasAccount: true,
  bookingCount: 4,
  lastBookingAt: "2026-10-06T13:00:00+01:00",
  createdAt: "2026-03-01T09:00:00Z",
} satisfies Customer;

export const customerSparse = {
  ...customer,
  email: null,
  phone: null,
  notes: null,
  groupId: null,
  hasAccount: false,
  bookingCount: 0,
  lastBookingAt: null,
} satisfies Customer;

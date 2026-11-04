/** Test builders for the dashboard's booking area: booking details, audit events, payments, services, slots. */
import type {
  AuditEvent,
  Availability,
  BookingDetail,
  Customer,
  FormQuestion,
  Payment,
  Resource,
  Service,
  Slot,
} from "@/lib/api/types";
import type { mockApi } from "./render";
import { booking } from "./render";

/** A confirmed, paid booking's detail (no payments, history or payment link) with [patch] applied. */
export function bookingDetail(patch: Partial<BookingDetail> = {}): BookingDetail {
  return { ...booking(), payments: [], history: [], checkoutUrl: null, ...patch };
}

export function auditEvent(patch: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "ev1",
    actorType: "system",
    actorName: null,
    action: "booking.created",
    entityType: "booking",
    entityId: "bk1",
    summary: {},
    occurredAt: "2026-09-01T10:00:00Z",
    ...patch,
  };
}

export function payment(patch: Partial<Payment> = {}): Payment {
  return {
    id: "pay1",
    kind: "charge",
    provider: "stripe",
    amountCents: 4500,
    currency: "EUR",
    status: "succeeded",
    createdAt: "2026-09-01T10:00:00Z",
    ...patch,
  };
}

export function service(patch: Partial<Service> = {}): Service {
  return {
    id: "s1",
    name: "Follow-up",
    description: null,
    category: null,
    color: "#0e7c70",
    durationMinutes: 45,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    slotIntervalMinutes: null,
    minNoticeMinutes: null,
    maxAdvanceDays: null,
    capacity: 1,
    priceCents: 4500,
    paymentMode: "at_venue",
    depositCents: null,
    allowPayAtVenue: false,
    requiresApproval: false,
    locationType: "business",
    allowedGroupIds: [],
    isPublic: true,
    isActive: true,
    sortOrder: 0,
    options: [],
    addons: [],
    requirements: [],
    ...patch,
  };
}

export function question(patch: Partial<FormQuestion> = {}): FormQuestion {
  return {
    id: "q1",
    serviceId: null,
    label: "Anything we should know?",
    helpText: null,
    kind: "text",
    options: [],
    required: false,
    sensitive: false,
    sortOrder: 0,
    isActive: true,
    ...patch,
  };
}

export function customer(patch: Partial<Customer> = {}): Customer {
  return {
    id: "c1",
    name: "Alex Morgan",
    email: "alex@example.test",
    phone: null,
    notes: null,
    groupId: null,
    hasAccount: false,
    bookingCount: 1,
    lastBookingAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...patch,
  };
}

export function resource(id: string, name: string, sortOrder = 0, patch: Partial<Resource> = {}): Resource {
  return {
    id,
    kind: "person",
    name,
    description: null,
    color: "#0e7c70",
    capacity: 1,
    memberId: null,
    isActive: true,
    sortOrder,
    ...patch,
  };
}

/** A free slot of an hour starting at `start` ("2099-10-06T10:00:00+01:00"). */
export function slot(start: string, patch: Partial<Slot> = {}): Slot {
  const end = new Date(new Date(start).getTime() + 60 * 60_000).toISOString();
  return { start, end, resourceIds: ["r1"], seatsLeft: null, offer: null, ...patch };
}

/** Staff availability over the days given as `{ "2099-10-06": [slot…] }`. */
export function availability(days: Record<string, Slot[]>): Availability {
  const dates = Object.keys(days).sort();
  return {
    timezone: "Europe/Dublin",
    from: dates[0] ?? "2099-10-01",
    to: dates.at(-1) ?? "2099-10-01",
    durationMinutes: 60,
    nextAvailableOnly: false,
    days: dates.map((date) => ({ date, slots: days[date] ?? [], opensAt: null, held: false })),
  };
}

type Api = ReturnType<typeof mockApi>;

/** Each request as "METHOD /path" (without `/api`). */
export function requests(api: Api): string[] {
  return api.mock.calls.map(
    ([u, init]) =>
      `${init?.method ?? "GET"} ${new URL(String(u), "http://x").pathname.replace(/^\/api/, "")}`,
  );
}

/** The URL of the first request whose path ends with [suffix] (and has [method]). */
export function requestUrl(api: Api, suffix: string, method = "GET"): URL | undefined {
  const call = api.mock.calls.find(
    ([u, init]) =>
      (init?.method ?? "GET") === method && new URL(String(u), "http://x").pathname.endsWith(suffix),
  );
  return call ? new URL(String(call[0]), "http://x") : undefined;
}

/** The parsed JSON body of the last [method] request whose path ends with [suffix]. */
export function requestBody(api: Api, suffix: string, method = "POST"): unknown {
  const call = api.mock.calls.findLast(
    ([u, init]) => init?.method === method && new URL(String(u), "http://x").pathname.endsWith(suffix),
  );
  return call ? JSON.parse(String(call[1]?.body)) : undefined;
}

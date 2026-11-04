/**
 * My bookings' WebMCP tools (`/my/bookings`, signed in): an AI agent in the customer's browser lists their bookings
 * and starts a cancellation or a move, which the page shows in its own dialog for the customer to confirm. Nothing
 * is cancelled or moved by the agent itself. Loaded only in browsers with WebMCP (`use-my-bookings-agent-tools.ts`).
 */
import type { CustomerBooking, MyBookings } from "@/lib/api/types";
import { readInput } from "@/lib/booking/agent";
import { shortAddress, sortByStart } from "@/lib/booking/booking";
import { formatMoney, toPlainDate, toTimeOfDay } from "@/lib/format";
import { toolOutput, type ModelContextTool } from "@/lib/webmcp/model-context";

/** A change the page shows for the customer to confirm: the booking card's own cancel or reschedule dialog. */
export type MyBookingsAgentRequest = { bookingId: string; action: "cancel" | "reschedule" };

export type MyBookingsAgentPage = {
  /** The customer's bookings as last loaded; undefined while loading. */
  bookings: MyBookings | undefined;
  /** The change whose dialog the page shows now, until the customer closes it. */
  pending: MyBookingsAgentRequest | null;
  /** Opens the booking's dialog on the page (switching to its tab and scrolling to it). */
  request: (request: MyBookingsAgentRequest) => void;
};

type Deps = { page: () => MyBookingsAgentPage };

const bookingSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    reference: { type: "string" },
    business: { type: "string" },
    businessSlug: { type: "string" },
    address: { type: ["string", "null"] },
    service: { type: "string" },
    date: { type: "string" },
    time: { type: "string" },
    endTime: { type: "string" },
    timezone: { type: "string" },
    status: { type: "string" },
    paymentStatus: { type: "string" },
    price: { type: "string" },
    canCancel: { type: "boolean" },
    canReschedule: { type: "boolean" },
    refundIfCancelledNow: { type: ["string", "null"] },
  },
  required: [
    "id",
    "reference",
    "business",
    "businessSlug",
    "address",
    "service",
    "date",
    "time",
    "endTime",
    "timezone",
    "status",
    "paymentStatus",
    "price",
    "canCancel",
    "canReschedule",
    "refundIfCancelledNow",
  ],
} as const;

const openedSchema = toolOutput({ shown: { type: "string" } }, ["shown"]);

export function myBookingsAgentTools(deps: Deps): ModelContextTool[] {
  return [listMyBookings(deps), changeBooking(deps, "cancel"), changeBooking(deps, "reschedule")];
}

/** One booking in words: date and times in the business's zone, money formatted. */
export function bookingSummary(b: CustomerBooking) {
  const tz = b.timezone;
  const money = (cents: number) => formatMoney(cents, b.currency);
  return {
    id: b.id,
    reference: b.reference,
    business: b.business.name,
    businessSlug: b.business.slug,
    address: shortAddress(b.business.address) || null,
    service: b.option ? `${b.service.name} (${b.option.name})` : b.service.name,
    date: toPlainDate(b.start, tz),
    time: toTimeOfDay(b.start, tz),
    endTime: toTimeOfDay(b.end, tz),
    timezone: tz,
    status: b.status,
    paymentStatus: b.paymentStatus,
    price: b.priceCents === 0 ? "Free" : money(b.priceCents),
    canCancel: b.canCancel,
    canReschedule: b.canReschedule,
    refundIfCancelledNow: b.refundPreview
      ? `${money(b.refundPreview.amountCents)} (${b.refundPreview.reason})`
      : null,
  };
}

function listMyBookings({ page }: Deps): ModelContextTool {
  return {
    name: "list_my_bookings",
    title: "My bookings",
    description:
      "The signed-in customer's bookings at every business: upcoming (soonest first) or past (latest first). " +
      "Each has its id (for cancel_booking and reschedule_booking), the business, service, date and times in the " +
      "business's timezone, status, price, whether it can still be cancelled or moved, and what cancelling now " +
      "would refund.",
    inputSchema: {
      type: "object",
      properties: {
        which: { type: "string", enum: ["upcoming", "past"], description: "Default upcoming." },
      },
    },
    outputSchema: toolOutput({ bookings: { type: "array", items: bookingSchema } }, ["bookings"]),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) => {
      const read = readInput(input);
      const which = read.string("which") ?? "upcoming";
      if (read.problems.length) return { error: read.problems.join("; ") };
      if (which !== "upcoming" && which !== "past") return { error: "which must be upcoming or past." };
      const { bookings } = page();
      if (!bookings) return { error: "Your bookings are still loading. Try again in a moment." };
      const list = sortByStart(which === "upcoming" ? bookings.upcoming : bookings.past, which);
      return { bookings: list.map(bookingSummary) };
    },
  };
}

const CHANGE = {
  cancel: {
    name: "cancel_booking",
    title: "Cancel a booking",
    description:
      "Opens the cancellation of one of the customer's upcoming bookings on the page, showing what it would " +
      "refund. The customer confirms it there, or keeps the booking: nothing is cancelled until they do. Check " +
      "with list_my_bookings afterwards.",
    allowed: (b: CustomerBooking) => b.canCancel,
    refused: "can't be cancelled online any more; the customer can contact the business",
    shown:
      "The page shows the cancellation for the customer to confirm (with any refund). Nothing is cancelled until " +
      "they do; call list_my_bookings to see what they chose.",
  },
  reschedule: {
    name: "reschedule_booking",
    title: "Move a booking",
    description:
      "Opens the move of one of the customer's upcoming bookings on the page, where they choose a new free time " +
      "and confirm it. Nothing moves until they do. Check with list_my_bookings afterwards.",
    allowed: (b: CustomerBooking) => b.canReschedule,
    refused: "can't be moved online any more; the customer can contact the business",
    shown:
      "The page shows the booking's free times for the customer to choose one and confirm. Nothing moves until " +
      "they do; call list_my_bookings to see the result.",
  },
} as const;

function changeBooking({ page }: Deps, action: "cancel" | "reschedule"): ModelContextTool {
  const c = CHANGE[action];
  return {
    name: c.name,
    title: c.title,
    description: c.description,
    inputSchema: {
      type: "object",
      properties: { bookingId: { type: "string", description: "The booking's id from list_my_bookings." } },
      required: ["bookingId"],
    },
    outputSchema: openedSchema,
    annotations: { consequentialHint: true },
    execute: (input) => {
      const read = readInput(input);
      const bookingId = read.string("bookingId");
      if (read.problems.length) return { error: read.problems.join("; ") };
      const { bookings, pending, request } = page();
      if (!bookings) return { error: "Your bookings are still loading. Try again in a moment." };
      // One at a time: another would take the customer's dialog away mid-way.
      if (pending)
        return {
          error:
            "The page is showing the customer a cancellation or move already; wait until they finish it (check " +
            "with list_my_bookings).",
        };
      const booking = bookings.upcoming.find((b) => b.id === bookingId);
      if (!booking) return { error: "No upcoming booking has that id. Call list_my_bookings for the ids." };
      if (!c.allowed(booking)) return { error: `This booking ${c.refused}.` };
      request({ bookingId: booking.id, action });
      return { shown: c.shown };
    },
  };
}

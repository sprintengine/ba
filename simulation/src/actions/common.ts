/** Helpers the bots share: picking businesses, services and slots, and checking a new booking against the oracle. */
import type { Availability, BookingStatus, Service, Slot } from "@shared/api/types";
import { lastRequest } from "../http";
import { placementProblems } from "../oracle";
import type { Rng } from "../rng";
import type { ActionScope, Sim } from "../runtime";
import { calendarOf, type SimBusiness } from "../shadow";
import { addDays, localParts } from "../time";

export function todayIn(b: SimBusiness, now = Date.now()): string {
  return localParts(now, b.timeZone).date;
}

/** Active services, optionally public ones only, in a stable order (by name, not id: ids differ between replays). */
export function activeServices(b: SimBusiness, publicOnly = false): Service[] {
  return [...b.services.values()]
    .filter((s) => s.isActive && (!publicOnly || s.isPublic))
    .sort((x, y) => x.name.localeCompare(y.name));
}

export function isGroup(s: Service): boolean {
  return s.capacity > 1;
}

/** Whether the service is paid online when a customer books it (the backend's `needsOnlinePayment`). */
export function needsOnlinePayment(s: Service): boolean {
  return (s.paymentMode === "full" || s.paymentMode === "deposit") && s.priceCents > 0;
}

/** A date range to look for times in: mostly the next few days (so bookings happen while the run lasts). */
export function lookahead(rng: Rng, b: SimBusiness): { from: string; to: string } {
  const from = todayIn(b);
  const span = rng.weighted([
    [1, 4],
    [3, 3],
    [7, 2],
    [14, 1],
  ] as const);
  return { from, to: addDays(from, span) };
}

export function slotsOf(availability: Availability): Slot[] {
  return availability.days.flatMap((d) => d.slots);
}

/** A slot, leaning towards the soonest (they start, end and get outcomes within a run). */
export function pickSlot(rng: Rng, slots: Slot[]): Slot | undefined {
  if (slots.length === 0) return undefined;
  if (rng.chance(0.5)) return rng.pick(slots.slice(0, 6));
  return rng.pick(slots);
}

/** A config snapshot to tell whether a business changed while a request was in flight. */
export function configMark(b: SimBusiness): number | null {
  return b.configBusy > 0 ? null : b.configVersion;
}

export function configStable(b: SimBusiness, mark: number | null): boolean {
  return mark !== null && b.configBusy === 0 && b.configVersion === mark;
}

/** An Idempotency-Key from the action's stream (8 to 100 of `[A-Za-z0-9_\-:.]`). */
export function idempotencyKey(sim: Sim, a: ActionScope, n = 0): string {
  return `sim-${sim.tag}-${a.seq}-${n}-${a.rng.token(10)}`;
}

/**
 * The status a new booking should start in: held while it waits for an online payment, pending approval for a
 * customer's request of an approval-only service, else confirmed.
 */
export function expectedFirstStatus(
  s: Service,
  mode: "public" | "staff",
  paysOnline: boolean,
): BookingStatus {
  if (paysOnline) return "held";
  if (mode === "public" && s.requiresApproval) return "pending_approval";
  return "confirmed";
}

export type CreatedBookingFacts = {
  bookingId: string;
  status: BookingStatus;
  start: string;
  end: string;
  priceCents: number;
  resourceIds: string[];
  holdExpiresAt: string | null;
};

/**
 * Checks a booking the server just created (or moved) against the service it was made for and the oracle: valid-slot
 * (open hours, grid, notice, advance) and creation-contract (duration, resources, price, first status). Only when the
 * business's configuration didn't change while the request was in flight; otherwise what was offered is unknowable.
 */
export function checkNewBooking(
  sim: Sim,
  b: SimBusiness,
  service: Service,
  mark: number | null,
  facts: CreatedBookingFacts,
  opts: {
    mode: "public" | "staff";
    expectedStatus?: BookingStatus;
    durationMinutes?: number;
    moved?: boolean;
  },
) {
  if (!configStable(b, mark)) return;
  const request = lastRequest();
  if (!request) return;
  const ctx = { businessId: b.id, bookingId: facts.bookingId };
  const start = new Date(facts.start);
  const end = new Date(facts.end);
  const duration = opts.durationMinutes ?? service.durationMinutes;
  if (end.getTime() - start.getTime() !== duration * 60_000) {
    sim.violate(
      "creation-contract",
      `booking ${facts.bookingId} lasts ${(end.getTime() - start.getTime()) / 60_000} minutes, ${service.name} takes ${duration}`,
      ctx,
    );
  }
  if (!opts.moved && facts.priceCents !== service.priceCents) {
    sim.violate(
      "creation-contract",
      `booking ${facts.bookingId} costs ${facts.priceCents}, ${service.name} is ${service.priceCents}`,
      ctx,
    );
  }
  if (opts.expectedStatus && facts.status !== opts.expectedStatus) {
    sim.violate(
      "creation-contract",
      `booking ${facts.bookingId} of ${service.name} started ${facts.status}, expected ${opts.expectedStatus}`,
      ctx,
    );
  }
  if (facts.status === "held") {
    const expires = facts.holdExpiresAt ? Date.parse(facts.holdExpiresAt) : NaN;
    // Stripe Checkout can't expire sooner than 30 minutes, so with Stripe a hold lasts at least 31.
    const hold = Math.max(b.policies.holdMinutes, sim.payer.minHoldMinutes) * 60_000;
    if (!(expires >= request.sentAt + hold - 5_000 && expires <= request.receivedAt + hold + 5_000)) {
      sim.violate(
        "creation-contract",
        `held booking ${facts.bookingId} expires at ${String(facts.holdExpiresAt)}, expected ${hold / 60_000} minutes after booking`,
        ctx,
      );
    }
  }
  const problems = placementProblems({
    timeZone: b.timeZone,
    start,
    end,
    bufferBeforeMinutes: service.bufferBeforeMinutes,
    bufferAfterMinutes: service.bufferAfterMinutes,
    stepMinutes: service.slotIntervalMinutes ?? duration,
    resourceIds: facts.resourceIds,
    requirements: service.requirements.map((r) => ({
      quantity: r.quantity,
      resourceIds: r.resourceIds.filter((id) => b.resources.get(id)?.active !== false),
    })),
    calendars: new Map([...b.resources.values()].map((r) => [r.id, calendarOf(r)])),
    closures: [...b.closures.values()],
    mode: opts.mode,
    minNoticeMinutes: service.minNoticeMinutes ?? b.policies.minNoticeMinutes,
    maxAdvanceDays: service.maxAdvanceDays ?? b.policies.maxAdvanceDays,
    sentAt: request.sentAt,
    receivedAt: request.receivedAt,
  });
  for (const problem of problems) {
    sim.violate(
      "valid-slot",
      `booking ${facts.bookingId} (${service.name} at ${facts.start}): ${problem}`,
      ctx,
    );
  }
}

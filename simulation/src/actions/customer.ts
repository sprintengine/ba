/**
 * Customer bots: they browse, book (guests through the public booking endpoint with an Idempotency-Key, some signed
 * in), pay or abandon payment, race each other for the same time, fill group sessions to the last seat, and manage
 * their bookings through the emailed manage link (cancel, reschedule, pay later).
 */
import { publicApi } from "@shared/api/public";
import type { BookingResult, CreatePublicBooking, ManagedBooking, Service, Slot } from "@shared/api/types";
import { currentCall, focus, lastRequest } from "../http";
import { compareWithServer } from "../consistency";
import { expectedRefunds } from "../refunds";
import type { ActionScope, Sim } from "../runtime";
import { BLOCKING, selfTransitions, type SimBooking, type SimBusiness } from "../shadow";
import { addDays, localParts, zonedInstant } from "../time";
import { checkPlanLimitRefusal } from "./limits";
import {
  activeServices,
  checkNewBooking,
  configMark,
  configStable,
  expectedFirstStatus,
  idempotencyKey,
  isGroup,
  lookahead,
  needsOnlinePayment,
  pickSlot,
  slotsOf,
  todayIn,
} from "./common";

/** Codes a public booking may legitimately be refused with while other bots and owners act. */
const BOOKING_REFUSALS = ["SLOT_UNAVAILABLE", "PLAN_LIMIT_REACHED"];
/** ...and when the owner changed the service meanwhile. */
const CHANGED_SERVICE = ["NOT_FOUND", "PRICE_CHANGED", "INVALID_REQUEST", "POLICY_VIOLATION"];

type Pick = { b: SimBusiness; service: Service; slot: Slot; mark: number | null };

/** A business to visit: one of the simulated ones, the plan-limit one rarely once it is full. */
export function pickBusiness(sim: Sim, a: ActionScope): SimBusiness | undefined {
  const live = sim.world.businesses.filter((b) => !b.dormant);
  const open = live.filter((b) => b.cappedMonth !== todayIn(b).slice(0, 7));
  const b = open.length > 0 && !a.rng.chance(0.03) ? a.rng.pick(open) : a.rng.maybePick(live);
  focus(b?.id);
  return b;
}

/** Finds a free time to book: a public service, its availability over the next days, one of its slots. */
async function findSlot(
  sim: Sim,
  a: ActionScope,
  b: SimBusiness,
  filter?: (s: Service) => boolean,
): Promise<Pick | null> {
  const services = activeServices(b, true).filter((s) => !filter || filter(s));
  const service = a.rng.maybePick(services);
  if (!service) return null;
  const mark = configMark(b);
  const range = lookahead(a.rng, b);
  const availability = await a.expect(
    "public availability",
    publicApi.availability(b.slug, { serviceId: service.id, from: range.from, to: range.to }),
    ["NOT_FOUND"],
  );
  if (!availability.ok) return null;
  const slot = pickSlot(a.rng, slotsOf(availability.value));
  return slot ? { b, service, slot, mark } : null;
}

/** One of the run's customers; the action's log lines carry their name from here on. */
function customerFor(sim: Sim, a: ActionScope) {
  const i = a.rng.int(0, sim.customers.length - 1);
  const call = currentCall();
  if (call) call.actor = `customer-${i + 1}`;
  return sim.customers[i]!;
}

function bookingBody(
  sim: Sim,
  pick: Pick,
  customer: { name: string; email: string },
  payment: "online" | "at_venue",
): CreatePublicBooking {
  return {
    serviceId: pick.service.id,
    optionId: null,
    addonIds: [],
    groupId: null,
    resourceId: null,
    start: pick.slot.start,
    customer: { name: customer.name, email: customer.email, phone: null },
    answers: {},
    customerNotes: null,
    returnUrl: sim.options.appUrl,
    payment,
    expectedTotalCents: pick.service.priceCents,
  };
}

/** Records a booking the server created for a customer, after checking it against the service and the oracle. */
function recordCreated(
  sim: Sim,
  a: ActionScope,
  pick: Pick,
  result: BookingResult,
  payment: "online" | "at_venue",
  email: string,
): SimBooking {
  const { b, service } = pick;
  const booking = result.booking;
  const paysOnline = payment === "online" && needsOnlinePayment(service);
  checkNewBooking(
    sim,
    b,
    service,
    pick.mark,
    {
      bookingId: booking.id,
      status: booking.status,
      start: booking.start,
      end: booking.end,
      priceCents: booking.priceCents,
      resourceIds: booking.resources.map((r) => r.id),
      holdExpiresAt: booking.holdExpiresAt,
    },
    { mode: "public", expectedStatus: expectedFirstStatus(service, "public", paysOnline) },
  );
  if (booking.start !== pick.slot.start && Date.parse(booking.start) !== Date.parse(pick.slot.start)) {
    sim.violate("creation-contract", `asked for ${pick.slot.start}, booked ${booking.start}`, {
      bookingId: booking.id,
      businessId: b.id,
    });
  }
  const created = sim.world.addBooking({
    id: booking.id,
    businessId: b.id,
    serviceId: service.id,
    reference: booking.reference,
    source: "public",
    status: booking.status,
    start: booking.start,
    end: booking.end,
    resourceIds: booking.resources.map((r) => r.id),
    manageToken: result.manageToken,
    customerEmail: email,
    priceCents: booking.priceCents,
    paidOnlineCents: 0,
    paidInPersonCents: 0,
    holdExpiresAt: booking.holdExpiresAt,
    checkoutUrl: result.next.checkoutUrl,
    group: isGroup(service),
  });
  return a.claim(created);
}

/** After a successful payment: the booking is confirmed (or waits for approval) and its amount is paid. */
async function pay(
  sim: Sim,
  a: ActionScope,
  booking: SimBooking,
  checkoutUrl: string,
  service: Service | undefined,
) {
  const outcome = a.rng.chance(0.85) ? "succeeded" : "cancelled";
  const b = sim.world.business(booking.businessId);
  const mark = b ? configMark(b) : null;
  const paid = await a.expect(`complete payment (${outcome})`, sim.payer.complete(checkoutUrl, outcome), [
    "POLICY_VIOLATION",
  ]);
  if (!paid.ok || paid.value === "unsupported") return "pay_failed";
  if (!booking.manageToken) return paid.value;
  const view = await settledView(sim, a, booking.manageToken);
  if (!view) return paid.value;
  if (paid.value === "paid") {
    const due = view.depositCents ?? view.priceCents;
    booking.paidOnlineCents = due;
    // Whether a paid request waits for approval follows the service when the payment lands (the backend reads it
    // then): either is possible if the owner changed the service meanwhile.
    const current = b?.services.get(booking.serviceId) ?? service;
    const expected =
      !b || !configStable(b, mark)
        ? ["confirmed", "pending_approval"]
        : current?.requiresApproval
          ? ["pending_approval"]
          : ["confirmed"];
    // Paid after the hold lapsed and the time was taken: cancelled and refunded in full (the "late payment" path).
    if (!expected.includes(view.status) && view.status !== "cancelled") {
      sim.violate(
        "state-consistency",
        `paid booking ${booking.id} is ${view.status}, expected ${expected.join(" or ")}`,
        {
          bookingId: booking.id,
          businessId: booking.businessId,
        },
      );
    }
    if (view.amountPaidCents !== due) {
      sim.violate(
        "state-consistency",
        `paid booking ${booking.id} shows ${view.amountPaidCents} paid, the checkout was for ${due}`,
        {
          bookingId: booking.id,
          businessId: booking.businessId,
        },
      );
    }
    if (view.status === "cancelled")
      booking.refunds.push({ amounts: [due], at: Date.now(), by: "business", override: "late-payment" });
  } else if (view.status !== "expired") {
    sim.violate(
      "state-consistency",
      `booking ${booking.id} whose checkout was cancelled is ${view.status}, expected expired`,
      {
        bookingId: booking.id,
        businessId: booking.businessId,
      },
    );
  }
  syncFromManaged(sim, booking, view);
  return paid.value;
}

/**
 * The booking after its checkout: at once with the dev provider; with Stripe, once its webhook has confirmed the
 * payment (the redirect back comes first), so it is read until it stops being held, for up to a minute and a half.
 */
async function settledView(sim: Sim, a: ActionScope, token: string): Promise<ManagedBooking | null> {
  const deadline = Date.now() + (sim.payer.confirmsAtOnce ? 0 : 90_000);
  for (;;) {
    const view = await a.must("manage view after payment", publicApi.manage(token));
    if (!view || view.status !== "held" || Date.now() >= deadline) return view;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

function syncFromManaged(sim: Sim, booking: SimBooking, view: ManagedBooking) {
  sim.world.sync(booking, { ...view, resourceIds: view.resources.map((r) => r.id) });
}

/** Books one time. Paid services are paid now, cancelled at checkout or abandoned (their hold lapses). */
export async function book(sim: Sim, a: ActionScope): Promise<string> {
  const b = pickBusiness(sim, a);
  if (!b) return "skipped";
  const pick = await findSlot(sim, a, b);
  if (!pick) return "no_slot";
  const customer = customerFor(sim, a);
  const signedIn = a.rng.chance(0.2);
  const payment = pick.service.allowPayAtVenue && a.rng.chance(0.3) ? "at_venue" : "online";
  const body = bookingBody(sim, pick, customer, payment);
  const key = idempotencyKey(sim, a);
  const create = () => publicApi.createBooking(b.slug, body, key);
  const result = await (signedIn
    ? sim.as(customer, a.actor, () =>
        a.expect("public booking", create(), [...BOOKING_REFUSALS, ...CHANGED_SERVICE]),
      )
    : a.expect("public booking", create(), [...BOOKING_REFUSALS, ...CHANGED_SERVICE]));
  if (!result.ok) {
    if (result.code === "PLAN_LIMIT_REACHED") await checkPlanLimitRefusal(sim, a, b);
    return result.code.toLowerCase();
  }
  const booking = recordCreated(sim, a, pick, result.value, payment, customer.email);

  // Idempotency: now and then the same request again (same key) and a different one with the same key.
  if (a.rng.chance(0.15)) await checkIdempotency(sim, a, b, body, key, result.value);

  if (result.value.next.type === "payment_required" && result.value.next.checkoutUrl) {
    if (!sim.payer.willPay(a.rng)) return "abandoned_payment";
    return sim.world.working(booking, () =>
      pay(sim, a, booking, result.value.next.checkoutUrl!, pick.service),
    );
  }
  return result.value.next.type;
}

async function checkIdempotency(
  sim: Sim,
  a: ActionScope,
  b: SimBusiness,
  body: CreatePublicBooking,
  key: string,
  first: BookingResult,
) {
  const again = await a.expect("repeated booking request", publicApi.createBooking(b.slug, body, key), [
    "CONFLICT",
  ]);
  if (again.ok && again.value.booking.id !== first.booking.id) {
    sim.violate(
      "idempotency",
      `same Idempotency-Key gave booking ${again.value.booking.id}, first ${first.booking.id}`,
      {
        businessId: b.id,
        bookingId: first.booking.id,
      },
    );
  }
  const status = lastRequest()?.status;
  if (again.ok && status !== 200) {
    sim.violate("idempotency", `a replayed booking request answered ${String(status)}, expected 200`, {
      businessId: b.id,
    });
  }
  // A different body with the same key: refused, nothing booked.
  const other = { ...body, start: new Date(Date.parse(body.start) + 7 * 86_400_000).toISOString() };
  const different = await a.expect(
    "same key, different booking",
    publicApi.createBooking(b.slug, other, key),
    ["CONFLICT"],
  );
  if (different.ok) {
    sim.violate(
      "idempotency",
      `a different booking request with a used Idempotency-Key was accepted (${different.value.booking.id})`,
      {
        businessId: b.id,
        bookingId: different.value.booking.id,
      },
    );
  }
}

/**
 * Several customers book the same time at once. One-seat services: the winners must have been given different
 * resources; group services: never more winners than seats.
 */
export async function race(sim: Sim, a: ActionScope): Promise<string> {
  const b = pickBusiness(sim, a);
  if (!b) return "skipped";
  const pick = await findSlot(sim, a, b, (s) => !needsOnlinePayment(s) || a.rng.chance(0.5));
  if (!pick) return "no_slot";
  const racers = a.rng.int(3, isGroup(pick.service) ? (pick.slot.seatsLeft ?? 1) + 3 : 6);
  const results = await Promise.all(
    Array.from({ length: racers }, (_, i) => {
      const customer = sim.customers[(a.seq * 7 + i) % sim.customers.length]!;
      const body = bookingBody(sim, pick, customer, "online");
      return a
        .expect(
          `racing booking ${i + 1}/${racers}`,
          publicApi.createBooking(b.slug, body, idempotencyKey(sim, a, i)),
          [...BOOKING_REFUSALS, ...CHANGED_SERVICE],
        )
        .then((r) => (r.ok ? [{ result: r.value, email: customer.email }] : []));
    }),
  );
  const winners = results.flat().map((w) => {
    recordCreated(sim, a, pick, w.result, "online", w.email);
    return w.result;
  });
  if (isGroup(pick.service)) {
    if (winners.length > pick.service.capacity) {
      sim.violate(
        "group-capacity",
        `${winners.length} of ${racers} racers got seats in a ${pick.service.capacity}-seat session`,
        {
          businessId: b.id,
          start: pick.slot.start,
        },
      );
    }
  } else {
    const seen = new Set<string>();
    for (const w of winners) {
      for (const r of w.booking.resources) {
        if (seen.has(r.id)) {
          sim.violate("no-overlap", `two racers for ${pick.slot.start} both got resource ${r.id}`, {
            businessId: b.id,
            bookingId: w.booking.id,
          });
        }
        seen.add(r.id);
      }
    }
  }
  // Racers who must pay walk away: their holds lapse.
  return `winners_${Math.min(winners.length, 3)}${winners.length > 3 ? "+" : ""}`;
}

/** Fills a group session to its last seat and one or two past it, all at once. */
export async function fillGroup(sim: Sim, a: ActionScope): Promise<string> {
  const b = pickBusiness(sim, a);
  if (!b) return "skipped";
  const pick = await findSlot(sim, a, b, (s) => isGroup(s));
  if (!pick || pick.slot.seatsLeft === null) return "no_slot";
  const tries = pick.slot.seatsLeft + a.rng.int(1, 2);
  const results = await Promise.all(
    Array.from({ length: tries }, (_, i) => {
      const customer = sim.customers[(a.seq * 5 + i) % sim.customers.length]!;
      const body = bookingBody(sim, pick, customer, "online");
      return a
        .expect(
          `group seat ${i + 1}/${tries}`,
          publicApi.createBooking(b.slug, body, idempotencyKey(sim, a, i)),
          [...BOOKING_REFUSALS, ...CHANGED_SERVICE],
        )
        .then((r) => (r.ok ? [{ result: r.value, email: customer.email }] : []));
    }),
  );
  const winners = results.flat().map((w) => {
    recordCreated(sim, a, pick, w.result, "online", w.email);
    return w.result;
  });
  if (winners.length > pick.service.capacity) {
    sim.violate(
      "group-capacity",
      `${winners.length} bookings in a ${pick.service.capacity}-seat session at ${pick.slot.start}`,
      {
        businessId: b.id,
      },
    );
  }
  // Pay for some seats so paid sessions also have confirmed seats.
  for (const w of winners) {
    const booking = sim.world.booking(w.booking.id);
    if (booking && w.next.type === "payment_required" && w.next.checkoutUrl && sim.payer.willPay(a.rng)) {
      await sim.world.working(booking, () => pay(sim, a, booking, w.next.checkoutUrl!, pick.service));
    }
  }
  return winners.length >= pick.slot.seatsLeft ? "filled" : "partly_filled";
}

/** A booking of a customer's (one with a manage link) that is in [statuses] and nobody is working on. */
function ownBooking(sim: Sim, a: ActionScope, statuses: readonly string[]): SimBooking | undefined {
  const candidates = sim.world.liveBookings(
    (x) => x.manageToken !== null && x.busy === 0 && statuses.includes(x.status),
  );
  return a.rng.maybePick(candidates);
}

/** Cancels through the manage link; the refund is checked later against the policy. */
export async function cancel(sim: Sim, a: ActionScope): Promise<string> {
  const booking = ownBooking(sim, a, [...BLOCKING]);
  if (!booking) return "skipped";
  const b = sim.world.business(booking.businessId)!;
  return sim.world.working(booking, async () => {
    const view = await a.expect("manage view", publicApi.manage(booking.manageToken!), []);
    if (!view.ok) return "failed";
    if (!selfTransitions(booking.status, booking.end, Date.now()).includes(view.value.status)) {
      sim.violate(
        "state-consistency",
        `booking ${booking.id} is ${view.value.status}, last seen ${booking.status}`,
        {
          bookingId: booking.id,
          businessId: b.id,
        },
      );
    }
    syncFromManaged(sim, booking, view.value);
    if (!BLOCKING.has(view.value.status)) return "not_active";
    const policy = { ...b.policies };
    const mark = configMark(b);
    const result = await a.expect(
      "customer cancel",
      publicApi.cancelManaged(booking.manageToken!, { reason: "Simulated change of plans" }),
      ["POLICY_VIOLATION"],
    );
    const request = lastRequest()!;
    if (!result.ok) {
      // A hold can lapse between the look and the cancel (the expiry job runs every minute): that refusal is fine.
      const holdLapsed =
        view.value.status === "held" &&
        view.value.holdExpiresAt !== null &&
        Date.parse(view.value.holdExpiresAt) <= request.receivedAt;
      if (view.value.canCancel && !holdLapsed && Date.parse(booking.start) > request.receivedAt + 60_000) {
        sim.violate(
          "expected-outcome",
          `booking ${booking.id} said it could be cancelled, then refused: ${result.message}`,
          {
            bookingId: booking.id,
            businessId: b.id,
          },
        );
      }
      return "refused";
    }
    if (result.value.status !== "cancelled") {
      sim.violate("state-consistency", `cancelled booking ${booking.id} is ${result.value.status}`, {
        bookingId: booking.id,
        businessId: b.id,
      });
    }
    if (mark !== null && b.configVersion === mark) {
      booking.refunds.push({
        amounts: expectedRefunds({
          by: "customer",
          override: "policy",
          start: Date.parse(booking.start),
          sentAt: request.sentAt,
          receivedAt: request.receivedAt,
          noticeHours: policy.cancellationNoticeHours,
          latePercent: policy.lateCancellationRefundPercent,
          paidOnlineCents: view.value.amountPaidCents - view.value.amountPaidInPersonCents,
          refundedCents: view.value.amountRefundedCents,
        }),
        at: Date.now(),
        by: "customer",
        override: "policy",
      });
    } else {
      booking.refunds.push({ amounts: [], at: Date.now(), by: "customer", override: "unknown-policy" });
    }
    syncFromManaged(sim, booking, result.value);
    return "cancelled";
  });
}

/** Moves a booking through the manage link to another time it offers. */
export async function reschedule(sim: Sim, a: ActionScope): Promise<string> {
  const booking = ownBooking(sim, a, ["confirmed", "pending_approval"]);
  if (!booking) return "skipped";
  const b = sim.world.business(booking.businessId)!;
  const service = b.services.get(booking.serviceId);
  return sim.world.working(booking, async () => {
    const mark = configMark(b);
    const range = lookahead(a.rng, b);
    const availability = await a.expect(
      "manage availability",
      publicApi.manageAvailability(booking.manageToken!, range),
      ["POLICY_VIOLATION", "NOT_FOUND"],
    );
    if (!availability.ok) return "no_slots";
    const slots = slotsOf(availability.value).filter(
      (s) => Date.parse(s.start) !== Date.parse(booking.start),
    );
    const slot = a.rng.maybePick(slots);
    if (!slot) return "no_slot";
    const duration = (Date.parse(booking.end) - Date.parse(booking.start)) / 60_000;
    const result = await a.expect(
      "customer reschedule",
      publicApi.rescheduleManaged(booking.manageToken!, { start: slot.start }),
      ["SLOT_UNAVAILABLE", "POLICY_VIOLATION"],
    );
    if (!result.ok) return result.code.toLowerCase();
    if (Date.parse(result.value.start) !== Date.parse(slot.start)) {
      sim.violate("creation-contract", `moved to ${slot.start}, booking says ${result.value.start}`, {
        bookingId: booking.id,
        businessId: b.id,
      });
    }
    if (service) {
      checkNewBooking(
        sim,
        b,
        service,
        mark,
        {
          bookingId: booking.id,
          status: result.value.status,
          start: result.value.start,
          end: result.value.end,
          priceCents: result.value.priceCents,
          resourceIds: result.value.resources.map((r) => r.id),
          holdExpiresAt: result.value.holdExpiresAt,
        },
        { mode: "public", expectedStatus: booking.status, durationMinutes: duration, moved: true },
      );
    }
    syncFromManaged(sim, booking, result.value);
    return "moved";
  });
}

/** Pays later for a booking still held (the manage page's "Pay now"). */
export async function payLater(sim: Sim, a: ActionScope): Promise<string> {
  const booking = ownBooking(sim, a, ["held"]);
  if (!booking) return "skipped";
  const b = sim.world.business(booking.businessId)!;
  return sim.world.working(booking, async () => {
    const link = await a.expect("pay held booking", publicApi.payManaged(booking.manageToken!), [
      "POLICY_VIOLATION",
    ]);
    if (!link.ok) {
      // Only once the hold has lapsed.
      if (booking.holdExpiresAt && Date.parse(booking.holdExpiresAt) > Date.now() + 5_000) {
        sim.violate(
          "expected-outcome",
          `held booking ${booking.id} (hold until ${booking.holdExpiresAt}) refused payment`,
          {
            bookingId: booking.id,
            businessId: b.id,
          },
        );
      }
      return "hold_over";
    }
    return pay(sim, a, booking, link.value.checkoutUrl, b.services.get(booking.serviceId));
  });
}

/** Looks at a booking through its manage link and compares it with what the bots know. */
export async function view(sim: Sim, a: ActionScope): Promise<string> {
  const candidates = sim.world.liveBookings((x) => x.manageToken !== null && x.busy === 0);
  const booking = a.rng.maybePick(candidates);
  if (!booking) return "skipped";
  const readFrom = Date.now();
  const result = await a.must("manage view", publicApi.manage(booking.manageToken!));
  if (!result) return "failed";
  return compareWithServer(sim, booking, result, readFrom) ? "ok" : "changed_meanwhile";
}

/**
 * Books at a time that is never offered (off the grid, at night, in the past, past the advance limit). The answer
 * must be a refusal; a booking made is a valid-slot violation (and is cancelled again).
 */
export async function probeInvalid(sim: Sim, a: ActionScope): Promise<string> {
  const b = pickBusiness(sim, a);
  if (!b) return "skipped";
  const service = a.rng.maybePick(activeServices(b, true));
  if (!service) return "skipped";
  const today = todayIn(b);
  const kind = a.rng.pick(["off_grid", "night", "past", "too_far"] as const);
  let start: Date;
  if (kind === "off_grid") {
    const availability = await a.expect(
      "public availability",
      publicApi.availability(b.slug, { serviceId: service.id, from: today, to: addDays(today, 3) }),
      ["NOT_FOUND"],
    );
    const slot = availability.ok ? a.rng.maybePick(slotsOf(availability.value)) : undefined;
    if (!slot) return "no_slot";
    start = new Date(Date.parse(slot.start) + 60_000);
  } else if (kind === "night") {
    start = zonedInstant(addDays(today, 1), 3 * 60, b.timeZone);
  } else if (kind === "past") {
    const nowLocal = localParts(Date.now(), b.timeZone);
    start = zonedInstant(today, Math.max(0, Math.floor(nowLocal.minutes / 30) * 30 - 120), b.timeZone);
    if (start.getTime() > Date.now()) start = new Date(Date.now() - 3_600_000);
  } else {
    const maxAdvance = service.maxAdvanceDays ?? b.policies.maxAdvanceDays;
    start = zonedInstant(addDays(today, maxAdvance + 2), 10 * 60, b.timeZone);
  }
  const customer = customerFor(sim, a);
  const body: CreatePublicBooking = {
    serviceId: service.id,
    optionId: null,
    addonIds: [],
    groupId: null,
    resourceId: null,
    start: start.toISOString(),
    customer: { name: customer.name, email: customer.email, phone: null },
    answers: {},
    customerNotes: null,
    returnUrl: sim.options.appUrl,
  };
  const result = await a.expect(
    `booking at an invalid time (${kind})`,
    publicApi.createBooking(b.slug, body, idempotencyKey(sim, a)),
    ["SLOT_UNAVAILABLE", "PLAN_LIMIT_REACHED", "INVALID_REQUEST", "NOT_FOUND"],
  );
  if (result.ok) {
    sim.violate(
      "valid-slot",
      `a booking at an invalid time (${kind}, ${body.start}) was accepted: ${result.value.booking.id}`,
      {
        businessId: b.id,
        bookingId: result.value.booking.id,
      },
    );
    await a.expect("cancel the invalid booking", publicApi.cancelManaged(result.value.manageToken, {}), [
      "POLICY_VIOLATION",
    ]);
    return "accepted";
  }
  return "refused";
}

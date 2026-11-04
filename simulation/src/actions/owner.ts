/**
 * Owner bots: they run the business from the dashboard's API. Bookings (approve or decline requests, book for
 * customers, cancel with refunds, move, record outcomes and payments taken in person), services (create, change, retire,
 * including who can do them), resources and their hours, time off and closures, the team and the policies.
 */
import { bookingsApi } from "@shared/api/bookings";
import { businessApi } from "@shared/api/business";
import { meApi } from "@shared/api/me";
import { resourcesApi } from "@shared/api/resources";
import { servicesApi } from "@shared/api/services";
import { teamApi } from "@shared/api/team";
import type { Booking, CreateStaffBooking, Service, ServiceInput } from "@shared/api/types";
import type { SimIdentity } from "../auth";
import { lastRequest } from "../http";
import type { OverrideLike } from "../oracle";
import { expectedRefunds, type RefundOverride } from "../refunds";
import type { ActionScope, Sim } from "../runtime";
import { identity, randomHours } from "../setup";
import {
  BLOCKING,
  ruleInputs,
  selfTransitions,
  type SimBooking,
  type SimBusiness,
  type SimMember,
} from "../shadow";
import { addDays, formatTime } from "../time";
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
  pickSlot,
  slotsOf,
  todayIn,
} from "./common";

/** Codes a configuration change may meet while other bots change the same business. */
const CONFIG_RACE = ["NOT_FOUND", "CONFLICT", "POLICY_VIOLATION"];

export function ownerOf(b: SimBusiness): { name: string; identity: SimIdentity } {
  return { name: `owner-${b.key}`, identity: b.owner };
}

function persons(b: SimBusiness) {
  return [...b.resources.values()]
    .filter((r) => r.active && r.name !== "Studio")
    .sort((x, y) => x.name.localeCompare(y.name));
}

function knownBooking(
  sim: Sim,
  a: ActionScope,
  b: SimBusiness,
  statuses: readonly string[],
): SimBooking | undefined {
  return a.rng.maybePick(
    sim.world.bookingsOf(b.id).filter((x) => x.busy === 0 && statuses.includes(x.status)),
  );
}

/** Reads a booking the bots know and checks it hasn't changed behind their back. Null when it can't be read. */
async function fresh(sim: Sim, a: ActionScope, b: SimBusiness, booking: SimBooking): Promise<Booking | null> {
  const server = await a.must("staff booking detail", bookingsApi.get(b.id, booking.id));
  if (!server) return null;
  if (!selfTransitions(booking.status, booking.end, Date.now()).includes(server.status)) {
    sim.violate(
      "state-consistency",
      `booking ${booking.id} is ${server.status}, last seen ${booking.status}`,
      {
        bookingId: booking.id,
        businessId: b.id,
      },
    );
  }
  sim.world.sync(booking, { ...server, resourceIds: server.resources.map((r) => r.id) });
  return server;
}

// ---- Bookings ----

export async function approve(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  const booking = knownBooking(sim, a, b, ["pending_approval"]);
  if (!booking) return "skipped";
  return sim.world.working(booking, async () => {
    const decline = a.rng.chance(0.25);
    if (decline) {
      const before = await fresh(sim, a, b, booking);
      if (!before || before.status !== "pending_approval") return "not_pending";
      const result = await a.expect(
        "decline request",
        bookingsApi.decline(b.id, booking.id, { reason: "Simulated: fully booked" }),
        ["POLICY_VIOLATION"],
      );
      if (!result.ok) return "refused";
      if (result.value.status !== "cancelled") {
        sim.violate("state-consistency", `declined booking ${booking.id} is ${result.value.status}`, {
          bookingId: booking.id,
          businessId: b.id,
        });
      }
      booking.refunds.push({
        amounts: [
          Math.max(0, before.amountPaidCents - before.amountPaidInPersonCents - before.amountRefundedCents),
        ],
        at: Date.now(),
        by: "business",
        override: "full",
      });
      sim.world.sync(booking, result.value);
      return "declined";
    }
    const result = await a.expect("approve request", bookingsApi.approve(b.id, booking.id), [
      "POLICY_VIOLATION",
    ]);
    if (!result.ok) {
      if (Date.parse(booking.start) > Date.now() + 60_000) {
        sim.violate(
          "expected-outcome",
          `a pending request starting ${booking.start} could not be approved: ${result.message}`,
          {
            bookingId: booking.id,
            businessId: b.id,
          },
        );
      }
      return "refused";
    }
    if (result.value.status !== "confirmed") {
      sim.violate("state-consistency", `approved booking ${booking.id} is ${result.value.status}`, {
        bookingId: booking.id,
        businessId: b.id,
      });
    }
    sim.world.sync(booking, result.value);
    return "approved";
  });
}

/** Books for a customer from the dashboard (staff bookings count towards the plan limit too). */
export async function staffBook(
  sim: Sim,
  a: ActionScope,
  b: SimBusiness,
  opts: {
    service?: Service;
    paymentMode?: CreateStaffBooking["paymentMode"];
    resourceIds?: string[] | null;
    onCreated?: (booking: SimBooking) => void;
  } = {},
): Promise<string> {
  const service = opts.service ?? a.rng.maybePick(activeServices(b));
  if (!service) return "skipped";
  const mark = configMark(b);
  const range = lookahead(a.rng, b);
  const availability = await a.expect(
    "staff availability",
    bookingsApi.availability(b.id, {
      serviceId: service.id,
      from: range.from,
      to: range.to,
      resourceId: opts.resourceIds?.[0] ?? null,
    }),
    ["NOT_FOUND", "FORBIDDEN"],
  );
  if (!availability.ok) return "no_slots";
  const slot = pickSlot(a.rng, slotsOf(availability.value));
  if (!slot) return "no_slot";
  const paymentMode = opts.paymentMode ?? a.rng.pick(["none", "at_venue", "collect_online"] as const);
  const n = a.seq;
  const body: CreateStaffBooking = {
    serviceId: service.id,
    optionId: null,
    addonIds: [],
    groupId: null,
    resourceIds:
      opts.resourceIds !== undefined ? opts.resourceIds : a.rng.chance(0.5) ? slot.resourceIds : null,
    start: slot.start,
    customerId: null,
    customer: {
      name: `Walk-in ${n} ${sim.tag}`,
      email: a.rng.chance(0.5) ? `sim-${sim.tag}-walkin${n}@example.test` : null,
      phone: null,
    },
    answers: {},
    internalNotes: "Booked by the simulation",
    paymentMode,
    notifyCustomer: a.rng.chance(0.5),
  };
  const result = await a.expect("staff booking", bookingsApi.create(b.id, body, idempotencyKey(sim, a)), [
    "SLOT_UNAVAILABLE",
    "PLAN_LIMIT_REACHED",
    "NOT_FOUND",
    "INVALID_REQUEST",
    "FORBIDDEN",
  ]);
  if (!result.ok) {
    if (result.code === "PLAN_LIMIT_REACHED") await checkPlanLimitRefusal(sim, a, b);
    // Staff booking their own calendar are refused only when an owner took their person off the service meanwhile.
    if (result.code === "FORBIDDEN" && configStable(b, mark)) {
      sim.violate(
        "expected-outcome",
        `a booking on the caller's own calendar was refused: ${result.message}`,
        {
          businessId: b.id,
        },
      );
    }
    return result.code.toLowerCase();
  }
  const created = result.value;
  checkNewBooking(
    sim,
    b,
    service,
    mark,
    {
      bookingId: created.id,
      status: created.status,
      start: created.start,
      end: created.end,
      priceCents: created.priceCents,
      resourceIds: created.resources.map((r) => r.id),
      holdExpiresAt: created.holdExpiresAt,
    },
    {
      mode: "staff",
      expectedStatus: expectedFirstStatus(
        service,
        "staff",
        paymentMode === "collect_online" && service.priceCents > 0,
      ),
    },
  );
  const booking = sim.world.addBooking({
    id: created.id,
    businessId: b.id,
    serviceId: service.id,
    reference: created.reference,
    source: "staff",
    status: created.status,
    start: created.start,
    end: created.end,
    resourceIds: created.resources.map((r) => r.id),
    manageToken: null,
    customerEmail: body.customer?.email ?? null,
    priceCents: created.priceCents,
    paidOnlineCents: 0,
    paidInPersonCents: 0,
    holdExpiresAt: created.holdExpiresAt,
    checkoutUrl: created.checkoutUrl,
    group: isGroup(service),
  });
  opts.onCreated?.(booking);
  // The customer pays the emailed link now and then.
  if (created.checkoutUrl && sim.payer.willPay(a.rng)) {
    await sim.world.working(booking, async () => {
      const paid = await a.expect(
        "pay staff booking link",
        sim.as(null, `customer-of-${b.key}`, () => sim.payer.complete(created.checkoutUrl!, "succeeded")),
        ["POLICY_VIOLATION"],
      );
      if (!paid.ok) return;
      const after = await settledDetail(sim, a, b, created.id);
      if (!after) return;
      booking.paidOnlineCents = after.amountPaidCents - after.amountPaidInPersonCents;
      if (after.status !== "confirmed" && after.status !== "cancelled") {
        sim.violate("state-consistency", `staff booking ${created.id} paid online is ${after.status}`, {
          bookingId: created.id,
          businessId: b.id,
        });
      }
      // Paid after its hold lapsed and the time was taken: cancelled and refunded in full.
      if (after.status === "cancelled") {
        booking.refunds.push({
          amounts: [booking.paidOnlineCents],
          at: Date.now(),
          by: "business",
          override: "late-payment",
        });
      }
      sim.world.sync(booking, { ...after, resourceIds: after.resources.map((r) => r.id) });
    });
  }
  return created.status;
}

/** A booking just paid for: at once with the dev provider, once Stripe's webhook has confirmed it otherwise. */
async function settledDetail(sim: Sim, a: ActionScope, b: SimBusiness, id: string): Promise<Booking | null> {
  const deadline = Date.now() + (sim.payer.confirmsAtOnce ? 0 : 90_000);
  for (;;) {
    const detail = await a.must("staff booking detail", bookingsApi.get(b.id, id));
    if (!detail || detail.status !== "held" || Date.now() >= deadline) return detail;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

export async function staffCancel(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  const booking = knownBooking(sim, a, b, [...BLOCKING]);
  if (!booking) return "skipped";
  return sim.world.working(booking, async () => {
    const before = await fresh(sim, a, b, booking);
    if (!before || !BLOCKING.has(before.status)) return "not_active";
    const refund = a.rng.weighted<RefundOverride>([
      ["policy", 3],
      ["full", 1],
      ["none", 1],
    ]);
    const result = await a.expect(
      "staff cancel",
      bookingsApi.cancel(b.id, booking.id, {
        reason: "Simulated: staff cancelled",
        refund,
        notifyCustomer: a.rng.chance(0.5),
      }),
      ["POLICY_VIOLATION"],
    );
    if (!result.ok) return "refused";
    const request = lastRequest()!;
    if (result.value.status !== "cancelled") {
      sim.violate("state-consistency", `cancelled booking ${booking.id} is ${result.value.status}`, {
        bookingId: booking.id,
        businessId: b.id,
      });
    }
    booking.refunds.push({
      amounts: expectedRefunds({
        by: "business",
        override: refund,
        start: Date.parse(before.start),
        sentAt: request.sentAt,
        receivedAt: request.receivedAt,
        noticeHours: b.policies.cancellationNoticeHours,
        latePercent: b.policies.lateCancellationRefundPercent,
        paidOnlineCents: before.amountPaidCents - before.amountPaidInPersonCents,
        refundedCents: before.amountRefundedCents,
      }),
      at: Date.now(),
      by: "business",
      override: refund,
    });
    sim.world.sync(booking, result.value);
    return `cancelled_${refund}`;
  });
}

export async function staffReschedule(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  const booking = knownBooking(sim, a, b, ["confirmed", "pending_approval"]);
  if (!booking) return "skipped";
  const service = b.services.get(booking.serviceId);
  if (!service) return "skipped";
  return sim.world.working(booking, async () => {
    const mark = configMark(b);
    const range = lookahead(a.rng, b);
    const availability = await a.expect(
      "staff reschedule availability",
      bookingsApi.availability(b.id, {
        serviceId: service.id,
        from: range.from,
        to: range.to,
        excludeBookingId: booking.id,
      }),
      ["NOT_FOUND", "POLICY_VIOLATION"],
    );
    if (!availability.ok) return "no_slots";
    const slot = a.rng.maybePick(
      slotsOf(availability.value).filter((s) => Date.parse(s.start) !== Date.parse(booking.start)),
    );
    if (!slot) return "no_slot";
    const duration = (Date.parse(booking.end) - Date.parse(booking.start)) / 60_000;
    const result = await a.expect(
      "staff reschedule",
      bookingsApi.reschedule(b.id, booking.id, {
        start: slot.start,
        resourceIds: null,
        notifyCustomer: a.rng.chance(0.5),
      }),
      ["SLOT_UNAVAILABLE", "POLICY_VIOLATION"],
    );
    if (!result.ok) return result.code.toLowerCase();
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
      { mode: "staff", expectedStatus: booking.status, durationMinutes: duration, moved: true },
    );
    sim.world.sync(booking, { ...result.value, resourceIds: result.value.resources.map((r) => r.id) });
    return "moved";
  });
}

/** Records completed or no-show for a booking that has started (and, now and then, tries one that hasn't). */
export async function outcome(
  sim: Sim,
  a: ActionScope,
  b: SimBusiness,
  onlyResource?: string,
): Promise<string> {
  const now = Date.now();
  const probeFuture = a.rng.chance(0.15);
  const candidates = sim.world
    .bookingsOf(b.id)
    .filter((x) => x.busy === 0 && ["confirmed", "completed", "no_show"].includes(x.status))
    .filter((x) => !onlyResource || x.resourceIds.includes(onlyResource))
    .filter((x) =>
      probeFuture
        ? Date.parse(x.start) > now + 120_000 && x.status === "confirmed"
        : Date.parse(x.start) < now - 5_000,
    );
  const booking = a.rng.maybePick(candidates);
  if (!booking) return "skipped";
  const status = a.rng.chance(0.8) ? "completed" : "no_show";
  return sim.world.working(booking, async () => {
    const result = await a.expect(
      `mark ${status}`,
      bookingsApi.setStatus(b.id, booking.id, status),
      probeFuture ? ["POLICY_VIOLATION"] : [],
    );
    if (probeFuture) {
      if (result.ok) {
        sim.violate(
          "expected-outcome",
          `booking ${booking.id} starting ${booking.start} was marked ${status} before it started`,
          {
            bookingId: booking.id,
            businessId: b.id,
          },
        );
        sim.world.sync(booking, result.value);
      }
      return result.ok ? "accepted_early" : "refused_early";
    }
    if (result.ok) {
      if (result.value.status !== status) {
        sim.violate("state-consistency", `booking ${booking.id} marked ${status} is ${result.value.status}`, {
          bookingId: booking.id,
          businessId: b.id,
        });
      }
      sim.world.sync(booking, result.value);
    }
    return result.ok ? status : "refused";
  });
}

export async function paidInPerson(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  const booking = knownBooking(sim, a, b, ["confirmed", "completed"]);
  if (!booking) return "skipped";
  return sim.world.working(booking, async () => {
    const before = await fresh(sim, a, b, booking);
    if (!before) return "failed";
    const due = before.priceCents - before.amountPaidCents;
    const payable = (before.paymentStatus === "pay_at_venue" || before.paymentStatus === "paid") && due > 0;
    if (!["confirmed", "completed"].includes(before.status)) return "skipped";
    const result = await a.expect(
      "record payment in person",
      bookingsApi.markPaidInPerson(b.id, booking.id),
      payable ? [] : ["POLICY_VIOLATION"],
    );
    if (!payable) {
      if (result.ok) {
        sim.violate("expected-outcome", `booking ${booking.id} with nothing due took a payment in person`, {
          bookingId: booking.id,
          businessId: b.id,
        });
      }
      return "nothing_due";
    }
    if (!result.ok) return "refused";
    booking.paidInPersonCents += due;
    if (result.value.amountPaidCents !== before.priceCents) {
      sim.violate(
        "state-consistency",
        `booking ${booking.id} paid in person shows ${result.value.amountPaidCents} of ${before.priceCents}`,
        {
          bookingId: booking.id,
          businessId: b.id,
        },
      );
    }
    sim.world.sync(booking, result.value);
    return "paid";
  });
}

// ---- Services ----

function poolFor(a: ActionScope, b: SimBusiness, quantity: number): string[] {
  const people = persons(b);
  return a.rng.sample(people, a.rng.int(Math.min(quantity, people.length), people.length)).map((r) => r.id);
}

/** A service an owner might add: one-to-one or a group class, any payment mode, maybe approval-only. */
export function randomServiceInput(a: ActionScope, b: SimBusiness): ServiceInput | null {
  const group = a.rng.chance(0.25);
  const studio = [...b.resources.values()].find((r) => r.active && r.name === "Studio");
  const pool = group && studio ? [studio.id] : poolFor(a, b, 1);
  if (pool.length === 0) return null;
  const paymentMode = a.rng.pick(["free", "at_venue", "full", "deposit"] as const);
  const priceCents = paymentMode === "free" ? 0 : a.rng.pick([1000, 2500, 4000, 6500]);
  const duration = a.rng.pick([15, 20, 30, 45, 60, 90]);
  return {
    name: `${group ? "Class" : "Service"} ${a.seq} ${a.rng.token(3)}`,
    description: "Added by an owner bot",
    category: "Simulated",
    color: a.rng.pick(["#4f46e5", "#0ea5e9", "#16a34a", "#db2777"]),
    durationMinutes: duration,
    bufferBeforeMinutes: a.rng.pick([0, 0, 5, 10]),
    bufferAfterMinutes: a.rng.pick([0, 0, 5, 15]),
    slotIntervalMinutes: a.rng.pick([null, 15, 30]),
    minNoticeMinutes: a.rng.chance(0.2) ? a.rng.pick([0, 10, 60]) : null,
    maxAdvanceDays: null,
    capacity: group ? a.rng.int(2, 8) : 1,
    priceCents,
    paymentMode,
    depositCents: paymentMode === "deposit" ? Math.floor(priceCents / 4) : null,
    allowPayAtVenue: (paymentMode === "full" || paymentMode === "deposit") && a.rng.chance(0.3),
    requiresApproval: a.rng.chance(0.2),
    locationType: "business",
    allowedGroupIds: [],
    isPublic: a.rng.chance(0.9),
    isActive: true,
    sortOrder: a.seq % 1000,
    options: [],
    addons: [],
    requirements: [
      {
        label: group ? "Room" : "Staff",
        quantity: 1,
        customerSelectable: false,
        resourceIds: pool,
        sortOrder: 0,
      },
    ],
  };
}

export async function serviceCreate(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  if (activeServices(b).length >= 12) return "enough";
  const input = randomServiceInput(a, b);
  if (!input) return "skipped";
  return sim.world.configuring(b, async () => {
    const result = await a.expect("create service", servicesApi.create(b.id, input), CONFIG_RACE);
    if (!result.ok) return "refused";
    b.services.set(result.value.id, result.value);
    return "created";
  });
}

/** The editable input of an existing service (requirements keep their ids, so they are updated in place). */
export function serviceInputOf(s: Service): ServiceInput {
  const { id: _id, ...rest } = s;
  return {
    ...rest,
    options: s.options.map((o) => ({ ...o })),
    addons: s.addons.map((x) => ({ ...x })),
    requirements: s.requirements.map((r) => ({ ...r })),
  };
}

/** Changes a service: price, length, buffers, approval, payment, and who can do it. Never its capacity. */
export async function serviceUpdate(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  const service = a.rng.maybePick(activeServices(b));
  if (!service) return "skipped";
  const input = serviceInputOf(service);
  const change = a.rng.pick([
    "price",
    "duration",
    "buffers",
    "approval",
    "payment",
    "staff",
    "staff",
    "visibility",
  ] as const);
  switch (change) {
    case "price":
      input.priceCents = input.paymentMode === "free" ? 0 : a.rng.pick([1500, 3000, 4500]);
      if (input.paymentMode === "deposit") input.depositCents = Math.max(1, Math.floor(input.priceCents / 3));
      break;
    case "duration":
      input.durationMinutes = a.rng.pick([15, 30, 45, 60]);
      break;
    case "buffers":
      input.bufferBeforeMinutes = a.rng.pick([0, 5, 10]);
      input.bufferAfterMinutes = a.rng.pick([0, 10, 15]);
      break;
    case "approval":
      input.requiresApproval = !input.requiresApproval;
      break;
    case "payment": {
      input.paymentMode = a.rng.pick(["free", "at_venue", "full", "deposit"] as const);
      input.priceCents = input.paymentMode === "free" ? 0 : Math.max(input.priceCents, 2000);
      input.depositCents = input.paymentMode === "deposit" ? Math.floor(input.priceCents / 4) : null;
      input.allowPayAtVenue =
        (input.paymentMode === "full" || input.paymentMode === "deposit") && a.rng.chance(0.3);
      break;
    }
    case "staff": {
      // Who can do it: a new pool of people for each requirement made of people (rooms stay as they are).
      const people = new Set(persons(b).map((r) => r.id));
      input.requirements = input.requirements.map((r) => {
        if (!r.resourceIds.every((id) => people.has(id) || !b.resources.get(id)?.active)) return r;
        const pool = poolFor(a, b, r.quantity);
        return pool.length >= r.quantity ? { ...r, resourceIds: pool } : r;
      });
      break;
    }
    case "visibility":
      input.isPublic = activeServices(b, true).length <= 2 ? true : !input.isPublic;
      break;
  }
  return sim.world.configuring(b, async () => {
    const result = await a.expect(
      `update service (${change})`,
      servicesApi.replace(b.id, service.id, input),
      CONFIG_RACE,
    );
    if (!result.ok) return "refused";
    if (result.value.capacity !== service.capacity) {
      sim.violate(
        "creation-contract",
        `updating ${service.name} changed its capacity ${service.capacity} → ${result.value.capacity}`,
        {
          businessId: b.id,
        },
      );
    }
    b.services.set(service.id, result.value);
    return change;
  });
}

/** Retires a service (deactivated when it has bookings). Keeps at least three. */
export async function serviceDelete(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  const services = activeServices(b);
  if (services.length <= 3 || b.limitScenario) return "keep";
  const service = a.rng.pick(services);
  return sim.world.configuring(b, async () => {
    const result = await a.expect("delete service", servicesApi.remove(b.id, service.id), CONFIG_RACE);
    if (!result.ok) return "refused";
    b.services.set(service.id, { ...service, isActive: false });
    // Deactivated or gone: either way not offered any more. Reload to know which.
    const list = await a.must("list services", servicesApi.list(b.id));
    if (list) {
      const after = list.find((s) => s.id === service.id);
      if (after) b.services.set(after.id, after);
      if (after?.isActive) {
        sim.violate("state-consistency", `deleted service ${service.name} is still active`, {
          businessId: b.id,
        });
      }
    }
    return "deleted";
  });
}

// ---- Resources, hours, time off, closures ----

export async function resourceCreate(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  if (persons(b).length >= 6) return "enough";
  const name = `Staff ${a.seq} ${a.rng.token(3)}`;
  return sim.world.configuring(b, async () => {
    const created = await a.expect(
      "create resource",
      resourcesApi.create(b.id, {
        kind: "person",
        name,
        description: null,
        color: "#16a34a",
        capacity: 1,
        memberId: null,
        isActive: true,
        sortOrder: a.seq % 1000,
      }),
      CONFIG_RACE,
    );
    if (!created.ok) return "refused";
    const rules = randomHours(a.rng);
    const set = await a.expect(
      "set new resource's hours",
      resourcesApi.replaceRules(b.id, created.value.id, ruleInputs(rules)),
      CONFIG_RACE,
    );
    b.resources.set(created.value.id, {
      id: created.value.id,
      name,
      active: true,
      rules: set.ok
        ? set.value.rules.map((r) => ({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime }))
        : [],
      overrideIds: new Map(),
      memberId: null,
    });
    return "created";
  });
}

/** Removes a person nobody is linked to (deactivated when they have bookings). Keeps at least three people. */
export async function resourceDelete(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  const people = persons(b);
  if (people.length <= 3 || b.limitScenario) return "keep";
  const resource = a.rng.maybePick(people.filter((r) => r.memberId === null));
  if (!resource) return "skipped";
  return sim.world.configuring(b, async () => {
    const result = await a.expect("delete resource", resourcesApi.remove(b.id, resource.id), CONFIG_RACE);
    if (!result.ok) return "refused";
    resource.active = false;
    // Services may have dropped it from their pools: reload them.
    const list = await a.must("list services", servicesApi.list(b.id));
    if (list) for (const s of list) b.services.set(s.id, s);
    return "deleted";
  });
}

export async function hoursChange(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  const resource = a.rng.maybePick(persons(b));
  if (!resource) return "skipped";
  const rules = randomHours(a.rng);
  return sim.world.configuring(b, async () => {
    const result = await a.expect(
      "replace weekly hours",
      resourcesApi.replaceRules(b.id, resource.id, ruleInputs(rules)),
      CONFIG_RACE,
    );
    if (!result.ok) return "refused";
    resource.rules = result.value.rules.map((r) => ({
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
    }));
    return "changed";
  });
}

/** Time off (whole or part of a day) or extra hours for one person, within the next week. */
export function randomOverride(
  a: ActionScope,
  b: SimBusiness,
  closure: boolean,
): OverrideLike & { reason: string } {
  const date = addDays(todayIn(b), a.rng.int(0, closure ? 13 : 6));
  const extra = !closure && a.rng.chance(0.25);
  if (extra) {
    const start = a.rng.pick([6 * 60, 20 * 60]);
    return {
      date,
      isAvailable: true,
      startTime: formatTime(start),
      endTime: formatTime(start + 120),
      reason: "Extra hours",
    };
  }
  if (a.rng.chance(0.3))
    return {
      date,
      isAvailable: false,
      startTime: null,
      endTime: null,
      reason: closure ? "Closed" : "Day off",
    };
  const start = a.rng.int(8, 17) * 60 + a.rng.pick([0, 30]);
  return {
    date,
    isAvailable: false,
    startTime: formatTime(start),
    endTime: formatTime(start + a.rng.pick([30, 60, 120])),
    reason: "Away",
  };
}

export async function timeOffAdd(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  const resource = a.rng.maybePick(persons(b));
  if (!resource) return "skipped";
  const o = randomOverride(a, b, false);
  return sim.world.configuring(b, async () => {
    const result = await a.expect(
      "add time off",
      resourcesApi.createOverride(b.id, resource.id, o),
      CONFIG_RACE,
    );
    if (!result.ok) return "refused";
    resource.overrideIds.set(result.value.id, o);
    return o.isAvailable ? "extra_hours" : "time_off";
  });
}

export async function timeOffRemove(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  const withOverrides = persons(b).filter((r) => r.overrideIds.size > 0);
  const resource = a.rng.maybePick(withOverrides);
  if (!resource) return "skipped";
  const id = a.rng.pick([...resource.overrideIds.keys()]);
  return sim.world.configuring(b, async () => {
    const result = await a.expect("remove time off", resourcesApi.deleteOverride(b.id, id), CONFIG_RACE);
    if (!result.ok) return "refused";
    resource.overrideIds.delete(id);
    return "removed";
  });
}

export async function closureAdd(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  if (b.closures.size >= 4) return "enough";
  const o = randomOverride(a, b, true);
  return sim.world.configuring(b, async () => {
    const result = await a.expect("add closure", resourcesApi.createClosure(b.id, o), CONFIG_RACE);
    if (!result.ok) return "refused";
    b.closures.set(result.value.id, o);
    return "closed";
  });
}

export async function closureRemove(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  const id = a.rng.maybePick([...b.closures.keys()]);
  if (!id) return "skipped";
  return sim.world.configuring(b, async () => {
    const result = await a.expect("remove closure", resourcesApi.deleteOverride(b.id, id), CONFIG_RACE);
    if (!result.ok) return "refused";
    b.closures.delete(id);
    return "removed";
  });
}

export async function policiesChange(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  const policies = {
    ...b.policies,
    cancellationNoticeHours: a.rng.pick([0, 1, 2, 24]),
    lateCancellationRefundPercent: a.rng.pick([0, 50, 100]),
    minNoticeMinutes: b.limitScenario ? 0 : a.rng.pick([0, 5, 15, 30]),
  };
  return sim.world.configuring(b, async () => {
    const result = await a.expect("update policies", businessApi.update(b.id, { policies }), CONFIG_RACE);
    if (!result.ok) return "refused";
    b.policies = result.value.policies;
    return "changed";
  });
}

// ---- Team ----

/** Seats taken on the plan: active members and pending invitations (the owner included). */
export function seats(b: SimBusiness): number {
  return [...b.members.values()].length + 1;
}

/**
 * Invites a staff member linked to a person nobody is linked to, and the staff bot accepts (signing in accepts
 * invitations for their email). On the Free plan a fourth seat is refused with PLAN_LIMIT_REACHED.
 */
export async function teamInvite(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  const resource = a.rng.maybePick(persons(b).filter((r) => r.memberId === null));
  const full = seats(b) >= 3;
  const staff = identity(sim.tag, `staff${b.key}x`, a.seq, sim.auth.namespace);
  const result = await a.expect(
    "invite staff",
    teamApi.invite(b.id, { email: staff.email, role: "staff", resourceId: resource?.id ?? null }),
    full ? ["PLAN_LIMIT_REACHED"] : ["PLAN_LIMIT_REACHED", "CONFLICT"],
  );
  if (!result.ok) {
    if (result.code === "PLAN_LIMIT_REACHED" && !full)
      await checkTeamSize(sim, a, b, "refused an invitation with a seat free");
    return result.code.toLowerCase();
  }
  const member: SimMember = {
    id: result.value.id,
    identity: staff,
    role: "staff",
    status: "invited",
    resourceId: resource?.id ?? null,
  };
  b.members.set(member.id, member);
  if (resource) resource.memberId = member.id;
  // The staff member signs in: /v1/me accepts the invitation for their email.
  const me = await sim.as(staff, `staff-${b.key}-${a.seq}`, () => a.must("staff signs in", meApi.me()));
  if (me && me.memberships.some((m) => m.businessId === b.id)) member.status = "active";
  await checkTeamSize(sim, a, b, "after an invitation");
  return member.status;
}

export async function teamRemove(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  const member = a.rng.maybePick([...b.members.values()]);
  if (!member) return "skipped";
  return sim.world.configuring(b, async () => {
    const result = await a.expect("remove member", teamApi.remove(b.id, member.id), CONFIG_RACE);
    if (!result.ok) return "refused";
    b.members.delete(member.id);
    for (const r of b.resources.values()) if (r.memberId === member.id) r.memberId = null;
    return "removed";
  });
}

/** The team list: at most 3 members and invitations on the Free plan. */
export async function checkTeamSize(sim: Sim, a: ActionScope, b: SimBusiness, when: string) {
  const team = await a.must("team list", teamApi.list(b.id));
  if (!team) return;
  if (team.length > 3) {
    sim.violate(
      "member-cap",
      `a Free business has ${team.length} members and invitations (${when})`,
      { businessId: b.id },
      `${b.id}|${team.length}`,
    );
  }
}

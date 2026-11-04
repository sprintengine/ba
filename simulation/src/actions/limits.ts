/**
 * The Free plan's limits: 100 bookings a calendar month (in the business's timezone; staff bookings count, expired
 * holds don't) and 3 team members. The scenario drives one business to the limit at the start of a run, then races
 * past it; afterwards any refusal anywhere is checked against the business's usage.
 */
import { billingApi } from "@shared/api/billing";
import { bookingsApi } from "@shared/api/bookings";
import { publicApi } from "@shared/api/public";
import { teamApi } from "@shared/api/team";
import type { Slot } from "@shared/api/types";
import type { ActionScope, Sim } from "../runtime";
import type { SimBusiness } from "../shadow";
import { addDays } from "../time";
import { activeServices, idempotencyKey, slotsOf, todayIn } from "./common";

export const FREE_MONTHLY_LIMIT = 100;
export const FREE_MEMBER_LIMIT = 3;

/** Notes that [b] refused a booking for its monthly limit (it is retired from the run two hours later). */
export function markCapped(b: SimBusiness, now = Date.now()) {
  const month = todayIn(b, now).slice(0, 7);
  if (b.cappedMonth !== month) {
    b.cappedMonth = month;
    b.cappedAt = now;
  }
}

/** This month's bookings by the business's own count (owner only), or null. */
async function usage(a: ActionScope, b: SimBusiness): Promise<{ used: number; limit: number | null } | null> {
  const billing = await a.must("billing usage", billingApi.get(b.id));
  return billing ? { used: billing.usage.bookingsThisMonth, limit: billing.usage.limit } : null;
}

/**
 * After a PLAN_LIMIT_REACHED refusal: the business must be at its limit (allowing for holds that lapsed meanwhile,
 * which stop counting), and never past it.
 */
export async function checkPlanLimitRefusal(sim: Sim, a: ActionScope, b: SimBusiness) {
  markCapped(b);
  // Holds that lapse stop counting: one that lapsed between the refusal and the read below leaves a place free. Counted
  // now, before the read (the checker may record the lapse meanwhile).
  const held = sim.world.bookingsOf(b.id).filter((x) => x.status === "held").length;
  const u = await sim.as(b.owner, `owner-${b.key}`, () => usage(a, b));
  if (!u) return;
  if (u.limit === null) {
    sim.violate(
      "plan-limit",
      `a business without a booking limit refused a booking with PLAN_LIMIT_REACHED`,
      { businessId: b.id },
    );
  } else if (u.used + held < u.limit) {
    sim.violate(
      "plan-limit",
      `refused with PLAN_LIMIT_REACHED at ${u.used} of ${u.limit} bookings this month`,
      { businessId: b.id },
    );
  }
  checkUsage(sim, b, u);
}

function checkUsage(sim: Sim, b: SimBusiness, u: { used: number; limit: number | null }) {
  if (u.limit !== null && u.used > u.limit) {
    sim.violate(
      "plan-limit",
      `${u.used} bookings this month on a ${u.limit}-booking plan`,
      { businessId: b.id },
      `${b.id}|over|${u.used}`,
    );
  }
}

/** Free times over the next weeks, enough for a hundred bookings. */
async function manySlots(a: ActionScope, b: SimBusiness, serviceId: string): Promise<Slot[]> {
  const out: Slot[] = [];
  const today = todayIn(b);
  for (let week = 0; week < 4 && out.length < 400; week++) {
    const from = addDays(today, week * 7);
    const result = await a.must(
      "public availability",
      publicApi.availability(b.slug, { serviceId, from, to: addDays(from, 6) }),
    );
    if (result) out.push(...slotsOf(result));
  }
  return out;
}

function guest(sim: Sim, a: ActionScope, i: number) {
  return {
    name: `Limit guest ${a.seq}-${i}`,
    email: `sim-${sim.tag}-limit${a.seq}x${i}@example.test`,
    phone: null,
  };
}

async function bookPublic(
  sim: Sim,
  a: ActionScope,
  b: SimBusiness,
  serviceId: string,
  slot: Slot,
  i: number,
) {
  return a.expect(
    "plan-limit booking",
    publicApi.createBooking(
      b.slug,
      {
        serviceId,
        optionId: null,
        addonIds: [],
        groupId: null,
        resourceId: null,
        start: slot.start,
        customer: guest(sim, a, i),
        answers: {},
        customerNotes: null,
      },
      idempotencyKey(sim, a, i),
    ),
    ["SLOT_UNAVAILABLE", "PLAN_LIMIT_REACHED"],
  );
}

async function bookStaff(sim: Sim, a: ActionScope, b: SimBusiness, serviceId: string, slot: Slot, i: number) {
  return a.expect(
    "plan-limit staff booking",
    bookingsApi.create(
      b.id,
      {
        serviceId,
        optionId: null,
        addonIds: [],
        groupId: null,
        resourceIds: null,
        start: slot.start,
        customerId: null,
        customer: { ...guest(sim, a, i), notes: null },
        answers: {},
        internalNotes: null,
        paymentMode: "none",
        notifyCustomer: false,
      },
      idempotencyKey(sim, a, i),
    ),
    ["SLOT_UNAVAILABLE", "PLAN_LIMIT_REACHED"],
  );
}

/**
 * Fills the business to [FREE_MONTHLY_LIMIT] − [left] bookings (a tenth of them staff bookings), then books [left] + 4
 * more at once at different times: exactly [left] may succeed. Then both a customer and staff are refused. Runs as the
 * owner; customers book anonymously.
 */
export async function planLimitScenario(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  const service = activeServices(b, true)[0];
  if (!service) return "no_service";
  const start = await usage(a, b);
  if (!start || start.limit === null) return "no_limit";
  const slots = await manySlots(a, b, service.id);
  let next = 0;
  const left = 3;
  let used = start.used;
  // Fill: batches of concurrent bookings at distinct times until `left` remain.
  for (let round = 0; used < start.limit - left && round < 40; round++) {
    const batch = Math.min(8, start.limit - left - used);
    const results = await Promise.all(
      Array.from({ length: batch }, (_, i) => {
        const slot = slots[next++];
        if (!slot) return Promise.resolve(null);
        return i === 0 && round % 2 === 0
          ? bookStaff(sim, a, b, service.id, slot, next)
          : sim.as(null, `limit-guest-${i}`, () => bookPublic(sim, a, b, service.id, slot, next));
      }),
    );
    if (results.some((r) => r && !r.ok && r.code === "PLAN_LIMIT_REACHED")) {
      sim.violate("plan-limit", `refused before the limit while filling (${used} of ${start.limit})`, {
        businessId: b.id,
      });
      break;
    }
    const now = await usage(a, b);
    if (!now) return "failed";
    checkUsage(sim, b, now);
    used = now.used;
  }
  // The race: `left` + 4 bookings at once, at different times on three people.
  const before = await usage(a, b);
  if (!before || before.limit === null) return "failed";
  const remaining = before.limit - before.used;
  const racers = remaining + 4;
  const results = await Promise.all(
    Array.from({ length: racers }, (_, i) => {
      const slot = slots[next++];
      if (!slot) return Promise.resolve(null);
      return i % 3 === 0
        ? bookStaff(sim, a, b, service.id, slot, next)
        : sim.as(null, `limit-racer-${i}`, () => bookPublic(sim, a, b, service.id, slot, next));
    }),
  );
  const won = results.filter((r) => r?.ok).length;
  const refused = results.filter((r) => r && !r.ok && r.code === "PLAN_LIMIT_REACHED").length;
  const after = await usage(a, b);
  if (after) checkUsage(sim, b, after);
  if (won > remaining) {
    sim.violate(
      "plan-limit",
      `${won} of ${racers} simultaneous bookings were accepted with ${remaining} left of ${before.limit} (now ${after?.used ?? "?"} this month)`,
      { businessId: b.id },
    );
  } else if (refused > racers - remaining) {
    sim.violate(
      "plan-limit",
      `${refused} of ${racers} simultaneous bookings were refused with PLAN_LIMIT_REACHED with ${remaining} places left`,
      { businessId: b.id },
    );
  }
  // Past the limit: a customer and staff are both refused.
  const lateSlot = slots[next++];
  const staffSlot = slots[next++];
  if (lateSlot && staffSlot) {
    const late = await sim.as(null, "limit-late-guest", () =>
      bookPublic(sim, a, b, service.id, lateSlot, next),
    );
    const staff = await bookStaff(sim, a, b, service.id, staffSlot, next + 1);
    for (const [who, r] of [
      ["a customer", late],
      ["staff", staff],
    ] as const) {
      if (r.ok || r.code !== "PLAN_LIMIT_REACHED") {
        sim.violate(
          "plan-limit",
          `${who} booking past the monthly limit answered ${r.ok ? "201" : r.code}, expected PLAN_LIMIT_REACHED`,
          {
            businessId: b.id,
          },
        );
      }
    }
  }
  markCapped(b);
  return `won_${won}_of_${racers}_refused_${refused}`;
}

/** Invites four people at once to a business with only its owner: exactly two may get a seat. */
export async function memberCapScenario(sim: Sim, a: ActionScope, b: SimBusiness): Promise<string> {
  const team = await a.must("team list", teamApi.list(b.id));
  if (!team) return "failed";
  const free = FREE_MEMBER_LIMIT - team.length;
  const tries = free + 2;
  const results = await Promise.all(
    Array.from({ length: tries }, (_, i) =>
      a.expect(
        "racing invitation",
        teamApi.invite(b.id, {
          email: `sim-${sim.tag}-seat${a.seq}x${i}@bookanything.test`,
          role: "staff",
          resourceId: null,
        }),
        ["PLAN_LIMIT_REACHED"],
      ),
    ),
  );
  const won = results.filter((r) => r.ok).length;
  const after = await a.must("team list", teamApi.list(b.id));
  if (won > free || (after && after.length > FREE_MEMBER_LIMIT)) {
    sim.violate(
      "member-cap",
      `${won} of ${tries} simultaneous invitations were accepted with ${free} seats free; the team now has ${after?.length ?? "?"} members and invitations`,
      { businessId: b.id },
    );
  }
  // The invitations hold the seats; withdraw them so the plan-limit business can be looked at later without noise.
  for (const r of results)
    if (r.ok) await a.expect("withdraw invitation", teamApi.remove(b.id, r.value.id), ["NOT_FOUND"]);
  return `won_${won}_of_${tries}`;
}

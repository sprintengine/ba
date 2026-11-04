/**
 * Staff bots: team members with the staff role, linked to one person. They see and book only their own calendar,
 * take their own time off and record outcomes; now and then they try someone else's calendar and must be refused.
 */
import { bookingsApi } from "@shared/api/bookings";
import { resourcesApi } from "@shared/api/resources";
import type { Rng } from "../rng";
import type { ActionScope, Sim } from "../runtime";
import type { SimBooking, SimBusiness, SimMember } from "../shadow";
import { addDays } from "../time";
import { activeServices, idempotencyKey, todayIn } from "./common";
import { outcome, randomOverride, staffBook } from "./owner";

/** An active staff member linked to an active resource. */
export function pickStaff(rng: Rng, b: SimBusiness): SimMember | undefined {
  return rng.maybePick(
    [...b.members.values()].filter(
      (m) => m.status === "active" && m.resourceId && b.resources.get(m.resourceId)?.active,
    ),
  );
}

export function staffActor(b: SimBusiness, m: SimMember) {
  return { name: `staff-${b.key}-${m.identity.email.split("@")[0]!.split("-").pop()}`, identity: m.identity };
}

/** The booking list as staff: every booking on it must be on their own calendar. */
export async function staffList(sim: Sim, a: ActionScope, b: SimBusiness, m: SimMember): Promise<string> {
  const today = todayIn(b);
  const page = await a.expect(
    "staff booking list",
    bookingsApi.list(b.id, { from: addDays(today, -1), to: addDays(today, 14), limit: 200 }),
    ["FORBIDDEN"],
  );
  if (!page.ok) return "refused";
  for (const booking of page.value.items) {
    if (!booking.resources.some((r) => r.id === m.resourceId)) {
      sim.violate(
        "staff-scope",
        `staff linked to ${m.resourceId} sees booking ${booking.id} on ${booking.resources.map((r) => r.id).join(", ")}`,
        {
          businessId: b.id,
          bookingId: booking.id,
        },
      );
    }
  }
  return "ok";
}

/** Books onto their own calendar: the booking must use their resource. */
export async function staffBookOwn(sim: Sim, a: ActionScope, b: SimBusiness, m: SimMember): Promise<string> {
  const usable = activeServices(b).filter((s) =>
    s.requirements.some((r) => r.resourceIds.includes(m.resourceId!)),
  );
  const service = a.rng.maybePick(usable);
  if (!service) return "no_service";
  let created: SimBooking | undefined;
  const result = await staffBook(sim, a, b, {
    service,
    paymentMode: a.rng.pick(["none", "at_venue"] as const),
    resourceIds: null,
    onCreated: (booking) => (created = booking),
  });
  if (created && !created.resourceIds.includes(m.resourceId!)) {
    sim.violate(
      "staff-scope",
      `staff booking ${created.id} landed on ${created.resourceIds.join(", ")}, not on their own ${m.resourceId}`,
      {
        businessId: b.id,
        bookingId: created.id,
      },
    );
  }
  return result;
}

/** Tries to book onto a colleague's calendar: refused with FORBIDDEN. */
export async function staffBookOther(
  sim: Sim,
  a: ActionScope,
  b: SimBusiness,
  m: SimMember,
): Promise<string> {
  const service = a.rng.maybePick(
    activeServices(b).filter((s) =>
      s.requirements.some((r) => r.resourceIds.some((id) => id !== m.resourceId)),
    ),
  );
  if (!service) return "no_service";
  const other = service.requirements.flatMap((r) => r.resourceIds).find((id) => id !== m.resourceId);
  if (!other) return "no_service";
  const start = new Date(Date.now() + 2 * 86_400_000);
  start.setUTCMinutes(0, 0, 0);
  const result = await a.expect(
    "staff books a colleague",
    bookingsApi.create(
      b.id,
      {
        serviceId: service.id,
        optionId: null,
        addonIds: [],
        groupId: null,
        resourceIds: [other],
        start: start.toISOString(),
        customerId: null,
        customer: { name: `Probe ${a.seq}`, email: null, phone: null },
        answers: {},
        internalNotes: null,
        paymentMode: "none",
        notifyCustomer: false,
      },
      idempotencyKey(sim, a),
    ),
    ["FORBIDDEN"],
  );
  if (result.ok) {
    sim.violate("staff-scope", `staff booked ${result.value.id} onto a colleague's calendar (${other})`, {
      businessId: b.id,
      bookingId: result.value.id,
    });
    return "accepted";
  }
  return "refused";
}

export async function staffTimeOff(sim: Sim, a: ActionScope, b: SimBusiness, m: SimMember): Promise<string> {
  const resource = b.resources.get(m.resourceId!);
  if (!resource) return "skipped";
  const o = randomOverride(a, b, false);
  return sim.world.configuring(b, async () => {
    const result = await a.expect(
      "staff adds own time off",
      resourcesApi.createOverride(b.id, resource.id, o),
      ["NOT_FOUND", "FORBIDDEN"],
    );
    if (!result.ok) return "refused";
    resource.overrideIds.set(result.value.id, o);
    return "time_off";
  });
}

/** Records an outcome for one of their own bookings (a colleague's would be NOT_FOUND to them). */
export async function staffOutcome(sim: Sim, a: ActionScope, b: SimBusiness, m: SimMember): Promise<string> {
  return outcome(sim, a, b, m.resourceId!);
}

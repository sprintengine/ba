/**
 * Creating the simulated world: businesses (through onboarding, as an owner signing up would), their resources, hours
 * and services, and the identities of the bots. Everything is derived from the seed; ids come from the server.
 */
import { onboardingApi } from "@shared/api/onboarding";
import { resourcesApi } from "@shared/api/resources";
import { servicesApi } from "@shared/api/services";
import type { BusinessSetup, Policies } from "@shared/api/types";
import { DEV_NAMESPACE, type IdentityNamespace, type SimIdentity } from "./auth";
import type { RuleLike } from "./oracle";
import type { Rng } from "./rng";
import type { SimBusiness, SimResource } from "./shadow";
import { localParts } from "./time";

/** Zones a business may be in, spread round the clock so some are always in working hours. */
export const ZONES = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Atlantic/Azores",
  "Europe/Dublin",
  "Europe/Berlin",
  "Europe/Helsinki",
  "Europe/Istanbul",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

/**
 * A zone where it is working hours now (08:00 to 16:59), so the run's bookings start, end and get their outcomes while
 * it runs. The pick is seeded, but which zones qualify depends on the time of day.
 */
export function workingZone(rng: Rng, now: number): string {
  const awake = ZONES.filter((z) => {
    const hour = Math.floor(localParts(now, z).minutes / 60);
    return hour >= 8 && hour <= 16;
  });
  return rng.pick(awake.length > 0 ? awake : ZONES);
}

/** Weekly hours: every day of the week from [open] to [close] (`HH:mm`), with an optional break. */
export function weeklyHours(
  open: string,
  close: string,
  breakAt?: [string, string],
  closedDay?: number,
): RuleLike[] {
  const rules: RuleLike[] = [];
  for (let day = 1; day <= 7; day++) {
    if (day === closedDay) continue;
    if (breakAt) {
      rules.push({ dayOfWeek: day, startTime: open, endTime: breakAt[0] });
      rules.push({ dayOfWeek: day, startTime: breakAt[1], endTime: close });
    } else {
      rules.push({ dayOfWeek: day, startTime: open, endTime: close });
    }
  }
  return rules;
}

/** Random weekly hours within 06:00 to 22:00 (what owner bots set when they change hours). */
export function randomHours(rng: Rng): RuleLike[] {
  const open = rng.pick(["06:00", "07:00", "07:30", "08:00", "09:00"]);
  const close = rng.pick(["17:00", "18:30", "20:00", "21:00", "22:00"]);
  const withBreak = rng.chance(0.4)
    ? rng.pick<[string, string]>([
        ["12:00", "12:30"],
        ["13:00", "14:00"],
      ])
    : undefined;
  const closedDay = rng.chance(0.3) ? rng.int(1, 7) : undefined;
  return weeklyHours(open, close, withBreak, closedDay);
}

/** A bot's identity in [namespace] (the auth provider's: dev tokens' by default, `sim_…` for simulation tokens). */
export function identity(
  tag: string,
  role: string,
  n: number,
  namespace: IdentityNamespace = DEV_NAMESPACE,
): SimIdentity {
  return {
    sub: `${namespace.subjectPrefix}${tag}_${role}${n}`,
    email: `sim-${tag}-${role}${n}@${namespace.emailDomain(role)}`,
    name: `${role[0]!.toUpperCase()}${role.slice(1)} ${n} ${tag}`,
  };
}

function basePolicies(rng: Rng, limitScenario: boolean): Policies {
  return {
    minNoticeMinutes: limitScenario ? 0 : rng.pick([0, 5, 15, 30]),
    maxAdvanceDays: limitScenario ? 30 : rng.pick([7, 14, 30]),
    cancellationNoticeHours: rng.pick([0, 1, 2, 24]),
    lateCancellationRefundPercent: rng.pick([0, 50, 100]),
    allowCustomerCancel: true,
    allowCustomerReschedule: true,
    // The shortest hold, so abandoned payments lapse within a short run.
    holdMinutes: 5,
    requireCustomerPhone: false,
    nextAvailableOnly: false,
  };
}

type SetupService = BusinessSetup["services"][number];

function service(
  name: string,
  fields: Partial<SetupService> & Pick<SetupService, "requirements">,
): SetupService {
  return {
    name,
    description: null,
    category: "Simulated",
    color: "#4f46e5",
    durationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    slotIntervalMinutes: null,
    minNoticeMinutes: null,
    maxAdvanceDays: null,
    capacity: 1,
    priceCents: 0,
    paymentMode: "free",
    depositCents: null,
    requiresApproval: false,
    locationType: "business",
    isPublic: true,
    options: [],
    addons: [],
    allowedGroupKeys: [],
    ...fields,
  };
}

/** The onboarding payload of a simulated business. */
export function businessSetup(
  rng: Rng,
  n: number,
  tag: string,
  timeZone: string,
  limitScenario: boolean,
): BusinessSetup {
  const name = limitScenario ? `Sim Limit ${tag}` : `Sim Business ${n} ${tag}`;
  const person = (key: string, label: string, hours: RuleLike[]) => ({
    key,
    kind: "person" as const,
    name: label,
    description: null,
    capacity: 1,
    weeklyHours: hours.map((h) => ({ ...h, audienceGroupKeys: [] })),
  });
  const pool = (label: string, keys: string[], quantity = 1) => ({
    label,
    quantity,
    customerSelectable: false,
    resourceKeys: keys,
  });
  const resources = limitScenario
    ? [
        person("a", "Avery", weeklyHours("06:00", "22:00")),
        person("b", "Blake", weeklyHours("06:00", "22:00")),
        person("c", "Casey", weeklyHours("06:00", "22:00")),
      ]
    : [
        person("a", "Avery", weeklyHours("07:00", "21:00", ["13:00", "13:30"])),
        person("b", "Blake", weeklyHours(rng.pick(["06:00", "08:00"]), "20:00")),
        person("c", "Casey", weeklyHours("07:30", "21:30", undefined, rng.int(1, 7))),
        {
          key: "studio",
          kind: "space" as const,
          name: "Studio",
          description: null,
          capacity: 8,
          weeklyHours: weeklyHours("06:00", "22:00").map((h) => ({ ...h, audienceGroupKeys: [] })),
        },
      ];
  const services: SetupService[] = limitScenario
    ? [
        service("Quick slot", {
          durationMinutes: 15,
          slotIntervalMinutes: 15,
          requirements: [pool("Staff", ["a", "b", "c"])],
        }),
      ]
    : [
        service("Quick check", {
          durationMinutes: 15,
          slotIntervalMinutes: 15,
          priceCents: 2000,
          paymentMode: "at_venue",
          requirements: [pool("Staff", ["a", "b", "c"])],
        }),
        service("Consultation", {
          durationMinutes: 45,
          bufferBeforeMinutes: 5,
          bufferAfterMinutes: 10,
          slotIntervalMinutes: 15,
          priceCents: 5000,
          paymentMode: "full",
          requirements: [pool("Staff", ["a", "b"])],
        }),
        service("Deposit session", {
          durationMinutes: 30,
          priceCents: 4000,
          paymentMode: "deposit",
          depositCents: 1000,
          requirements: [pool("Staff", ["b", "c"])],
        }),
        service("Visit request", {
          durationMinutes: 30,
          slotIntervalMinutes: 30,
          requiresApproval: true,
          requirements: [pool("Staff", ["c"])],
        }),
        service("Group class", {
          durationMinutes: 60,
          slotIntervalMinutes: 60,
          capacity: rng.int(3, 6),
          priceCents: 1500,
          paymentMode: rng.pick(["full", "free"] as const),
          requirements: [pool("Room", ["studio"])],
        }),
        service("Two-person job", {
          durationMinutes: 60,
          bufferAfterMinutes: 15,
          slotIntervalMinutes: 30,
          requirements: [pool("Crew", ["a", "b", "c"], 2)],
        }),
      ];
  return {
    name,
    slug: limitScenario ? `sim-${tag}-limit` : `sim-${tag}-b${n}`,
    industry: "generic",
    description: "A business run by the reliability simulation.",
    timezone: timeZone,
    currency: "EUR",
    locale: "en-IE",
    country: "IE",
    vocabulary: {
      resource: "Staff member",
      resources: "Staff",
      customer: "Customer",
      customers: "Customers",
      booking: "Booking",
      bookings: "Bookings",
    },
    branding: { primaryColor: "#4f46e5", logoUrl: null, coverImageUrl: null },
    policies: basePolicies(rng, limitScenario),
    customerGroups: [],
    resources,
    services,
    questions: [],
  };
}

/**
 * Creates the business through onboarding and loads what the server made of it (ids, hours). Runs as the owner. A
 * taken slug (a replay against a database that has it) gets a suffix.
 */
export async function createBusiness(
  rng: Rng,
  key: string,
  n: number,
  tag: string,
  owner: SimIdentity,
  limitScenario: boolean,
  now: number,
): Promise<SimBusiness> {
  const zone = workingZone(rng, now);
  const setup = businessSetup(rng, n, tag, zone, limitScenario);
  let business;
  for (let attempt = 0; ; attempt++) {
    const slug = attempt === 0 ? setup.slug! : `${setup.slug!}-${attempt + 1}`;
    try {
      business = await onboardingApi.createBusiness({ ...setup, slug });
      break;
    } catch (error) {
      if (attempt < 5 && (error as { code?: string }).code === "SLUG_TAKEN") continue;
      throw error;
    }
  }
  const [resources, services] = await Promise.all([
    resourcesApi.list(business.id),
    servicesApi.list(business.id),
  ]);
  const sim: SimBusiness = {
    key,
    id: business.id,
    slug: business.slug,
    name: business.name,
    timeZone: business.timezone,
    owner,
    policies: business.policies,
    resources: new Map(),
    services: new Map(services.map((s) => [s.id, s])),
    closures: new Map(),
    members: new Map(),
    configVersion: 0,
    configBusy: 0,
    limitScenario,
    cappedMonth: null,
    cappedAt: null,
    dormant: false,
  };
  for (const r of resources) {
    const availability = await resourcesApi.availability(business.id, r.id);
    const resource: SimResource = {
      id: r.id,
      name: r.name,
      active: r.isActive,
      rules: availability.rules.map((x) => ({
        dayOfWeek: x.dayOfWeek,
        startTime: x.startTime,
        endTime: x.endTime,
      })),
      overrideIds: new Map(),
      memberId: r.memberId,
    };
    sim.resources.set(r.id, resource);
  }
  return sim;
}

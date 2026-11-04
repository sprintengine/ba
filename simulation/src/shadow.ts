/**
 * The shadow model: what the bots believe the world looks like, from what they did and what the server answered.
 * The simulation is the only writer to the businesses it creates, so every change on the server should have a cause
 * here; the checker compares the two (`state-consistency`, `refund-policy`).
 */
import type { Booking, BookingStatus, Policies, Service } from "@shared/api/types";
import type { SimIdentity } from "./auth";
import { focus } from "./http";
import type { OverrideLike, ResourceCalendar, RuleLike } from "./oracle";

export type SimResource = {
  id: string;
  name: string;
  active: boolean;
  rules: RuleLike[];
  /** Its overrides (time off and extra hours) by id. */
  overrideIds: Map<string, OverrideLike>;
  /** The member linked to it (a staff bot), if any. */
  memberId: string | null;
};

export type SimMember = {
  id: string;
  identity: SimIdentity;
  role: "owner" | "admin" | "staff";
  status: "invited" | "active";
  resourceId: string | null;
};

export type SimBusiness = {
  /** `b1`, `b2`... in creation order (stable across replays, unlike ids). */
  key: string;
  id: string;
  slug: string;
  name: string;
  timeZone: string;
  owner: SimIdentity;
  policies: Policies;
  resources: Map<string, SimResource>;
  services: Map<string, Service>;
  closures: Map<string, OverrideLike>;
  members: Map<string, SimMember>;
  /** Bumped whenever hours, services, resources or policies change. */
  configVersion: number;
  /** Configuration changes in flight: while any is, what customers are offered may change under them. */
  configBusy: number;
  /** Driven to its monthly limit at the start (the plan-limit scenario). */
  limitScenario: boolean;
  /** The month (`YYYY-MM`) it last refused a booking with PLAN_LIMIT_REACHED, and when that first happened. */
  cappedMonth: string | null;
  cappedAt: number | null;
  /**
   * Retired: full for the month for a while, so bots no longer act on it and the checker reads it through SQL only
   * (long runs open new businesses instead, see `run.ts`).
   */
  dormant: boolean;
  /**
   * Whether it takes online payments: always with dev payments; with Stripe Checkout once its test account can take
   * charges (`stripe.ts`). Without, bots book only what isn't paid online there.
   */
  onlinePayments: boolean;
};

export type ExpectedRefund = { amounts: number[]; at: number; by: "customer" | "business"; override: string };

export type SimBooking = {
  id: string;
  businessId: string;
  serviceId: string;
  reference: string;
  /** Order of creation in this run (stable across replays). */
  n: number;
  source: "public" | "staff";
  status: BookingStatus;
  start: string;
  end: string;
  resourceIds: string[];
  manageToken: string | null;
  customerEmail: string | null;
  priceCents: number;
  /** What the bots paid online. */
  paidOnlineCents: number;
  paidInPersonCents: number;
  /** The refunds the cancellations so far should have made (one entry per cancellation). */
  refunds: ExpectedRefund[];
  holdExpiresAt: string | null;
  checkoutUrl: string | null;
  /** Actions working on it right now: the checker leaves it alone meanwhile. */
  busy: number;
  /** When a bot last changed it (ms). */
  changedAt: number;
  /** The `changedAt` at which the checker last found it ended and right (it isn't read again until it changes). */
  verifiedAt: number | null;
  group: boolean;
};

/** [r] as the oracle reads it. */
export function calendarOf(r: SimResource): ResourceCalendar {
  return { id: r.id, active: r.active, rules: r.rules, overrides: [...r.overrideIds.values()] };
}

/** Statuses a booking still holds its time in. */
export const BLOCKING: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  "held",
  "pending_approval",
  "confirmed",
]);

export class World {
  readonly businesses: SimBusiness[] = [];
  private readonly businessesById = new Map<string, SimBusiness>();
  private readonly bookingsById = new Map<string, SimBooking>();
  private bookingCounter = 0;

  addBusiness(b: SimBusiness) {
    this.businesses.push(b);
    this.businessesById.set(b.id, b);
  }

  business(id: string): SimBusiness | undefined {
    return this.businessesById.get(id);
  }

  /** Bookings of businesses still in play (not retired), in creation order. */
  liveBookings(filter: (b: SimBooking) => boolean = () => true): SimBooking[] {
    return this.bookings((x) => this.businessesById.get(x.businessId)?.dormant !== true && filter(x));
  }

  /** Records a booking the server created for a bot. */
  addBooking(b: Omit<SimBooking, "n" | "busy" | "changedAt" | "verifiedAt" | "refunds">): SimBooking {
    focus(b.businessId, b.id);
    const existing = this.bookingsById.get(b.id);
    if (existing) return existing;
    const booking: SimBooking = {
      ...b,
      n: ++this.bookingCounter,
      busy: 0,
      changedAt: Date.now(),
      verifiedAt: null,
      refunds: [],
    };
    this.bookingsById.set(b.id, booking);
    return booking;
  }

  booking(id: string): SimBooking | undefined {
    return this.bookingsById.get(id);
  }

  /** Bookings in creation order, optionally only those matching [filter]. */
  bookings(filter: (b: SimBooking) => boolean = () => true): SimBooking[] {
    return [...this.bookingsById.values()].filter(filter);
  }

  bookingsOf(businessId: string): SimBooking[] {
    return this.bookings((b) => b.businessId === businessId);
  }

  /**
   * Updates a booking from the server's view of it: after a bot's own action ([byBot], which marks it changed), or
   * after the checker read it.
   */
  sync(
    b: SimBooking,
    server: Pick<Booking, "status" | "start" | "end" | "holdExpiresAt"> & { resourceIds?: string[] },
    byBot = true,
  ) {
    b.status = server.status;
    b.start = server.start;
    b.end = server.end;
    b.holdExpiresAt = server.holdExpiresAt;
    if (server.resourceIds) b.resourceIds = server.resourceIds;
    if (byBot) b.changedAt = Date.now();
  }

  /** Runs [fn] with [b] marked busy, so the checker doesn't compare it mid-change. */
  async working<T>(b: SimBooking, fn: () => Promise<T>): Promise<T> {
    focus(b.businessId, b.id);
    b.busy++;
    try {
      return await fn();
    } finally {
      b.busy--;
      b.changedAt = Date.now();
    }
  }

  /** Runs a configuration change of [business]: what is offered may change until it is done. */
  async configuring<T>(business: SimBusiness, fn: () => Promise<T>): Promise<T> {
    business.configBusy++;
    business.configVersion++;
    try {
      return await fn();
    } finally {
      business.configVersion++;
      business.configBusy--;
    }
  }
}

/** The weekly rules of a resource as the API takes them (`PUT /resources/{id}/rules`). */
export function ruleInputs(rules: RuleLike[]) {
  return rules.map((r) => ({
    dayOfWeek: r.dayOfWeek as 1 | 2 | 3 | 4 | 5 | 6 | 7,
    startTime: r.startTime,
    endTime: r.endTime,
    validFrom: null,
    validUntil: null,
    audienceGroupIds: [],
  }));
}

/**
 * Statuses a booking may have reached on its own (no bot acting) from [known], given its end: holds lapse, ended
 * confirmed bookings are completed, and nothing else changes by itself.
 */
export function selfTransitions(known: BookingStatus, end: string, now: number): BookingStatus[] {
  switch (known) {
    case "held":
      return ["held", "expired"];
    case "confirmed":
      return Date.parse(end) < now ? ["confirmed", "completed"] : ["confirmed"];
    default:
      return [known];
  }
}

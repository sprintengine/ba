/**
 * The sample business as the app's API would give it: the answers behind the hero's screens, in the shapes the real
 * hooks return. Nothing here is a customer; the page labels it as a sample. The hero's screens are the app's own
 * views, so a new query in one of them shows here as a missing answer: `npx vitest run tour` names it.
 */
import { QueryClient, type QueryKey } from "@tanstack/react-query";
import type {
  Booking,
  BookingDetail,
  Business,
  Customer,
  Me,
  Overview,
  Page,
  ReportSummary,
  ResourceAvailability,
} from "@/lib/api/types";
import { addDaysToPlainDate, isoWeekday, zonedToIso, type PlainDate } from "@/lib/format";
import {
  BOOKED_AT,
  BOOKED_SERVICE,
  CLIENT,
  dayEntries,
  LUMEN,
  NOW_MINUTES,
  openHours,
  roomFor,
  SERVICES,
  TEAM,
  toBooking,
  type DemoEntry,
} from "../fixture";

export const SAMPLE_BUSINESS = {
  ...LUMEN,
  status: "active",
  sitesEnabled: false,
} as unknown as Business;

export const SAMPLE_OWNER: Me = {
  user: { id: "sample-owner", email: "dana@example.com", name: "Dana Owens", emailVerified: true },
  memberships: [],
  pendingInvitations: [],
  hasCustomerBookings: false,
};

/** The demo's booking, with the first free person. */
export const BOOKED_ENTRY: DemoEntry = {
  who: "sam",
  at: BOOKED_AT,
  customer: CLIENT.name,
  service: BOOKED_SERVICE,
  room: roomFor("sam"),
};

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const nowIso = (date: PlainDate) => zonedToIso(date, clock(NOW_MINUTES), LUMEN.timezone);

/** The moment the sample is held at: the calendar's now line, on the demo's day. */
export const sampleNow = (date: PlainDate) => new Date(nowIso(date));

const detailOf = (booking: Booking, entry: DemoEntry, date: PlainDate): BookingDetail => {
  const at = nowIso(date);
  const { priceCents } = entry.service;
  return {
    ...booking,
    customer: { ...booking.customer, email: CLIENT.email, phone: CLIENT.phone },
    reference: "BK-7Q4M",
    paymentStatus: "paid",
    source: "public",
    addons: [],
    groupId: null,
    answers: [],
    customerNotes: null,
    internalNotes: null,
    priceCents,
    depositCents: null,
    amountPaidCents: priceCents,
    amountPaidInPersonCents: 0,
    amountRefundedCents: 0,
    currency: LUMEN.currency,
    holdExpiresAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    createdAt: at,
    updatedAt: at,
    payments: [
      {
        id: "sample-payment",
        kind: "charge",
        provider: "stripe",
        amountCents: priceCents,
        currency: LUMEN.currency,
        status: "succeeded",
        createdAt: at,
      },
    ],
    history: [
      {
        id: "sample-paid",
        actorType: "customer",
        actorName: entry.customer,
        action: "payment.succeeded",
        entityType: "booking",
        entityId: booking.id,
        summary: { amountCents: priceCents },
        occurredAt: at,
      },
      {
        id: "sample-booked",
        actorType: "customer",
        actorName: entry.customer,
        action: "booking.created",
        entityType: "booking",
        entityId: booking.id,
        summary: {},
        occurredAt: new Date(Date.parse(at) - 40_000).toISOString(),
      },
    ],
    checkoutUrl: null,
  } satisfies BookingDetail;
};

const WEEKDAY_BOOKINGS = [0, 11, 13, 12, 14, 15, 9];

/** Thirty days at a steady clinic: closed Sundays, busiest towards the weekend, never quite the same twice. */
function report(from: PlainDate, to: PlainDate, booked: boolean): ReportSummary {
  const byDay: ReportSummary["byDay"] = [];
  for (let d = from, i = 0; d <= to; d = addDaysToPlainDate(d, 1), i++) {
    const usual = WEEKDAY_BOOKINGS[isoWeekday(d) % 7] ?? 0;
    const bookings = usual === 0 ? 0 : usual + ((i * 7) % 5) - 2;
    byDay.push({ date: d, bookings, revenueCents: bookings * 5800 });
  }
  const last = byDay.at(-1);
  if (booked && last) {
    last.bookings += 1;
    last.revenueCents += BOOKED_SERVICE.priceCents;
  }
  const bookings = byDay.reduce((n, d) => n + d.bookings, 0);
  const revenueCents = byDay.reduce((n, d) => n + d.revenueCents, 0);
  const shares = [0.24, 0.5, 0.26];
  const hours = byDay.filter((d) => d.bookings > 0).length * 8 * 60;
  return {
    from,
    to,
    currency: LUMEN.currency,
    totals: {
      bookings,
      confirmed: bookings - 7,
      cancelled: 5,
      noShows: 2,
      revenueCents,
      refundedCents: 12000,
      newCustomers: 34,
    },
    byDay,
    byService: SERVICES.map((s, i) => ({
      serviceId: s.id,
      name: s.name,
      bookings: Math.round(bookings * (shares[i] ?? 0)),
      revenueCents: Math.round(revenueCents * (shares[i] ?? 0)),
    })),
    byResource: TEAM.map((t, i) => {
      const utilisation = [0.82, 0.76, 0.68][i] ?? 0.7;
      return {
        resourceId: t.id,
        name: t.name,
        bookedMinutes: Math.round(hours * utilisation),
        availableMinutes: hours,
        utilisation,
      };
    }),
  };
}

function customers(date: PlainDate, booked: boolean): Customer[] {
  const base = (name: string, i: number): Customer => ({
    id: name,
    name,
    email: `${name.toLowerCase().replace(" ", ".")}@example.com`,
    phone: `085 555 01${pad(10 + i * 3)}`,
    notes: null,
    groupId: null,
    hasAccount: i % 4 === 1,
    bookingCount: [6, 3, 11, 2, 8, 4, 1, 5, 7, 2][i % 10] ?? 1,
    lastBookingAt: `${addDaysToPlainDate(date, -(i % 3))}T10:00:00.000Z`,
    createdAt: `${addDaysToPlainDate(date, -60 - i)}T10:00:00.000Z`,
  });
  const list = dayEntries([]).map((e, i) => base(e.customer, i));
  if (!booked) return list;
  return [
    {
      ...base(CLIENT.name, 6),
      email: CLIENT.email,
      phone: CLIENT.phone,
      hasAccount: false,
      bookingCount: 1,
      lastBookingAt: nowIso(date),
    },
    ...list,
  ];
}

const page = <T>(items: T[]): Page<T> => ({ items, nextCursor: null });

const availability = (id: string): ResourceAvailability => ({
  rules: ([1, 2, 3, 4, 5, 6] as const).map((dayOfWeek) => ({
    id: `${id}-${dayOfWeek}`,
    resourceId: id,
    dayOfWeek,
    startTime: clock(openHours(id)[0]!.start),
    endTime: clock(openHours(id)[0]!.end),
    validFrom: null,
    validUntil: null,
    audienceGroupIds: [],
  })),
  overrides: [],
});

/** Answers a query from the sample, as the API would. `undefined`: nothing on these screens should have asked. */
export function sampleAnswer(key: QueryKey, date: PlainDate, booked: boolean): unknown {
  if (key[0] !== "business") return undefined;
  const entries = dayEntries(booked ? [BOOKED_ENTRY] : []);
  const bookings = entries.map((e) => toBooking(e, date));
  const [section, kind, detail] = key.slice(2);
  switch (section) {
    case "overview": {
      const month = report(addDaysToPlainDate(date, -29), date, booked).totals;
      return {
        today: bookings,
        upcomingCount7d: 72 + (booked ? 1 : 0),
        bookings30d: month.bookings,
        revenueCents30d: month.revenueCents,
        checklist: [],
      } satisfies Overview;
    }
    case "bookings": {
      if (kind === "detail") {
        const entry = entries.find((e) => toBooking(e, date).id === detail);
        return entry && detailOf(toBooking(entry, date), entry, date);
      }
      const { status } = detail as { status?: unknown };
      return page(status === "pending_approval" ? [] : bookings);
    }
    case "customers":
      return page(customers(date, booked));
    case "resources":
      return key.includes("availability") ? availability(String(kind)) : TEAM;
    case "reports": {
      const range = kind as { from: PlainDate; to: PlainDate };
      return report(range.from, range.to, booked);
    }
    case "closures":
    case "customer-groups":
    case "release-schedules":
      return [];
    case "billing":
      return { usage: null };
    default:
      return undefined;
  }
}

/** Waits for ever: an unanswered query shows its skeleton, and the marketing page never calls the API. */
const unanswered = () => new Promise<never>(() => undefined);

/**
 * A query client with no network: the real hooks run, and every query is answered from the sample, at once and on the
 * first render, so no screen ever shows a skeleton. `setBooked` changes the sample, and every screen follows.
 */
export function sampleClient(date: PlainDate, startBooked: boolean) {
  let booked = startBooked;
  const answer = (key: QueryKey) => sampleAnswer(key, date, booked);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  const defaults = client.defaultQueryOptions.bind(client);
  const missing = new Set<string>();
  client.defaultQueryOptions = ((options: Parameters<typeof defaults>[0]) => {
    const merged = defaults(options);
    const key = merged.queryKey;
    return {
      ...merged,
      queryFn: () => answer(key) ?? unanswered(),
      initialData: () => {
        const data = answer(key);
        if (data === undefined) missing.add(JSON.stringify(key));
        else if (key.includes("infinite")) return { pages: [data], pageParams: [null] };
        return data;
      },
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    };
  }) as typeof defaults;
  return {
    client,
    /** The queries the sample has no answer for. */
    missing,
    setBooked: (on: boolean) => {
      booked = on;
      void client.invalidateQueries();
    },
  };
}

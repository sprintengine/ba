/**
 * The sample business behind the home page's demos, in the shapes the real booking pages and calendar take, so those
 * components can draw it. Nothing here is a customer: the names are made up and the page labels it as a sample.
 */
import type { Booking, PublicBusiness, PublicService, Resource, Slot } from "@/lib/api/types";
import {
  addDaysToPlainDate,
  isoWeekday,
  minutesToTime,
  todayInTz,
  zonedToIso,
  type PlainDate,
} from "@/lib/format";

const TZ = "Europe/Dublin";

export const LUMEN = {
  id: "sample-lumen",
  slug: "lumen-physio",
  name: "Lumen Physiotherapy",
  description: "Physiotherapy for sports injuries, back and neck pain, and rehabilitation after surgery.",
  industry: "physio",
  timezone: TZ,
  currency: "EUR",
  locale: "en-IE",
  contactEmail: null,
  contactPhone: null,
  websiteUrl: null,
  address: { line1: "Unit 4, Lantern Quay", line2: null, city: "Dublin", postcode: "D02 XY01" },
  branding: { primaryColor: "#5b4ae0", logoUrl: null, coverImageUrl: null },
  policies: {
    minNoticeMinutes: 120,
    maxAdvanceDays: 60,
    cancellationNoticeHours: 24,
    lateCancellationRefundPercent: 50,
    allowCustomerCancel: true,
    allowCustomerReschedule: true,
    holdMinutes: 30,
    requireCustomerPhone: true,
    nextAvailableOnly: false,
  },
  customerGroups: [],
  paymentsEnabled: true,
} as unknown as PublicBusiness;

/** The look of Lumen's booking pages: the Minimal portal style in its brand colour. */
export const LUMEN_STYLE = {
  theme: "minimal",
  palette: { primaryColor: "#5b4ae0", accent: null },
} as const;

const service = (
  id: string,
  name: string,
  color: string,
  durationMinutes: number,
  priceCents: number,
  bufferAfterMinutes: number,
  sortOrder: number,
): PublicService =>
  ({
    id,
    name,
    description: null,
    category: null,
    color,
    durationMinutes,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes,
    slotIntervalMinutes: 15,
    minNoticeMinutes: null,
    maxAdvanceDays: null,
    capacity: 1,
    priceCents,
    paymentMode: "full",
    depositCents: null,
    allowPayAtVenue: false,
    requiresApproval: false,
    locationType: "business",
    sortOrder,
    options: [],
    addons: [],
    allowedGroupIds: [],
    selectableRequirement: null,
    questions: [],
  }) as unknown as PublicService;

export const SERVICES = [
  service("assessment", "Initial assessment", "#5b4ae0", 60, 7000, 10, 0),
  service("massage", "Sports massage", "#0ea5e9", 45, 4500, 0, 1),
  service("follow-up", "Follow-up treatment", "#a99bff", 30, 4000, 0, 2),
];

const [ASSESSMENT, MASSAGE, FOLLOW_UP] = SERVICES as [PublicService, PublicService, PublicService];

export const SPORTS_MASSAGE = MASSAGE;

const resource = (id: string, name: string, color: string, sortOrder: number): Resource => ({
  id,
  kind: "person",
  name,
  description: null,
  color,
  capacity: 1,
  memberId: null,
  isActive: true,
  sortOrder,
});

export const TEAM = [
  resource("sam", "Sam Rivers", "#0ea5e9", 0),
  resource("aoife", "Aoife Byrne", "#a99bff", 1),
  resource("niamh", "Niamh Walsh", "#e0702f", 2),
];

/** The hours the calendar shows, and when each person stops. */
export const FIRST_HOUR = 13;
export const LAST_HOUR = 18;
const FINISH: Record<string, number> = { sam: 18 * 60, aoife: 18 * 60, niamh: 17 * 60 };
export const openHours = (id: string) => [{ start: 9 * 60, end: FINISH[id] ?? 18 * 60 }];

export type DemoEntry = { who: string; at: string; customer: string; service: PublicService; room: string };

const DAY: DemoEntry[] = [
  { who: "sam", at: "13:30", customer: "Remy Stroud", service: MASSAGE, room: "Room 1" },
  { who: "sam", at: "14:30", customer: "Dara Quinn", service: FOLLOW_UP, room: "Room 1" },
  { who: "sam", at: "16:30", customer: "Jo Hayes", service: ASSESSMENT, room: "Rehab gym" },
  { who: "aoife", at: "13:00", customer: "Toby Marsh", service: ASSESSMENT, room: "Room 2" },
  { who: "aoife", at: "14:15", customer: "Avery Lane", service: MASSAGE, room: "Room 2" },
  { who: "aoife", at: "15:15", customer: "Casey Rowe", service: ASSESSMENT, room: "Rehab gym" },
  { who: "aoife", at: "16:30", customer: "Eli Byrne", service: FOLLOW_UP, room: "Room 2" },
  { who: "niamh", at: "13:00", customer: "Mia Doyle", service: FOLLOW_UP, room: "Room 3" },
  { who: "niamh", at: "14:00", customer: "Liam Hayes", service: ASSESSMENT, room: "Room 3" },
  { who: "niamh", at: "15:30", customer: "Noor Ali", service: FOLLOW_UP, room: "Room 3" },
];

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

/** The demo's booked client. */
export const CLIENT = { name: "Rory Kane", email: "rory@example.com", phone: "085 555 0142" };

/** One entry as the calendar's Booking. */
export function toBooking(e: DemoEntry, date: PlainDate): Booking {
  const startMin = toMinutes(e.at);
  const who = TEAM.find((t) => t.id === e.who);
  return {
    id: `${date}-${e.who}-${e.at}`,
    status: "confirmed",
    start: zonedToIso(date, e.at, TZ),
    end: zonedToIso(date, minutesToTime(startMin + e.service.durationMinutes), TZ),
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: e.service.bufferAfterMinutes,
    customer: { id: e.customer, name: e.customer, email: null, phone: null, groupId: null },
    service: { id: e.service.id, name: e.service.name, color: e.service.color },
    option: null,
    resources: [
      { id: e.who, name: who?.name ?? "", kind: "person", requirementId: null },
      { id: e.room, name: e.room, kind: "space", requirementId: null },
    ],
  } as unknown as Booking;
}

const busy = (e: DemoEntry) => ({
  start: toMinutes(e.at),
  end: toMinutes(e.at) + e.service.durationMinutes + e.service.bufferAfterMinutes,
});

/** The first person free for this service at this time, as the real availability assigns one. */
export function whoIsFree(entries: DemoEntry[], chosen: PublicService, time: string): string | null {
  const start = toMinutes(time);
  const end = start + chosen.durationMinutes + chosen.bufferAfterMinutes;
  const free = TEAM.find((t) => {
    const finish = FINISH[t.id] ?? LAST_HOUR * 60;
    if (start + chosen.durationMinutes > finish) return false;
    return entries.filter((e) => e.who === t.id).every((e) => end <= busy(e).start || start >= busy(e).end);
  });
  return free?.id ?? null;
}

export const dayEntries = (extra: DemoEntry[]) => [...DAY, ...extra];

/** The times left on a day: a booked time is gone, as it is on the real page. */
export function freeSlots(entries: DemoEntry[], chosen: PublicService, date: PlainDate): Slot[] {
  const slots: Slot[] = [];
  for (let m = FIRST_HOUR * 60; m + chosen.durationMinutes <= LAST_HOUR * 60; m += 15) {
    const time = minutesToTime(m);
    const who = whoIsFree(entries, chosen, time);
    if (!who) continue;
    slots.push({
      start: zonedToIso(date, time, TZ),
      end: zonedToIso(date, minutesToTime(m + chosen.durationMinutes), TZ),
      resourceIds: [who],
      seatsLeft: null,
    });
  }
  return slots;
}

/** The next weekday from today that isn't a Sunday: the demo's day, so it never shows a date in the past. */
export function demoDay(now = new Date()): PlainDate {
  const today = todayInTz(TZ, now);
  return isoWeekday(today) === 7 ? addDaysToPlainDate(today, 1) : today;
}

export const isOpenDay = (date: PlainDate) => isoWeekday(date) !== 7;

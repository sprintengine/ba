/**
 * Test data for the customer features (explore, booking, my bookings, manage), built from the website's
 * contract-checked fixtures. Times are relative to today in the business's zone, so free times are always bookable.
 */
import { publicBusiness } from "@shared/api/__tests__/fixtures/business";
import { publicService } from "@shared/api/__tests__/fixtures/catalog";
import type { Availability, PublicBusiness, PublicService, Slot } from "@shared/api/types";
import { addDaysToPlainDate, todayInTz, zonedToIso, type PlainDate } from "@shared/format";

export const TZ = "Europe/Dublin";

/** A business with no customer groups, cancel/reschedule online, times shown as a calendar. */
export const business: PublicBusiness = {
  ...publicBusiness,
  site: null,
  customerGroups: [],
  policies: { ...publicBusiness.policies, nextAvailableOnly: false, requireCustomerPhone: false },
};

/** A free service with one required question: service → time → details → review. */
export const freeService: PublicService = {
  ...publicService,
  id: "00000000-0000-4000-8000-000000000101",
  name: "Free consultation",
  category: null,
  priceCents: 0,
  paymentMode: "free",
  depositCents: null,
  allowPayAtVenue: false,
  allowedGroupIds: [],
  options: [],
  addons: [],
  selectableRequirement: null,
  questions: [
    {
      id: "00000000-0000-4000-8000-000000000130",
      label: "Which knee?",
      helpText: null,
      kind: "select",
      options: ["Left", "Right"],
      required: true,
      sensitive: false,
      sortOrder: 0,
    },
  ],
};

/** A paid service (deposit, pay at venue allowed) with an option, an add-on and a choice of therapist. */
export const paidService: PublicService = { ...publicService, allowedGroupIds: [], questions: [] };

/** Tomorrow in the business's zone. */
export function tomorrow(): PlainDate {
  return addDaysToPlainDate(todayInTz(TZ), 1);
}

export function slotAt(date: PlainDate, time: string, minutes = 60, extra: Partial<Slot> = {}): Slot {
  const start = zonedToIso(date, time, TZ);
  return {
    start,
    end: new Date(new Date(start).getTime() + minutes * 60_000).toISOString(),
    resourceIds: [],
    seatsLeft: null,
    offer: null,
    ...extra,
  };
}

/** Availability with free times tomorrow at the given times. */
export function availabilityWith(times: string[], date: PlainDate = tomorrow()): Availability {
  return {
    timezone: TZ,
    from: date,
    to: date,
    durationMinutes: 60,
    nextAvailableOnly: false,
    days: [{ date, slots: times.map((t) => slotAt(date, t)), opensAt: null, held: false }],
  };
}

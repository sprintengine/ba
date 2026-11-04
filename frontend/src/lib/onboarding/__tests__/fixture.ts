import type { BusinessSetup } from "@/lib/api/types";
import type { SetupAction } from "../actions";
import { setupReducer } from "../setup-reducer";
import type { SetupDraft } from "../types";

export const hours = (days: number[], startTime: string, endTime: string, audienceGroupKeys: string[] = []) =>
  days.map((dayOfWeek) => ({ dayOfWeek, startTime, endTime, audienceGroupKeys }));

/** Gleam Car Wash: two bays and a valeter, a members-only Sunday, a deposit service with options. */
export function fixture(): BusinessSetup {
  const service = {
    description: null,
    category: null,
    color: "#0ea5e9",
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    slotIntervalMinutes: null,
    minNoticeMinutes: null,
    maxAdvanceDays: null,
    capacity: 1,
    requiresApproval: false,
    locationType: "business" as const,
    isPublic: true,
    allowedGroupKeys: [],
  };
  return {
    source: "template",
    name: "Gleam Car Wash",
    slug: null,
    industry: "car_wash",
    description: "Hand car wash and valeting.",
    timezone: "Europe/Dublin",
    currency: "EUR",
    locale: "en-IE",
    country: "IE",
    vocabulary: {
      resource: "Bay",
      resources: "Bays",
      customer: "Customer",
      customers: "Customers",
      booking: "Booking",
      bookings: "Bookings",
    },
    branding: { primaryColor: "#0369a1", logoUrl: null, coverImageUrl: null },
    policies: {
      minNoticeMinutes: 60,
      maxAdvanceDays: 30,
      cancellationNoticeHours: 12,
      lateCancellationRefundPercent: 0,
      allowCustomerCancel: true,
      allowCustomerReschedule: true,
      holdMinutes: 20,
      requireCustomerPhone: true,
      nextAvailableOnly: false,
    },
    customerGroups: [{ key: "members", name: "Members", description: null, restricted: true }],
    resources: [
      {
        key: "bay-1",
        kind: "space",
        name: "Bay 1",
        description: null,
        capacity: 1,
        weeklyHours: [
          ...hours([1, 2, 3, 4, 5, 6], "08:00", "18:00"),
          ...hours([7], "10:00", "16:00", ["members"]),
        ],
      },
      {
        key: "bay-2",
        kind: "space",
        name: "Bay 2",
        description: null,
        capacity: 1,
        weeklyHours: hours([1, 2, 3, 4, 5, 6], "08:00", "18:00"),
      },
      {
        key: "alex",
        kind: "person",
        name: "Alex Morgan",
        description: null,
        capacity: 1,
        weeklyHours: hours([1, 2, 3], "09:00", "17:00"),
      },
    ],
    services: [
      {
        ...service,
        name: "Exterior wash",
        durationMinutes: 30,
        priceCents: 1500,
        paymentMode: "full",
        depositCents: null,
        options: [],
        addons: [],
        requirements: [
          { label: "Bay", quantity: 1, customerSelectable: false, resourceKeys: ["bay-1", "bay-2"] },
        ],
      },
      {
        ...service,
        name: "Full valet",
        durationMinutes: 90,
        priceCents: 6000,
        paymentMode: "deposit",
        depositCents: 2000,
        options: [
          { name: "Small car", description: null, durationMinutes: 90, priceCents: 6000, sortOrder: 0 },
          { name: "SUV / Van", description: null, durationMinutes: 150, priceCents: 9500, sortOrder: 1 },
        ],
        addons: [{ name: "Wax", description: null, extraMinutes: 20, priceCents: 2000, sortOrder: 0 }],
        requirements: [
          { label: "Bay", quantity: 1, customerSelectable: false, resourceKeys: ["bay-1", "bay-2"] },
          { label: "Valeter", quantity: 1, customerSelectable: true, resourceKeys: ["alex"] },
        ],
        allowedGroupKeys: ["members"],
      },
    ],
    questions: [
      {
        label: "Vehicle registration",
        helpText: null,
        kind: "text",
        options: [],
        required: true,
        sensitive: false,
        serviceName: null,
      },
      {
        label: "Valet notes",
        helpText: null,
        kind: "textarea",
        options: [],
        required: false,
        sensitive: false,
        serviceName: "Full valet",
      },
    ],
  };
}

export function run(draft: SetupDraft, ...actions: SetupAction[]) {
  return actions.reduce(setupReducer, draft);
}

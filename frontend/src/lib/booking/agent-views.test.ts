import { describe, expect, it } from "vitest";
import type { AvailabilityDay } from "@/lib/api/types";
import { zonedToIso } from "@/lib/format";
import {
  availableTimes,
  bookingOptions,
  flowStatus,
  quoteSummary,
  type FlowStatusInput,
} from "./agent-views";
import { EMPTY_DETAILS } from "./details-schema";
import { quote, withSlotOffer } from "./quote";
import { EMPTY_SELECTION } from "./selection";
import { assessment, business, consult, massage } from "./__tests__/fixtures";

const TZ = business.timezone;
const slot = (date: string, time: string, offer: AvailabilityDay["slots"][number]["offer"] = null) => ({
  start: zonedToIso(date, time, TZ),
  end: zonedToIso(date, time, TZ),
  resourceIds: [],
  seatsLeft: null,
  offer,
});

describe("bookingOptions", () => {
  it("describes each service's prices, payment, choices and questions", () => {
    const { business: b, services } = bookingOptions(business, [consult, massage, assessment]);
    expect(b).toMatchObject({ name: "Lumen Physiotherapy", timezone: TZ, phoneRequired: false });
    expect(services.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    const [physio, sports, phone] = services;
    expect(phone).toMatchObject({ price: "Free", payment: "Free", duration: "15 min" });
    expect(sports?.payment).toBe("A €15 deposit is paid online when booking, the rest at the venue");
    expect(sports?.options[1]).toEqual({
      id: "o2",
      name: "60 minutes",
      description: null,
      duration: "1 h",
      price: "€70",
    });
    expect(sports?.addons[0]).toMatchObject({ id: "a1", extraTime: "10 min", price: "€10" });
    expect(physio?.resourceChoice?.choices.map((c) => c.id)).toEqual(["any", "r1", "r2"]);
    expect(physio?.questions[0]).toMatchObject({
      id: "q1",
      kind: "textarea",
      required: true,
      sensitive: true,
    });
  });
});

describe("quoteSummary", () => {
  it("says the total, the deal, and what's paid now and at the venue", () => {
    const q = withSlotOffer(quote(massage, "o2", ["a1"]), massage, {
      id: "d1",
      name: "Quiet hours",
      label: "20% off",
      originalPriceCents: 8000,
      priceCents: 6400,
    });
    expect(quoteSummary(q, business)).toEqual({
      duration: "1 h 10 min",
      total: "€64",
      deal: "20% off (saves €16)",
      payNow: "€15",
      payAtVenue: "€49",
    });
  });
});

describe("availableTimes", () => {
  it("lists times by day in range, after `after`, with deals, and when closed days open", () => {
    const days: AvailabilityDay[] = [
      {
        date: "2026-10-01",
        slots: [slot("2026-10-01", "09:00"), slot("2026-10-01", "14:00")],
        opensAt: null,
        held: false,
      },
      {
        date: "2026-10-02",
        slots: [
          slot("2026-10-02", "10:00", {
            id: "d",
            name: "Deal",
            label: "€10 off",
            originalPriceCents: 7000,
            priceCents: 6000,
          }),
        ],
        opensAt: null,
        held: false,
      },
      { date: "2026-10-03", slots: [], opensAt: zonedToIso("2026-10-01", "18:00", TZ), held: false },
      { date: "2026-10-04", slots: [], opensAt: null, held: true },
      { date: "2026-10-09", slots: [slot("2026-10-09", "10:00")], opensAt: null, held: false },
    ];
    const r = availableTimes(days, business, {
      from: "2026-10-01",
      to: "2026-10-05",
      after: zonedToIso("2026-10-01", "12:00", TZ),
    });
    expect(r.days).toEqual([
      { date: "2026-10-01", times: ["14:00"] },
      { date: "2026-10-02", times: ["10:00"], deals: [{ time: "10:00", deal: "€10 off", price: "€60" }] },
    ]);
    expect(r.notYetOpen).toEqual([
      { date: "2026-10-03", opensForBooking: "2026-10-01 18:00" },
      { date: "2026-10-04", opensForBooking: null },
    ]);
  });
});

describe("flowStatus", () => {
  const base: FlowStatusInput = {
    business,
    service: assessment,
    sel: { ...EMPTY_SELECTION, serviceId: "s1", resource: "r1", date: "2026-10-02", time: "10:00" },
    step: "review",
    quote: quote(assessment, null, []),
    details: { ...EMPTY_DETAILS, name: "Alex", email: "alex@example.com", answers: { q1: "My knee hurts" } },
    detailsIssues: [],
    questions: assessment.questions,
    payment: { offered: false, atVenue: false },
    alert: null,
    conflict: null,
  };

  it("says what is chosen and what to do next, without repeating sensitive answers", () => {
    const status = flowStatus(base);
    expect(status.step).toBe("review");
    expect(status.next).toMatch(/confirm_booking/);
    expect(status.selection).toMatchObject({
      service: "Initial assessment",
      resource: "Alex Morgan",
      time: "10:00",
    });
    expect(status.details.answers).toEqual([
      { question: "What would you like help with?", answer: "(given; sensitive, not repeated)" },
    ]);
    expect(JSON.stringify(status)).not.toContain("knee");
  });

  it("says what's wrong with the details and passes on the page's notice", () => {
    const status = flowStatus({
      ...base,
      step: "details",
      detailsIssues: [{ path: ["email"], message: "Enter a valid email address" }],
      alert: { tone: "danger", title: "We couldn't book that", body: "Try again." },
    });
    expect(status.details.problems).toEqual(["Email: Enter a valid email address"]);
    expect(status.notice).toBe("We couldn't book that. Try again.");
    expect(status.next).toMatch(/fill_booking_details/);
  });
});

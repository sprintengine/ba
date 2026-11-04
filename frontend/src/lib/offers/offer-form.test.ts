import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { Offer } from "@/lib/api/types";
import { offerState, redemptionsText, wasNowText } from "./display";
import {
  defaultOfferForm,
  formToInput,
  offerFormSchema,
  offerToForm,
  previewInput,
  switchDiscountType,
  toFormPath,
  withOfferFormPaths,
  type OfferFormValues,
} from "./offer-form";

const valid = (patch: Partial<OfferFormValues> = {}): OfferFormValues => ({
  ...defaultOfferForm(["s1"]),
  name: "Quiet afternoons",
  ...patch,
});

/** Error messages by dotted path. */
function errors(values: OfferFormValues): Record<string, string> {
  const r = offerFormSchema.safeParse(values);
  if (r.success) return {};
  return Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
}

const offer: Offer = {
  id: "of1",
  name: "Off-peak Tuesdays",
  description: "Quieter times, lower prices.",
  serviceIds: ["s1", "s2"],
  discount: { type: "fixed", amountCents: 500 },
  schedule: { daysOfWeek: [4, 2], timeWindows: [{ start: "13:00", end: "17:00" }], lastMinuteHours: 6 },
  validFrom: "2026-10-01",
  validUntil: "2026-12-31",
  maxRedemptions: 50,
  status: "paused",
  kind: "off_peak",
  label: "€5 off",
  summary: "Tue and Thu, 13:00–17:00",
  redemptions: 3,
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-01T10:00:00Z",
};

describe("offerFormSchema", () => {
  it("accepts a valid draft and the defaults once named", () => {
    expect(errors(valid())).toEqual({});
    expect(errors(valid({ discount: { type: "fixed", amountCents: 1000 } }))).toEqual({});
  });

  it("requires a name and at least one service", () => {
    expect(errors({ ...valid(), name: "  ", serviceIds: [] })).toMatchObject({
      name: "Give the deal a name",
      serviceIds: "Choose at least one service",
    });
  });

  it("allows at most 50 services, like the backend", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);
    expect(errors(valid({ serviceIds: ids(50) }))).toEqual({});
    expect(errors(valid({ serviceIds: ids(51) }))).toEqual({ serviceIds: "At most 50 services" });
  });

  it("checks the percentage", () => {
    expect(errors(valid({ discount: { type: "percent", percent: 0 } }))).toEqual({
      "discount.percent": "Between 1% and 100%",
    });
    expect(errors(valid({ discount: { type: "percent", percent: 101 } }))).toEqual({
      "discount.percent": "Between 1% and 100%",
    });
    expect(errors(valid({ discount: { type: "percent", percent: 12.5 } }))).toEqual({
      "discount.percent": "Use a whole number",
    });
    expect(errors(valid({ discount: { type: "percent", percent: null } }))).toEqual({
      "discount.percent": "Enter a percentage",
    });
    expect(errors(valid({ discount: { type: "percent", percent: 100 } }))).toEqual({});
  });

  it("checks the fixed amount", () => {
    expect(errors(valid({ discount: { type: "fixed", amountCents: 0 } }))).toEqual({
      "discount.amountCents": "Must be more than 0",
    });
    expect(errors(valid({ discount: { type: "fixed", amountCents: null } }))).toEqual({
      "discount.amountCents": "Enter an amount",
    });
  });

  it("requires complete time windows that end after they start", () => {
    const e = errors(
      valid({
        schedule: {
          daysOfWeek: [],
          timeWindows: [
            { start: "13:00", end: null },
            { start: "18:00", end: "17:00" },
          ],
          lastMinuteHours: 3,
        },
      }),
    );
    expect(e).toEqual({
      "schedule.timeWindows.0.end": "Enter an end time",
      "schedule.timeWindows.1.end": "Must end after it starts",
    });
  });

  it("rejects overlapping windows (on the later one) but allows touching ones", () => {
    const schedule = (timeWindows: { start: string; end: string }[]) => ({
      daysOfWeek: [],
      timeWindows,
      lastMinuteHours: null,
    });
    expect(
      errors(
        valid({
          schedule: schedule([
            { start: "14:00", end: "18:00" },
            { start: "09:00", end: "15:00" },
          ]),
        }),
      ),
    ).toEqual({ "schedule.timeWindows.0.start": "Overlaps another time window" });
    expect(
      errors(
        valid({
          schedule: schedule([
            { start: "09:00", end: "12:00" },
            { start: "12:00", end: "14:00" },
          ]),
        }),
      ),
    ).toEqual({});
  });

  it("limits time windows to six", () => {
    const timeWindows = Array.from({ length: 7 }, (_, i) => ({ start: `0${i}:00`, end: `0${i}:30` }));
    expect(errors(valid({ schedule: { daysOfWeek: [], timeWindows, lastMinuteHours: null } }))).toEqual({
      "schedule.timeWindows": "At most 6 time windows",
    });
  });

  it("checks last-minute hours only when the switch is on", () => {
    const hours = (h: number | null, lastMinute = true) =>
      valid({ lastMinute, schedule: { daysOfWeek: [], timeWindows: [], lastMinuteHours: h } });
    expect(errors(hours(0))).toEqual({ "schedule.lastMinuteHours": "Between 1 and 168 hours (a week)" });
    expect(errors(hours(169))).toEqual({ "schedule.lastMinuteHours": "Between 1 and 168 hours (a week)" });
    expect(errors(hours(null))).toEqual({ "schedule.lastMinuteHours": "Enter a number of hours" });
    expect(errors(hours(168))).toEqual({});
    expect(errors(hours(0, false))).toEqual({});
  });

  it("needs the end date on or after the start date", () => {
    expect(errors(valid({ validFrom: "2026-10-10", validUntil: "2026-10-09" }))).toEqual({
      validUntil: "Must be on or after the start date",
    });
    expect(errors(valid({ validFrom: "2026-10-10", validUntil: "2026-10-10" }))).toEqual({});
  });

  it("checks the redemption limit", () => {
    expect(errors(valid({ maxRedemptions: 0 }))).toHaveProperty("maxRedemptions");
    expect(errors(valid({ maxRedemptions: 100_001 }))).toHaveProperty("maxRedemptions");
    expect(errors(valid({ maxRedemptions: 25 }))).toEqual({});
  });
});

describe("conversions", () => {
  it("offerToForm → formToInput round-trips an offer", () => {
    expect(formToInput(offerToForm(offer))).toEqual({
      name: "Off-peak Tuesdays",
      description: "Quieter times, lower prices.",
      serviceIds: ["s1", "s2"],
      discount: { type: "fixed", amountCents: 500 },
      schedule: { daysOfWeek: [2, 4], timeWindows: [{ start: "13:00", end: "17:00" }], lastMinuteHours: 6 },
      validFrom: "2026-10-01",
      validUntil: "2026-12-31",
      maxRedemptions: 50,
      active: false,
    });
  });

  it("drops last-minute hours when the switch is off, trims text and sorts windows", () => {
    const input = formToInput(
      valid({
        name: "  Early birds ",
        description: "   ",
        schedule: {
          daysOfWeek: [5, 1, 1],
          timeWindows: [
            { start: "15:00", end: "16:00" },
            { start: "08:00", end: "10:00" },
          ],
          lastMinuteHours: 4,
        },
      }),
    );
    expect(input).toMatchObject({
      name: "Early birds",
      description: null,
      schedule: {
        daysOfWeek: [1, 5],
        timeWindows: [
          { start: "08:00", end: "10:00" },
          { start: "15:00", end: "16:00" },
        ],
        lastMinuteHours: null,
      },
      active: true,
    });
  });

  it("keeps the last-minute hours for editing when an offer has none", () => {
    const form = offerToForm({ ...offer, schedule: { ...offer.schedule, lastMinuteHours: null } });
    expect(form.lastMinute).toBe(false);
    expect(form.schedule.lastMinuteHours).toBe(3);
  });

  it("switches discount type, restoring the remembered value", () => {
    expect(
      switchDiscountType({ type: "percent", percent: 20 }, "fixed", { percent: 20, amountCents: 700 }),
    ).toEqual({ type: "fixed", amountCents: 700 });
    const same = { type: "percent" as const, percent: 15 };
    expect(switchDiscountType(same, "percent", { percent: 20, amountCents: null })).toBe(same);
  });
});

describe("previewInput", () => {
  it("is null while the draft can't be previewed", () => {
    expect(previewInput(valid({ serviceIds: [] }))).toBeNull();
    expect(previewInput(valid({ discount: { type: "percent", percent: null } }))).toBeNull();
  });

  it("previews an unnamed draft with a fixed name, for 7 days", () => {
    const a = previewInput(valid({ name: "" }));
    const b = previewInput(valid({ name: "Something else", description: "Changed", active: false }));
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    expect(a!.days).toBe(7);
    expect(a!.offer.serviceIds).toEqual(["s1"]);
  });
});

describe("API error paths", () => {
  it("maps backend field paths to form paths", () => {
    expect(toFormPath("schedule.timeWindows[1].end")).toBe("schedule.timeWindows.1.end");
    expect(toFormPath("schedule.daysOfWeek[0]")).toBe("schedule.daysOfWeek");
    expect(toFormPath("discount.percent")).toBe("discount.percent");
  });

  it("rewrites an ApiError and passes other errors through", () => {
    const err = new ApiError(400, "VALIDATION_FAILED", "Check the highlighted fields", {
      "schedule.timeWindows[0].start": "Bad time",
    });
    const mapped = withOfferFormPaths(err) as ApiError;
    expect(mapped).toBeInstanceOf(ApiError);
    expect(mapped.fields).toEqual({ "schedule.timeWindows.0.start": "Bad time" });
    expect(mapped.message).toBe("Check the highlighted fields");
    const other = new Error("boom");
    expect(withOfferFormPaths(other)).toBe(other);
  });
});

describe("display", () => {
  const base = {
    status: "active" as const,
    validFrom: null,
    validUntil: null,
    redemptions: 0,
    maxRedemptions: null,
  };
  it("derives the state shown on the list", () => {
    const today = "2026-10-01";
    expect(offerState(base, today)).toBe("active");
    expect(offerState({ ...base, status: "paused", validUntil: "2026-01-01" }, today)).toBe("paused");
    expect(offerState({ ...base, validUntil: "2026-09-30" }, today)).toBe("ended");
    expect(offerState({ ...base, validFrom: "2026-10-02" }, today)).toBe("scheduled");
    expect(offerState({ ...base, redemptions: 5, maxRedemptions: 5 }, today)).toBe("limit_reached");
  });

  it("formats redemptions and struck-through prices", () => {
    expect(redemptionsText(3, null)).toBe("3 used");
    expect(redemptionsText(3, 1000)).toBe("3 of 1,000 used");
    expect(wasNowText(5000, 4000, "EUR")).toBe("was €50, now €40");
    expect(wasNowText(5000, 0, "EUR")).toBe("was €50, now free");
  });
});

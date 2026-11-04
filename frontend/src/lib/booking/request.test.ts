import { describe, expect, it } from "vitest";
import { assessment } from "./__tests__/fixtures";
import { EMPTY_DETAILS } from "./details-schema";
import { bookingRequest } from "./request";
import { EMPTY_SELECTION } from "./selection";

const details = {
  ...EMPTY_DETAILS,
  name: "  Alex Morgan ",
  email: " alex@example.com",
  phone: "  ",
  notes: " Knee ",
  answers: { q1: " yes ", stray: "x" },
};
const questions = [
  {
    id: "q1",
    label: "Q",
    helpText: null,
    kind: "text" as const,
    options: [],
    required: false,
    sensitive: false,
    sortOrder: 1,
  },
];

describe("bookingRequest", () => {
  it("builds the request from the selection and trimmed details", () => {
    const sel = {
      ...EMPTY_SELECTION,
      serviceId: "s1",
      resource: "r2",
      addonIds: ["a1"],
      date: "2026-10-08",
      time: "09:30",
    };
    expect(
      bookingRequest({
        service: assessment,
        selection: sel,
        details,
        questions,
        timeZone: "Europe/Dublin",
        returnUrl: "https://x.ie",
      }),
    ).toEqual({
      serviceId: "s1",
      optionId: null,
      addonIds: ["a1"],
      groupId: null,
      resourceId: "r2",
      start: "2026-10-08T09:30:00+01:00",
      customer: { name: "Alex Morgan", email: "alex@example.com", phone: null },
      answers: { q1: "yes" },
      customerNotes: "Knee",
      returnUrl: "https://x.ie",
    });
  });

  it("asks to pay at the venue only when the customer chose it", () => {
    const sel = { ...EMPTY_SELECTION, serviceId: "s1", date: "2026-10-08", time: "09:30" };
    const request = (payAtVenue?: boolean) =>
      bookingRequest({
        service: assessment,
        selection: sel,
        details,
        questions,
        timeZone: "Europe/Dublin",
        returnUrl: "",
        payAtVenue,
      });
    expect(request(true)?.payment).toBe("at_venue");
    expect(request(false)?.payment).toBeUndefined();
    expect(request()?.payment).toBeUndefined();
  });

  it("carries the total the customer was shown, so a changed price is refused rather than charged", () => {
    const sel = { ...EMPTY_SELECTION, serviceId: "s1", date: "2026-10-08", time: "09:30" };
    const request = bookingRequest({
      service: assessment,
      selection: sel,
      details,
      questions,
      timeZone: "Europe/Dublin",
      returnUrl: "",
      expectedTotalCents: 3200,
    });
    expect(request?.expectedTotalCents).toBe(3200);
  });

  it("is null until a time is chosen", () => {
    const sel = { ...EMPTY_SELECTION, serviceId: "s1", date: "2026-10-08" };
    expect(
      bookingRequest({
        service: assessment,
        selection: sel,
        details,
        questions,
        timeZone: "Europe/Dublin",
        returnUrl: "",
      }),
    ).toBeNull();
  });
});

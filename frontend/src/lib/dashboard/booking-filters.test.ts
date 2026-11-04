import { describe, expect, it } from "vitest";
import { bookingListQuery, isFilteredView, parseBookingFilters } from "./booking-filters";

const parse = (qs: string) => parseBookingFilters(new URLSearchParams(qs));
const TODAY = "2026-03-15";

describe("parseBookingFilters", () => {
  it("defaults to every upcoming booking", () => {
    expect(parse("")).toEqual({
      range: "upcoming",
      customFrom: null,
      customTo: null,
      statuses: [],
      resourceId: "all",
      serviceId: "all",
    });
  });

  it("reads every filter", () => {
    expect(
      parse("range=custom&from=2026-01-01&to=2026-01-31&status=confirmed,no_show&resource=r1&service=s1"),
    ).toEqual({
      range: "custom",
      customFrom: "2026-01-01",
      customTo: "2026-01-31",
      statuses: ["confirmed", "no_show"],
      resourceId: "r1",
      serviceId: "s1",
    });
  });

  it("ignores malformed dates and unknown statuses", () => {
    const f = parse("from=yesterday&to=2026-1-5&status=confirmed,bogus,toString,constructor,");
    expect(f.customFrom).toBeNull();
    expect(f.customTo).toBeNull();
    // Object.prototype keys used to pass an `in` check and reach the API as statuses.
    expect(f.statuses).toEqual(["confirmed"]);
  });
});

describe("isFilteredView", () => {
  it("is false only for the default view", () => {
    expect(isFilteredView(parse(""), "")).toBe(false);
    expect(isFilteredView(parse(""), "alex")).toBe(true);
    expect(isFilteredView(parse("range=today"), "")).toBe(true);
    expect(isFilteredView(parse("status=held"), "")).toBe(true);
    expect(isFilteredView(parse("resource=r1"), "")).toBe(true);
    expect(isFilteredView(parse("service=s1"), "")).toBe(true);
  });
});

describe("bookingListQuery", () => {
  it("maps the default view to upcoming bookings, 50 a page", () => {
    expect(bookingListQuery(parse(""), "", TODAY)).toEqual({
      from: TODAY,
      status: undefined,
      resourceId: undefined,
      serviceId: undefined,
      q: undefined,
      limit: 50,
    });
  });

  it("passes filters and search through", () => {
    expect(
      bookingListQuery(
        parse("range=custom&from=2026-01-01&status=held&resource=r1&service=s1"),
        "BA-1",
        TODAY,
      ),
    ).toEqual({
      from: "2026-01-01",
      to: undefined,
      status: ["held"],
      resourceId: "r1",
      serviceId: "s1",
      q: "BA-1",
      limit: 50,
    });
  });
});

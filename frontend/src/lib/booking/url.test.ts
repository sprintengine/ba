import { describe, expect, it } from "vitest";
import { ANY_RESOURCE } from "./selection";
import {
  bookingDeepLink,
  bookingPortalPath,
  parseFlowParams,
  serializeFlowParams,
  type FlowState,
} from "./url";

describe("URL state", () => {
  it("round-trips a full selection", () => {
    const state: FlowState = {
      groupId: "g1",
      serviceId: "s2",
      optionId: "o2",
      addonIds: ["a1", "a2"],
      resource: ANY_RESOURCE,
      date: "2026-10-08",
      time: "09:30",
      step: "details",
    };
    expect(parseFlowParams(new URLSearchParams(serializeFlowParams(state)))).toEqual(state);
  });

  it("drops malformed dates, times and steps", () => {
    const s = parseFlowParams(new URLSearchParams("date=8-10-2026&time=25:00&step=pay&addons=,a1,"));
    expect(s.date).toBeNull();
    expect(s.time).toBeNull();
    expect(s.step).toBeNull();
    expect(s.addonIds).toEqual(["a1"]);
  });

  it("serialises an empty flow to an empty query", () => {
    expect(
      serializeFlowParams({
        groupId: null,
        serviceId: null,
        optionId: null,
        addonIds: [],
        resource: null,
        date: null,
        time: null,
        step: null,
      }),
    ).toBe("");
  });
});

describe("bookingDeepLink", () => {
  it("sends flow parameters on the site URL to the booking flow", () => {
    expect(bookingDeepLink("lumen-physio", { service: "s1", date: "2026-10-05", foo: "bar" })).toBe(
      "/lumen-physio/book?service=s1&date=2026-10-05",
    );
    expect(bookingDeepLink("lumen-physio", { with: ["r1", "r2"], step: "time" })).toBe(
      "/lumen-physio/book?with=r1&step=time",
    );
  });

  it("leaves plain site visits alone", () => {
    expect(bookingDeepLink("lumen-physio", {})).toBeNull();
    expect(bookingDeepLink("lumen-physio", { preview: "1", site: "draft" })).toBeNull();
  });
});

describe("bookingPortalPath", () => {
  it("sends /[slug] to the booking portal, keeping every parameter", () => {
    expect(bookingPortalPath("lumen-physio", {})).toBe("/lumen-physio/book");
    expect(bookingPortalPath("lumen-physio", { preview: "1", utm_source: "ig", service: "s1" })).toBe(
      "/lumen-physio/book?preview=1&utm_source=ig&service=s1",
    );
    expect(bookingPortalPath("a b", { tag: ["x", "y"], gone: undefined })).toBe("/a%20b/book?tag=x&tag=y");
  });
});

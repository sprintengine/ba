import { describe, expect, it } from "vitest";
import { assessment, consult, massage } from "./__tests__/fixtures";
import {
  ANY_RESOURCE,
  applyChange,
  availabilityQuery,
  chosenExtras,
  chosenSlot,
  EMPTY_SELECTION,
  resourceChoiceName,
  selectedResourceId,
} from "./selection";

const services = [assessment, massage, consult];

describe("selection changes", () => {
  it("choosing another service clears everything downstream", () => {
    const sel = { ...EMPTY_SELECTION, serviceId: "s1", resource: "r1", date: "2026-10-08", time: "09:00" };
    const next = applyChange(sel, { type: "service", service: massage }, services);
    expect(next).toMatchObject({
      serviceId: "s2",
      resource: null,
      time: null,
      optionId: null,
      date: "2026-10-08",
    });
  });

  it("pre-selects a service's only option", () => {
    const single = { ...massage, options: massage.options.slice(0, 1) };
    expect(applyChange(EMPTY_SELECTION, { type: "service", service: single }, [single]).optionId).toBe(
      single.options[0]?.id,
    );
  });

  it("changing option, add-ons or resource clears the time", () => {
    const sel = { ...EMPTY_SELECTION, serviceId: "s2", optionId: "o1", date: "2026-10-08", time: "09:00" };
    expect(applyChange(sel, { type: "option", optionId: "o2" }, services).time).toBeNull();
    const toggled = applyChange(sel, { type: "toggleAddon", addonId: "a1" }, services);
    expect(toggled.addonIds).toEqual(["a1"]);
    expect(toggled.time).toBeNull();
    expect(applyChange(toggled, { type: "toggleAddon", addonId: "a1" }, services).addonIds).toEqual([]);
    expect(applyChange(sel, { type: "resource", resource: "r2" }, services).time).toBeNull();
    expect(applyChange(sel, { type: "date", date: "2026-10-09" }, services)).toMatchObject({
      date: "2026-10-09",
      time: null,
    });
  });

  it("keeps the selection when nothing changes", () => {
    const sel = { ...EMPTY_SELECTION, serviceId: "s2", optionId: "o1", date: "2026-10-08", resource: "r1" };
    expect(applyChange(sel, { type: "option", optionId: "o1" }, services)).toBe(sel);
    expect(applyChange(sel, { type: "service", service: massage }, services)).toBe(sel);
    expect(applyChange(sel, { type: "date", date: "2026-10-08" }, services)).toBe(sel);
    expect(applyChange(sel, { type: "resource", resource: "r1" }, services)).toBe(sel);
  });

  it("sets and clears the time", () => {
    const timed = applyChange(EMPTY_SELECTION, { type: "time", date: "2026-10-08", time: "09:00" }, services);
    expect(timed).toMatchObject({ date: "2026-10-08", time: "09:00" });
    expect(applyChange(timed, { type: "clearTime" }, services).time).toBeNull();
  });

  it("a group change drops a service the group can't book", () => {
    const restricted = { ...consult, allowedGroupIds: ["g1"] };
    const sel = { ...EMPTY_SELECTION, groupId: "g1", serviceId: "s3" };
    expect(applyChange(sel, { type: "group", groupId: "g2" }, [restricted]).serviceId).toBeNull();
    const open = { ...EMPTY_SELECTION, groupId: "g1", serviceId: "s3", time: "09:00" };
    expect(applyChange(open, { type: "group", groupId: "g2" }, [consult])).toMatchObject({
      serviceId: "s3",
      groupId: "g2",
      time: null,
    });
  });

  it("sends a resource id only for a specific, valid choice", () => {
    expect(selectedResourceId({ ...EMPTY_SELECTION, resource: ANY_RESOURCE }, assessment)).toBeNull();
    expect(selectedResourceId({ ...EMPTY_SELECTION, resource: "r2" }, assessment)).toBe("r2");
    expect(selectedResourceId({ ...EMPTY_SELECTION, resource: "r2" }, consult)).toBeNull();
  });
});

describe("availability for the selection", () => {
  it("queries the service, option, sorted add-ons, group and a specific resource", () => {
    const sel = {
      ...EMPTY_SELECTION,
      serviceId: "s1",
      optionId: "o1",
      addonIds: ["b", "a"],
      groupId: "g1",
      resource: "r2",
    };
    expect(availabilityQuery(sel, assessment)).toEqual({
      serviceId: "s1",
      optionId: "o1",
      addonIds: ["a", "b"],
      groupId: "g1",
      resourceId: "r2",
    });
    expect(availabilityQuery(EMPTY_SELECTION, null).serviceId).toBe("");
  });

  it("finds the slot at the chosen time in the business timezone", () => {
    const slot = {
      start: "2026-10-08T08:00:00Z",
      end: "2026-10-08T09:00:00Z",
      resourceIds: [],
      seatsLeft: null,
    };
    const days = new Map([["2026-10-08", [slot]]]);
    const sel = { ...EMPTY_SELECTION, date: "2026-10-08", time: "09:00" };
    expect(chosenSlot(sel, days, "Europe/Dublin")).toBe(slot);
    expect(chosenSlot({ ...sel, time: "10:00" }, days, "Europe/Dublin")).toBeUndefined();
    expect(chosenSlot({ ...sel, time: null }, days, "Europe/Dublin")).toBeUndefined();
  });
});

describe("describing the selection", () => {
  it("finds the chosen option and add-ons", () => {
    const extras = chosenExtras(massage, { optionId: "o2", addonIds: ["a1", "nope"] });
    expect(extras.option?.id).toBe("o2");
    expect(extras.addons.map((a) => a.id)).toEqual(["a1"]);
    expect(chosenExtras(null, { optionId: "o2", addonIds: ["a1"] })).toEqual({ option: null, addons: [] });
  });

  it("names the chosen resource, or 'Any …' for no preference", () => {
    const label = assessment.selectableRequirement?.label ?? "";
    expect(resourceChoiceName({ resource: ANY_RESOURCE }, assessment, "Therapist")).toBe(
      `Any ${(label || "Therapist").toLowerCase()}`,
    );
    expect(resourceChoiceName({ resource: ANY_RESOURCE }, consult, "Therapist")).toBe("Any therapist");
    expect(resourceChoiceName({ resource: "r2" }, assessment, "Therapist")).toBe(
      assessment.selectableRequirement?.resources.find((r) => r.id === "r2")?.name,
    );
    expect(resourceChoiceName({ resource: null }, assessment, "Therapist")).toBeUndefined();
  });
});

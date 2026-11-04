import { describe, expect, it } from "vitest";
import { assessment, business, consult, massage } from "./__tests__/fixtures";
import { EMPTY_SELECTION } from "./selection";
import {
  canPickTime,
  getSteps,
  isStepComplete,
  isStepId,
  nextStep,
  previousStep,
  resolveStep,
  stepTotal,
} from "./steps";

const services = [assessment, massage, consult];
const ctx = { business, services, detailsComplete: false };

describe("steps", () => {
  it("includes group, extras and resource steps only when relevant", () => {
    expect(getSteps(business, null)).toEqual(["service", "time", "details", "review"]);
    expect(getSteps(business, assessment)).toEqual(["service", "resource", "time", "details", "review"]);
    expect(getSteps(business, massage)).toEqual(["service", "extras", "time", "details", "review"]);
    const withGroups = { ...business, customerGroups: [{ id: "g1", name: "New", description: null }] };
    expect(getSteps(withGroups, consult)[0]).toBe("group");
  });

  it("counts the steps once a service is chosen, and before only when every service takes as many", () => {
    expect(stepTotal(business, services, massage)).toEqual({ total: 5, known: true });
    expect(stepTotal(business, services, consult)).toEqual({ total: 4, known: true });
    // Massage has extras, the assessment a choice of therapist, the consult neither: up to 5, not known yet.
    expect(stepTotal(business, services, null)).toEqual({ total: 5, known: false });
    expect(stepTotal(business, [assessment, massage], null)).toEqual({ total: 5, known: true });
    expect(stepTotal(business, [], null)).toEqual({ total: 4, known: true });
  });

  it("clamps a requested step to the first incomplete one", () => {
    const sel = { ...EMPTY_SELECTION, serviceId: "s1" };
    expect(resolveStep("review", sel, ctx)).toBe("resource");
    expect(resolveStep(null, EMPTY_SELECTION, ctx)).toBe("service");
    expect(resolveStep("service", { ...sel, resource: "r1" }, ctx)).toBe("service");
  });

  it("requires valid details before review (details are not in the URL)", () => {
    const sel = { ...EMPTY_SELECTION, serviceId: "s3", date: "2026-10-08", time: "09:00" };
    expect(resolveStep("review", sel, ctx)).toBe("details");
    expect(resolveStep("review", sel, { ...ctx, detailsComplete: true })).toBe("review");
  });

  it("requires an option for services with options", () => {
    const sel = { ...EMPTY_SELECTION, serviceId: "s2", date: "2026-10-08", time: "09:00" };
    expect(resolveStep("time", sel, ctx)).toBe("extras");
    expect(resolveStep("time", { ...sel, optionId: "o1" }, ctx)).toBe("time");
  });

  it("rejects an unknown resource id or add-on", () => {
    expect(resolveStep("time", { ...EMPTY_SELECTION, serviceId: "s1", resource: "nope" }, ctx)).toBe(
      "resource",
    );
    expect(
      isStepComplete("extras", { ...EMPTY_SELECTION, serviceId: "s2", optionId: "o1", addonIds: ["x"] }, ctx),
    ).toBe(false);
  });

  it("treats the resource step as done when the service has no choice of resource", () => {
    expect(isStepComplete("resource", { ...EMPTY_SELECTION, serviceId: "s3" }, ctx)).toBe(true);
    expect(isStepComplete("resource", { ...EMPTY_SELECTION, serviceId: "s1", resource: "any" }, ctx)).toBe(
      true,
    );
  });

  it("checks the customer group when the business has groups", () => {
    const withGroups = {
      ...ctx,
      business: { customerGroups: [{ id: "g1", name: "New", description: null }] },
    };
    expect(isStepComplete("group", EMPTY_SELECTION, withGroups)).toBe(false);
    expect(isStepComplete("group", { ...EMPTY_SELECTION, groupId: "g1" }, withGroups)).toBe(true);
  });

  it("moves forwards and backwards within the steps", () => {
    const steps = getSteps(business, consult);
    expect(nextStep("service", steps)).toBe("time");
    expect(nextStep("review", steps)).toBe("review");
    expect(previousStep("time", steps)).toBe("service");
    expect(previousStep("service", steps)).toBeNull();
  });

  it("recognises step ids", () => {
    expect(isStepId("review")).toBe(true);
    expect(isStepId("pay")).toBe(false);
  });
});

describe("canPickTime", () => {
  it("needs a service with its option and resource chosen", () => {
    expect(canPickTime(EMPTY_SELECTION, ctx)).toBe(false);
    expect(canPickTime({ ...EMPTY_SELECTION, serviceId: "s3" }, ctx)).toBe(true);
    expect(canPickTime({ ...EMPTY_SELECTION, serviceId: "s2" }, ctx)).toBe(false);
    expect(canPickTime({ ...EMPTY_SELECTION, serviceId: "s2", optionId: "o1" }, ctx)).toBe(true);
    expect(canPickTime({ ...EMPTY_SELECTION, serviceId: "s1" }, ctx)).toBe(false);
    expect(canPickTime({ ...EMPTY_SELECTION, serviceId: "s1", resource: "any" }, ctx)).toBe(true);
  });
});

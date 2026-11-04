import { describe, expect, it } from "vitest";
import { must } from "@/test/must";
import { createDraft, deriveSlug } from "../draft";
import { summarizeHours, windowsForDay } from "../hours";
import { nextResource } from "../reducers/resources";
import type { SetupDraft } from "../types";
import { validateSetup } from "../validation";
import { fixture, run } from "./fixture";

const service = (d: SetupDraft, i: number) => must(d.setup.services[i], `service ${i}`);
const requirement = (d: SetupDraft, s: number, i: number) =>
  must(service(d, s).requirements[i], `requirement ${i} of service ${s}`);
const resource = (d: SetupDraft, i: number) => must(d.setup.resources[i], `resource ${i}`);

describe("setupReducer", () => {
  it("derives the slug from the name until the slug is edited", () => {
    expect(deriveSlug("   ")).toBe("");
    let d = createDraft(fixture());
    expect(d.setup.slug).toBe("gleam-car-wash");
    d = run(d, { type: "setName", name: "Cadence Music Studio" });
    expect(d.setup.slug).toBe("cadence-music-studio");
    d = run(d, { type: "setSlug", slug: "Cadence Music" }, { type: "setName", name: "Something Else" });
    expect(d.slugEdited).toBe(true);
    expect(d.setup.slug).toBe("cadence-music");
    d = run(d, { type: "resetSlug" });
    expect(d.setup.slug).toBe("something-else");
  });

  it("loads a setup as a fresh draft and edits business details", () => {
    let d = run(createDraft(fixture()), { type: "setSlug", slug: "custom" });
    d = run(d, { type: "load", setup: { ...fixture(), name: "Lumen Physio" } });
    expect(d).toMatchObject({ slugEdited: false, setup: { name: "Lumen Physio", slug: "lumen-physio" } });
    d = run(
      d,
      { type: "updateBusiness", patch: { timezone: "Europe/London", currency: "GBP" } },
      { type: "setVocabulary", patch: { customer: "Patient" } },
      { type: "setBrandColor", color: "#123456" },
    );
    expect(d.setup).toMatchObject({ timezone: "Europe/London", currency: "GBP" });
    expect(d.setup.vocabulary).toMatchObject({ customer: "Patient", resource: "Bay" });
    expect(d.setup.branding.primaryColor).toBe("#123456");
  });

  it("keeps requirement keys valid when a resource is renamed", () => {
    const d = run(createDraft(fixture()), {
      type: "updateResource",
      key: "bay-1",
      patch: { name: "Covered bay" },
    });
    expect(d.setup.resources[0]).toMatchObject({ key: "bay-1", name: "Covered bay" });
    expect(requirement(d, 0, 0).resourceKeys).toEqual(["bay-1", "bay-2"]);
    expect(validateSetup(d.setup)).toEqual({});
  });

  it("removing a resource cleans requirement pools and drops empty requirements", () => {
    const d = run(
      createDraft(fixture()),
      { type: "removeResource", key: "bay-2" },
      { type: "removeResource", key: "alex" },
    );
    expect(d.setup.resources.map((r) => r.key)).toEqual(["bay-1"]);
    expect(service(d, 0).requirements).toEqual([
      { label: "Bay", quantity: 1, customerSelectable: false, resourceKeys: ["bay-1"] },
    ]);
    expect(service(d, 1).requirements.map((r) => r.label)).toEqual(["Bay"]);
    expect(validateSetup(d.setup)).toEqual({});
  });

  it("clamps a requirement's quantity to its shrunken pool", () => {
    let d = createDraft(fixture());
    d = run(
      d,
      { type: "updateRequirement", serviceIndex: 0, index: 0, patch: { quantity: 2 } },
      { type: "removeResource", key: "bay-2" },
    );
    expect(requirement(d, 0, 0).quantity).toBe(1);
  });

  it("adds a new resource to pools made only of the same kind", () => {
    const base = createDraft(fixture());
    const { key } = nextResource(base.setup, "space");
    const d = run(base, { type: "addResource", kind: "space" });
    expect(d.setup.resources.at(-1)?.key).toBe(key);
    expect(requirement(d, 0, 0).resourceKeys).toContain(key);
    // The person-only pool is untouched.
    expect(requirement(d, 1, 1).resourceKeys).toEqual(["alex"]);
    // Hours are copied from the last resource of the same kind.
    expect(summarizeHours(must(d.setup.resources.at(-1), "new resource").weeklyHours)).toBe(
      "Mon–Sat 08:00–18:00",
    );
  });

  it("names new resources after the vocabulary and opens a first one on weekdays", () => {
    const empty = createDraft({ ...fixture(), resources: [], services: [] });
    expect(nextResource(empty.setup)).toEqual({ kind: "person", name: "Bay 1", key: "bay-1" });
    const d = run(empty, { type: "addResource" }, { type: "addResource", kind: "equipment", name: "Hoover" });
    expect(d.setup.resources.map((r) => [r.key, r.kind, r.name])).toEqual([
      ["bay-1", "person", "Bay 1"],
      ["hoover", "equipment", "Hoover"],
    ]);
    expect(summarizeHours(resource(d, 0).weeklyHours)).toBe("Mon–Fri 09:00–17:00");
  });

  it("adds and removes options and add-ons, renumbering sortOrder", () => {
    let d = run(createDraft(fixture()), { type: "addOption", serviceIndex: 1 });
    expect(service(d, 1).options).toHaveLength(3);
    expect(service(d, 1).options[2]).toMatchObject({
      durationMinutes: 90,
      priceCents: 6000,
      sortOrder: 2,
    });
    d = run(d, { type: "removeOption", serviceIndex: 1, index: 0 });
    expect(service(d, 1).options.map((o) => o.sortOrder)).toEqual([0, 1]);
    expect(service(d, 1).options[0]?.name).toBe("SUV / Van");
    d = run(d, { type: "updateOption", serviceIndex: 1, index: 0, patch: { name: "Van" } });
    expect(service(d, 1).options[0]?.name).toBe("Van");

    d = run(
      d,
      { type: "addAddon", serviceIndex: 1 },
      { type: "updateAddon", serviceIndex: 1, index: 1, patch: { name: "Interior shampoo" } },
    );
    expect(service(d, 1).addons.map((a) => a.name)).toEqual(["Wax", "Interior shampoo"]);
    d = run(d, { type: "removeAddon", serviceIndex: 1, index: 0 });
    expect(service(d, 1).addons).toEqual([
      { name: "Interior shampoo", description: null, extraMinutes: 15, priceCents: 0, sortOrder: 0 },
    ]);
  });

  it("adds, edits and removes requirements and their pools", () => {
    let d = run(createDraft(fixture()), { type: "addRequirement", serviceIndex: 0 });
    expect(requirement(d, 0, 1)).toEqual({
      label: "Bay",
      quantity: 1,
      customerSelectable: false,
      resourceKeys: ["bay-1", "bay-2", "alex"],
    });
    d = run(
      d,
      { type: "updateRequirement", serviceIndex: 0, index: 1, patch: { quantity: 3 } },
      { type: "toggleRequirementResource", serviceIndex: 0, index: 1, resourceKey: "alex" },
    );
    expect(requirement(d, 0, 1)).toMatchObject({ resourceKeys: ["bay-1", "bay-2"], quantity: 2 });
    d = run(d, { type: "toggleRequirementResource", serviceIndex: 0, index: 1, resourceKey: "alex" });
    expect(requirement(d, 0, 1).resourceKeys).toEqual(["bay-1", "bay-2", "alex"]);
    d = run(d, { type: "removeRequirement", serviceIndex: 0, index: 1 });
    expect(service(d, 0).requirements).toHaveLength(1);
  });

  it("copies Monday's hours to the other weekdays", () => {
    let d = createDraft(fixture());
    d = run(
      d,
      { type: "updateWindow", resourceKey: "alex", day: 1, windowIndex: 0, patch: { startTime: "07:30" } },
      { type: "addWindow", resourceKey: "alex", day: 1 },
      { type: "copyDayToWeekdays", resourceKey: "alex", fromDay: 1 },
    );
    const alex = resource(d, 2);
    for (const day of [1, 2, 3, 4, 5]) {
      expect(windowsForDay(alex.weeklyHours, day).map((h) => `${h.startTime}-${h.endTime}`)).toEqual([
        "07:30-17:00",
        "18:00-21:00",
      ]);
    }
    expect(windowsForDay(alex.weeklyHours, 6)).toEqual([]);
    d = run(d, { type: "removeWindow", resourceKey: "alex", day: 2, windowIndex: 1 });
    expect(windowsForDay(resource(d, 2).weeklyHours, 2)).toHaveLength(1);
  });

  it("toggles days open with the most common window and closes them", () => {
    let d = run(createDraft(fixture()), { type: "setDayOpen", resourceKey: "bay-2", day: 7, open: true });
    expect(windowsForDay(resource(d, 1).weeklyHours, 7)).toEqual([
      { dayOfWeek: 7, startTime: "08:00", endTime: "18:00", audienceGroupKeys: [] },
    ]);
    d = run(d, { type: "setDayOpen", resourceKey: "bay-2", day: 1, open: false });
    expect(windowsForDay(resource(d, 1).weeklyHours, 1)).toEqual([]);
  });

  it("copies one resource's hours to all resources", () => {
    const d = run(createDraft(fixture()), { type: "copyHoursToAll", resourceKey: "alex" });
    expect(d.setup.resources.every((r) => summarizeHours(r.weeklyHours) === "Mon–Wed 09:00–17:00")).toBe(
      true,
    );
    const unknown = createDraft(fixture());
    expect(run(unknown, { type: "copyHoursToAll", resourceKey: "ghost" }).setup).toEqual(unknown.setup);
  });

  it("adds services paid like the others, needing any resource", () => {
    const atVenue = createDraft({
      ...fixture(),
      services: fixture().services.map((s) => ({
        ...s,
        paymentMode: "at_venue" as const,
        depositCents: null,
      })),
    });
    const d = run(atVenue, { type: "addService" }, { type: "addService" });
    expect(d.setup.services.map((s) => [s.name, s.paymentMode, s.color])).toEqual([
      ["Exterior wash", "at_venue", "#0ea5e9"],
      ["Full valet", "at_venue", "#0ea5e9"],
      ["New service", "at_venue", "#f59e0b"],
      ["New service 2", "at_venue", "#10b981"],
    ]);
    expect(requirement(d, 2, 0)).toEqual({
      label: "Bay",
      quantity: 1,
      customerSelectable: false,
      resourceKeys: ["bay-1", "bay-2", "alex"],
    });
    expect(service(run(createDraft(fixture()), { type: "addService" }), 2).paymentMode).toBe("full");
  });

  it("renaming a service follows its questions; removing it drops them", () => {
    let d = run(createDraft(fixture()), {
      type: "updateService",
      index: 1,
      patch: { name: "Premium valet" },
    });
    expect(d.setup.questions[1]?.serviceName).toBe("Premium valet");
    expect(validateSetup(d.setup)).toEqual({});
    d = run(d, { type: "removeService", index: 1 });
    expect(d.setup.questions.map((q) => q.label)).toEqual(["Vehicle registration"]);
  });

  it("typing a name through another service's name leaves that service's questions alone", () => {
    let d = run(
      createDraft(fixture()),
      { type: "updateService", index: 1, patch: { name: "Massage" } },
      { type: "addService" },
    );
    // "Massage 90" is typed into the new service a key at a time, passing through "Massage".
    for (const name of ["M", "Massage", "Massage ", "Massage 9", "Massage 90"])
      d = run(d, { type: "updateService", index: 2, patch: { name } });
    expect(d.setup.questions.map((q) => q.serviceName)).toEqual([null, "Massage"]);
    expect(service(d, 1).name).toBe("Massage");

    // Removing a duplicate keeps the questions of the service still called that.
    d = run(d, { type: "updateService", index: 2, patch: { name: "massage" } });
    d = run(d, { type: "removeService", index: 2 });
    expect(d.setup.questions.map((q) => q.serviceName)).toEqual([null, "Massage"]);
  });

  it("ignores edits to services that don't exist", () => {
    const d = createDraft(fixture());
    expect(run(d, { type: "updateService", index: 9, patch: { name: "x" } }).setup).toEqual(d.setup);
    expect(run(d, { type: "removeService", index: 9 }).setup).toEqual(d.setup);
  });

  it("switching payment modes manages the deposit", () => {
    let d = run(createDraft(fixture()), {
      type: "updateService",
      index: 0,
      patch: { paymentMode: "deposit" },
    });
    expect(service(d, 0).depositCents).toBe(400);
    d = run(d, { type: "updateService", index: 0, patch: { paymentMode: "free" } });
    expect(service(d, 0)).toMatchObject({ depositCents: null, priceCents: 0 });
  });

  it("only one requirement can be customer-selectable", () => {
    const d = run(createDraft(fixture()), {
      type: "updateRequirement",
      serviceIndex: 1,
      index: 0,
      patch: { customerSelectable: true },
    });
    expect(service(d, 1).requirements.map((r) => r.customerSelectable)).toEqual([true, false]);
  });

  it("toggles a service's customer groups", () => {
    let d = run(createDraft(fixture()), { type: "toggleServiceGroup", serviceIndex: 0, groupKey: "members" });
    expect(service(d, 0).allowedGroupKeys).toEqual(["members"]);
    d = run(d, { type: "toggleServiceGroup", serviceIndex: 0, groupKey: "members" });
    expect(service(d, 0).allowedGroupKeys).toEqual([]);
  });

  it("adds and renames groups with unique keys", () => {
    const d = run(
      createDraft(fixture()),
      { type: "addGroup" },
      { type: "addGroup" },
      { type: "updateGroup", key: "new-group", patch: { name: "Students", restricted: true } },
    );
    expect(d.setup.customerGroups.map((g) => [g.key, g.name, g.restricted])).toEqual([
      ["members", "Members", true],
      ["new-group", "Students", true],
      ["new-group-2", "New group 2", false],
    ]);
  });

  it("removing a group cleans service and hours references", () => {
    const d = run(createDraft(fixture()), { type: "removeGroup", key: "members" });
    expect(service(d, 1).allowedGroupKeys).toEqual([]);
    expect(resource(d, 0).weeklyHours.every((h) => h.audienceGroupKeys.length === 0)).toBe(true);
    expect(validateSetup(d.setup)).toEqual({});
  });

  it("switching a question to select seeds choices", () => {
    const d = run(createDraft(fixture()), { type: "updateQuestion", index: 0, patch: { kind: "select" } });
    expect(d.setup.questions[0]?.options).toEqual(["Option 1", "Option 2"]);
  });

  it("adds, edits and removes questions and their choices", () => {
    let d = run(
      createDraft(fixture()),
      { type: "addQuestion" },
      { type: "updateQuestion", index: 2, patch: { label: "Colour", kind: "select" } },
      { type: "addQuestionOption", index: 2 },
      { type: "updateQuestionOption", index: 2, optionIndex: 2, value: "Blue" },
      { type: "removeQuestionOption", index: 2, optionIndex: 0 },
    );
    expect(d.setup.questions[2]).toMatchObject({ label: "Colour", options: ["Option 2", "Blue"] });
    d = run(d, { type: "removeQuestion", index: 0 });
    expect(d.setup.questions.map((q) => q.label)).toEqual(["Valet notes", "Colour"]);
  });
});

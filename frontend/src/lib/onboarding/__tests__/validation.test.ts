import { describe, expect, it } from "vitest";
import { must } from "@/test/must";
import { createDraft } from "../draft";
import { validateSetup } from "../validation";
import { fixture, run } from "./fixture";

const setup = () => createDraft(fixture()).setup;
const firstService = () => must(setup().services[0], "first service");
const secondService = () => must(setup().services[1], "second service");
const firstQuestion = () => must(setup().questions[0], "first question");
const firstResource = () => must(setup().resources[0], "first resource");

describe("validateSetup", () => {
  it("accepts a valid template", () => {
    expect(validateSetup(setup())).toEqual({});
  });

  it("checks slug format and reserved slugs", () => {
    const s = setup();
    expect(validateSetup({ ...s, slug: "ab" }).slug).toMatch(/3 to 50/);
    expect(validateSetup({ ...s, slug: "dashboard" }).slug).toMatch(/reserved/);
    expect(validateSetup({ ...s, slug: "" }).slug).toBe("Choose a web address");
    expect(validateSetup({ ...s, slug: null }).slug).toBeUndefined();
  });

  it("requires names", () => {
    let d = createDraft(fixture());
    d = run(
      d,
      { type: "setName", name: " " },
      { type: "updateResource", key: "bay-1", patch: { name: "" } },
      { type: "updateService", index: 0, patch: { name: "" } },
      { type: "updateGroup", key: "members", patch: { name: "" } },
      { type: "updateQuestion", index: 0, patch: { label: "" } },
      { type: "setVocabulary", patch: { customers: "" } },
    );
    const errors = validateSetup(d.setup);
    expect(errors.name).toBeDefined();
    expect(errors["resources[0].name"]).toMatch(/bay/);
    expect(errors["services[0].name"]).toBeDefined();
    expect(errors["customerGroups[0].name"]).toBeDefined();
    expect(errors["questions[0].label"]).toBeDefined();
    expect(errors["vocabulary.customers"]).toBeDefined();
  });

  it("checks durations, deposits and duplicate service names", () => {
    const s = setup();
    const bad = {
      ...s,
      services: [
        { ...firstService(), durationMinutes: 0 },
        { ...secondService(), depositCents: 7000 },
        { ...firstService(), name: "exterior WASH " },
      ],
    };
    const errors = validateSetup(bad);
    expect(errors["services[0].durationMinutes"]).toBeDefined();
    expect(errors["services[1].depositCents"]).toMatch(/more than the price/);
    expect(errors["services[2].name"]).toMatch(/Another service/);
    expect(
      validateSetup({ ...s, services: [{ ...secondService(), depositCents: null }] })[
        "services[0].depositCents"
      ],
    ).toMatch(/deposit/);
    expect(
      validateSetup({ ...s, services: [{ ...firstService(), depositCents: -1 }] })[
        "services[0].depositCents"
      ],
    ).toBe("Must not be negative");
  });

  it("checks select questions' choices like the dashboard and hours are ordered", () => {
    const s = setup();
    const errors = validateSetup({
      ...s,
      questions: [
        { ...firstQuestion(), kind: "select", options: [] },
        { ...firstQuestion(), kind: "select", options: ["A", " "] },
        { ...firstQuestion(), kind: "select", options: Array.from({ length: 51 }, (_, i) => `O${i}`) },
        { ...firstQuestion(), kind: "select", options: ["x".repeat(101)] },
      ],
      resources: [
        {
          ...firstResource(),
          weeklyHours: [{ dayOfWeek: 1, startTime: "18:00", endTime: "09:00", audienceGroupKeys: [] }],
        },
        ...s.resources.slice(1),
      ],
    });
    expect(errors["questions[0].options"]).toBe("Add at least one choice");
    expect(errors["questions[1].options"]).toMatch(/blank/);
    // The dashboard's limits, so an onboarded question can be edited later.
    expect(errors["questions[2].options"]).toBe("At most 50 choices");
    expect(errors["questions[3].options"]).toMatch(/100 characters/);
    expect(errors["resources[0].weeklyHours[0].endTime"]).toMatch(/after/);
  });

  it("checks references to unknown resources, groups and services", () => {
    const s = setup();
    const errors = validateSetup({
      ...s,
      services: [
        {
          ...firstService(),
          requirements: [
            { label: "Bay", quantity: 3, customerSelectable: false, resourceKeys: ["bay-1", "ghost"] },
          ],
          allowedGroupKeys: ["vip"],
        },
      ],
      questions: [{ ...firstQuestion(), serviceName: "Missing" }],
      resources: [
        {
          ...firstResource(),
          weeklyHours: [{ dayOfWeek: 1, startTime: "9am", endTime: "17:00", audienceGroupKeys: ["vip"] }],
        },
        ...s.resources.slice(1),
      ],
    });
    expect(errors["services[0].requirements[0].resourceKeys"]).toMatch(/ghost/);
    expect(errors["services[0].requirements[0].quantity"]).toBeDefined();
    expect(errors["services[0].allowedGroupKeys"]).toMatch(/vip/);
    expect(errors["questions[0].serviceName"]).toMatch(/Missing/);
    expect(errors["resources[0].weeklyHours[0].startTime"]).toBe("Use a time like 09:00");
    expect(errors["resources[0].weeklyHours[0].audienceGroupKeys"]).toMatch(/vip/);
  });

  it("checks timezone and currency", () => {
    const s = setup();
    const errors = validateSetup({ ...s, timezone: "Mars/Olympus", currency: "eur" });
    expect(errors.timezone).toBe("Unknown timezone");
    expect(errors.currency).toBeDefined();
    expect(validateSetup({ ...s, timezone: "" }).timezone).toBe("Choose a timezone");
  });

  it("refuses timezones the backend refuses (abbreviations and offsets)", () => {
    const s = setup();
    expect(validateSetup({ ...s, timezone: "GMT" }).timezone).toBe("Unknown timezone");
    expect(validateSetup({ ...s, timezone: "UTC" })).toEqual({});
  });

  it("applies the backend's limits", () => {
    const s = setup();
    const errors = validateSetup({
      ...s,
      name: "x".repeat(101),
      description: "x".repeat(2001),
      policies: { ...s.policies, cancellationNoticeHours: 24 * 60 + 1, holdMinutes: 4 },
      customerGroups: [{ key: "members", name: "Members", description: "x".repeat(501), restricted: true }],
      resources: [{ ...firstResource(), capacity: 1001 }, ...s.resources.slice(1)],
      services: [
        { ...firstService(), bufferBeforeMinutes: 481, capacity: 1001, priceCents: 10_000_001 },
        secondService(),
      ],
      questions: [{ ...firstQuestion(), helpText: "x".repeat(501) }],
    });
    expect(errors).toEqual({
      name: "Keep it under 100 characters",
      description: "Keep it under 2000 characters",
      "policies.cancellationNoticeHours": "Must be between 0 and 1440",
      "policies.holdMinutes": "Must be between 5 and 1440",
      "customerGroups[0].description": "Keep it under 500 characters",
      "resources[0].capacity": "Capacity must be between 1 and 1000",
      "services[0].bufferBeforeMinutes": "Must be between 0 and 480",
      "services[0].capacity": "Capacity must be between 1 and 1000",
      "services[0].priceCents": "Enter a price",
      "questions[0].helpText": "Keep it under 500 characters",
    });
    expect(
      validateSetup({
        ...s,
        policies: { ...s.policies, cancellationNoticeHours: 24 * 60, holdMinutes: 1440 },
        resources: [{ ...firstResource(), capacity: 1000 }, ...s.resources.slice(1)],
        services: [{ ...firstService(), bufferAfterMinutes: 480, capacity: 1000 }, secondService()],
      }),
    ).toEqual({});
  });

  it("rejects control characters and duplicate group names", () => {
    const s = setup();
    const errors = validateSetup({
      ...s,
      name: "Gleam\u0007",
      customerGroups: [
        { key: "members", name: "Members", description: null, restricted: true },
        { key: "vip", name: " members", description: null, restricted: false },
      ],
    });
    expect(errors.name).toBe("Contains invalid characters");
    expect(errors["customerGroups[1].name"]).toBe("Another group has this name");
  });
});

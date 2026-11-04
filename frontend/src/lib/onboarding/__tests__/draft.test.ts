import { describe, expect, it } from "vitest";
import type { BusinessSetup, MemberRole, Membership } from "@/lib/api/types";
import { must } from "@/test/must";
import { createDraft, createdBusinessIn, toCreateInput } from "../draft";
import { fixture } from "./fixture";

describe("createDraft", () => {
  it("fills what raw AI output leaves out and sorts hours", () => {
    const raw = {
      ...fixture(),
      industry: "",
      timezone: "",
      currency: "",
      branding: undefined,
      customerGroups: [{ key: "vip", name: "VIP" }],
      resources: [
        {
          key: "a",
          kind: "person",
          name: "A",
          weeklyHours: [
            { dayOfWeek: 2, startTime: "09:00", endTime: "12:00" },
            { dayOfWeek: 1, startTime: "13:00", endTime: "17:00" },
            { dayOfWeek: 1, startTime: "08:00", endTime: "12:00" },
          ],
        },
      ],
      services: [{ ...must(fixture().services[0], "service"), options: undefined, requirements: undefined }],
      questions: [{ label: "Notes", kind: "text", required: false, sensitive: false }],
    } as unknown as BusinessSetup;
    const { setup, slugEdited } = createDraft(raw);
    expect(slugEdited).toBe(false);
    expect(setup).toMatchObject({
      industry: "generic",
      timezone: "Europe/Dublin",
      currency: "EUR",
      branding: { primaryColor: "#4f46e5", logoUrl: null, coverImageUrl: null },
      customerGroups: [{ key: "vip", name: "VIP", description: null, restricted: false }],
    });
    expect(setup.resources[0]?.capacity).toBe(1);
    expect(setup.resources[0]?.weeklyHours.map((h) => `${h.dayOfWeek} ${h.startTime}`)).toEqual([
      "1 08:00",
      "1 13:00",
      "2 09:00",
    ]);
    expect(setup.resources[0]?.weeklyHours[0]?.audienceGroupKeys).toEqual([]);
    expect(setup.services[0]).toMatchObject({ options: [], requirements: [], addons: [] });
    expect(setup.questions[0]).toMatchObject({ helpText: null, options: [], serviceName: null });
  });

  it("keeps a slug the setup already has", () => {
    expect(createDraft({ ...fixture(), slug: "gleam" })).toMatchObject({
      slugEdited: true,
      setup: { slug: "gleam" },
    });
  });
});

describe("toCreateInput", () => {
  it("trims text, nulls empty optionals and drops stale deposits and select options", () => {
    const s = createDraft(fixture()).setup;
    const out = toCreateInput({
      ...s,
      name: "  Gleam Car Wash ",
      description: "  ",
      services: [{ ...must(s.services[0], "service"), category: " ", depositCents: 500 }],
      questions: [{ ...must(s.questions[0], "question"), options: ["stale"] }],
    });
    expect(out.name).toBe("Gleam Car Wash");
    expect(out.description).toBeNull();
    expect(out.services[0]).toMatchObject({ category: null, depositCents: null });
    expect(out.questions[0]?.options).toEqual([]);
  });

  it("renumbers options and add-ons and keeps select choices trimmed", () => {
    const s = createDraft(fixture()).setup;
    const valet = must(s.services[1], "valet");
    const out = toCreateInput({
      ...s,
      services: [{ ...valet, options: [...valet.options].reverse() }],
      questions: [
        { ...must(s.questions[0], "question"), kind: "select", options: [" A ", "B"], serviceName: " " },
      ],
    });
    expect(out.services[0]?.options.map((o) => [o.name, o.sortOrder])).toEqual([
      ["SUV / Van", 0],
      ["Small car", 1],
    ]);
    expect(out.services[0]?.depositCents).toBe(2000);
    expect(out.questions[0]).toMatchObject({ options: ["A", "B"], serviceName: null });
  });
});

describe("createdBusinessIn", () => {
  const membership = (businessId: string, slug: string, role: MemberRole = "owner"): Membership => ({
    businessId,
    slug,
    name: slug,
    role,
    branding: { primaryColor: "#0ea5e9", logoUrl: null, coverImageUrl: null },
  });
  const me = {
    memberships: [membership("b1", "gleam"), membership("b2", "lumen", "admin"), membership("b3", "cadence")],
  };

  it("finds the user's new business with the requested address", () => {
    expect(createdBusinessIn(me, new Set(["b1", "b2"]), "cadence")?.businessId).toBe("b3");
  });

  it("ignores businesses the user already had, didn't create, or that have another address", () => {
    expect(createdBusinessIn(me, new Set(["b1", "b2", "b3"]), "cadence")).toBeNull();
    expect(createdBusinessIn(me, new Set(), "lumen")).toBeNull();
    expect(createdBusinessIn(me, new Set(), "elsewhere")).toBeNull();
    expect(createdBusinessIn(me, new Set(), null)).toBeNull();
  });
});

import { describeProblem } from "@shared/onboarding/problems";
import { fixture } from "@shared/onboarding/__tests__/fixture";
import { createDraft } from "@shared/onboarding/draft";
import { cacheStore } from "~/lib/storage";
import { clearDraft, loadDraft, saveDraft } from "./draft-storage";
import { templateIcon } from "./template-icon";
import {
  aiDraftInput,
  alsoIncluded,
  describeSchema,
  draftFrom,
  errorsUnder,
  fixTarget,
  normaliseUrl,
  problemCount,
  serviceExtras,
} from "./wizard";

describe("wizard helpers", () => {
  it("normalises a website", () => {
    expect(normaliseUrl("  ")).toBeNull();
    expect(normaliseUrl("example.ie")).toBe("https://example.ie");
    expect(normaliseUrl("http://example.ie")).toBe("http://example.ie");
  });

  it("adds the typed name to the AI request", () => {
    expect(aiDraftInput({ name: " Shine ", description: " We wash cars. ", websiteUrl: "" })).toEqual({
      description: "We wash cars.\n\nThe business is called Shine.",
      websiteUrl: null,
    });
    expect(aiDraftInput({ name: "", description: "We wash cars.", websiteUrl: "shine.ie" })).toEqual({
      description: "We wash cars.",
      websiteUrl: "https://shine.ie",
    });
  });

  it("validates the describe form", () => {
    expect(describeSchema.safeParse({ name: "", description: "short", websiteUrl: "" }).success).toBe(false);
    expect(
      describeSchema.safeParse({
        name: "",
        description: "A long enough description of it.",
        websiteUrl: "x.ie",
      }).success,
    ).toBe(true);
  });

  it("names a draft what the owner typed, its address following", () => {
    const named = draftFrom({ ...fixture(), slug: "gleam" }, " Suds & Co ");
    expect(named.setup.name).toBe("Suds & Co");
    expect(named.setup.slug).toBe("suds-and-co");
    expect(named.slugEdited).toBe(false);
    const kept = draftFrom({ ...fixture(), slug: "gleam" }, "");
    expect(kept.setup.slug).toBe("gleam");
  });

  it("knows where a problem is fixed", () => {
    const setup = fixture();
    const at = (path: string) => fixTarget(describeProblem(setup, path, "x"), setup);
    expect(at("name")).toEqual({ sheet: "business" });
    expect(at("services[1].priceCents")).toEqual({ sheet: "service", index: 1 });
    expect(at("resources[2].weeklyHours[0].endTime")).toEqual({ sheet: "resource", key: "alex" });
    expect(at("resources[9].name")).toEqual({ sheet: null });
    expect(at("questions[0].label")).toEqual({ sheet: null });
    expect(at("services")).toEqual({ sheet: null });
  });

  it("summarises counts", () => {
    expect(problemCount(1)).toBe("1 thing to fix");
    expect(problemCount(3)).toBe("3 things to fix");
    const [wash, valet] = fixture().services;
    expect(serviceExtras(wash!)).toBeNull();
    expect(serviceExtras(valet!)).toBe("2 options, 1 add-on");
    expect(serviceExtras({ ...valet!, options: [valet!.options[0]!], addons: [] })).toBe("1 option");
    expect(alsoIncluded(fixture())).toBe("2 booking questions and 1 customer group");
    expect(alsoIncluded({ ...fixture(), questions: [fixture().questions[0]!], customerGroups: [] })).toBe(
      "1 booking question",
    );
    expect(alsoIncluded({ ...fixture(), questions: [], customerGroups: [] })).toBeNull();
    expect(
      errorsUnder({ "services[0].name": "a", "services[1].name": "b", name: "c" }, "services[0]."),
    ).toEqual([["name", "a"]]);
  });

  it("maps template icons", () => {
    expect(templateIcon("Stethoscope")).toBe(templateIcon("stethoscope"));
    expect(templateIcon("heartPulse")).toBe(templateIcon("heart-pulse"));
    expect(templateIcon(null)).toBe(templateIcon("calendar"));
    expect(templateIcon("unknown-thing")).toBe(templateIcon("calendar"));
  });
});

describe("draft storage", () => {
  const saved = { draft: createDraft(fixture()), origin: { kind: "template", key: "car_wash" } as const };

  it("keeps a draft for its user only", () => {
    expect(loadDraft("u1")).toBeNull();
    saveDraft("u1", saved);
    expect(loadDraft("u1")).toEqual(saved);
    expect(loadDraft("u2")).toBeNull();
    expect(loadDraft(null)).toBeNull();
    clearDraft();
    expect(loadDraft("u1")).toBeNull();
  });

  it("does nothing without a user", () => {
    saveDraft(null, saved);
    expect(cacheStore().getString("onboarding.draft.v1")).toBeUndefined();
  });

  it("ignores what an older version or a broken write left", () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    cacheStore().set("onboarding.draft.v1", JSON.stringify({ userId: "u1", draft: { setup: {} } }));
    expect(loadDraft("u1")).toBeNull();
    cacheStore().set("onboarding.draft.v1", "{not json");
    expect(loadDraft("u1")).toBeNull();
    cacheStore().set("onboarding.draft.v1", "null");
    expect(loadDraft("u1")).toBeNull();
  });
});

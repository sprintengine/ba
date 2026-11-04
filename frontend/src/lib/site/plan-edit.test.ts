import { describe, expect, it } from "vitest";
import { must } from "@/test/must";
import type { SiteSection } from "@/lib/api/types";
import { samplePlan } from "@/components/site/sample-site";
import { addBlocker, editPlan, moveSection, samePlan } from "./plan-edit";
import { LIMITS } from "./schema";

const defaults = { businessName: "Harbour Lane Studio", bookingNoun: "appointment" };
const ids = (sections: SiteSection[]) => sections.map((s) => s.id);

describe("editPlan", () => {
  it("sets theme, palette and SEO without touching sections", () => {
    const plan = samplePlan("calm");
    const next = editPlan(
      editPlan(editPlan(plan, { type: "setTheme", theme: "bold" }), {
        type: "setPalette",
        palette: { accent: "#c2410c" },
      }),
      {
        type: "setSeo",
        seo: { title: "New" },
      },
    );
    expect(next.theme).toBe("bold");
    expect(next.palette).toEqual({ primaryColor: plan.palette.primaryColor, accent: "#c2410c" });
    expect(next.seo.title).toBe("New");
    expect(next.sections).toBe(plan.sections);
    expect(plan.theme).toBe("calm");
  });

  it("moves sections and clamps the target", () => {
    const plan = samplePlan();
    expect(ids(moveSection(plan.sections, "faq", 1)).slice(0, 3)).toEqual(["hero", "faq", "services"]);
    expect(ids(moveSection(plan.sections, "hero", 99)).at(-1)).toBe("hero");
    expect(moveSection(plan.sections, "missing", 0)).toBe(plan.sections);
    expect(moveSection(plan.sections, "hero", 0)).toBe(plan.sections);
  });

  it("toggles and updates a section by id", () => {
    const plan = samplePlan();
    const hidden = editPlan(plan, { type: "toggle", id: "faq" });
    expect(hidden.sections.find((s) => s.id === "faq")!.enabled).toBe(false);
    expect(
      editPlan(hidden, { type: "toggle", id: "faq", enabled: true }).sections.find((s) => s.id === "faq")!
        .enabled,
    ).toBe(true);
    const updated = editPlan(plan, {
      type: "updateContent",
      id: "cta",
      content: { headline: "Go", body: null, buttonLabel: "Book" },
    });
    expect(updated.sections.find((s) => s.id === "cta")!.content).toEqual({
      headline: "Go",
      body: null,
      buttonLabel: "Book",
    });
  });

  it("adds sections with defaults before the closing CTA and contact, with unique ids", () => {
    const plan = samplePlan();
    const next = editPlan(plan, { type: "add", sectionType: "faq", defaults });
    expect(ids(next.sections).slice(-3)).toEqual(["faq-2", "cta", "contact"]);
    expect(next.sections.find((s) => s.id === "faq-2")!.content).toEqual({
      heading: "Questions and answers",
      items: [],
    });
    const at = editPlan(plan, { type: "add", sectionType: "cta", defaults, at: 1, id: "promo" });
    expect(ids(at.sections)[1]).toBe("promo");
  });

  it("puts a hero at the top and allows only one", () => {
    const plan = samplePlan();
    const without = { ...plan, sections: plan.sections.filter((s) => s.type !== "hero") };
    expect(ids(editPlan(without, { type: "add", sectionType: "hero", defaults }).sections)[0]).toBe("hero");
    expect(addBlocker(plan, "hero")).toMatch(/only be one hero/);
    expect(editPlan(plan, { type: "add", sectionType: "hero", defaults })).toBe(plan);
  });

  it("refuses to go past the section limit", () => {
    let plan = samplePlan();
    while (plan.sections.length < LIMITS.sections)
      plan = editPlan(plan, { type: "add", sectionType: "cta", defaults });
    expect(addBlocker(plan, "faq")).toMatch(/at most 16/);
    expect(editPlan(plan, { type: "add", sectionType: "faq", defaults })).toBe(plan);
    expect(editPlan(plan, { type: "duplicate", id: "faq" })).toBe(plan);
  });

  it("duplicates (deep copy, next to the original) and removes", () => {
    const plan = samplePlan();
    const dup = editPlan(plan, { type: "duplicate", id: "faq" });
    const i = ids(dup.sections).indexOf("faq");
    expect(ids(dup.sections)[i + 1]).toBe("faq-2");
    const original = must(dup.sections[i], "original").content;
    const copy = must(dup.sections[i + 1], "copy").content;
    expect(copy).not.toBe(original);
    expect(copy).toEqual(original);
    expect(ids(editPlan(plan, { type: "remove", id: "faq" }).sections)).not.toContain("faq");
  });
});

describe("samePlan", () => {
  it("ignores key order and undefined values", () => {
    const a = samplePlan();
    const b = {
      sections: a.sections,
      seo: { description: a.seo.description, title: a.seo.title },
      palette: a.palette,
      theme: a.theme,
    };
    expect(samePlan(a, b)).toBe(true);
    expect(samePlan(a, { ...a, theme: "bold" })).toBe(false);
    expect(samePlan(null, undefined)).toBe(true);
  });
});

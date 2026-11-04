import { describe, expect, it } from "vitest";
import { must } from "@/test/must";
import type { HeroContent } from "@/lib/api/types";
import { samplePlan } from "@/components/site/sample-site";
import { generatedImage } from "./images";
import { normalizePlan, planIssues } from "./plan-validation";
import { faqSchema, heroSchema, LIMITS, paletteProblem, siteImageSchema, testimonialsSchema } from "./schema";

const hero = must(samplePlan().sections[0], "hero section").content as HeroContent;

describe("site plan schema (mirrors the backend)", () => {
  it("accepts text exactly at the limit and rejects one more", () => {
    expect(heroSchema.safeParse({ ...hero, headline: "x".repeat(LIMITS.headline) }).success).toBe(true);
    const over = heroSchema.safeParse({ ...hero, headline: "x".repeat(LIMITS.headline + 1) });
    expect(over.success).toBe(false);
    expect(over.error?.issues[0]?.message).toBe(`Headline can be at most ${LIMITS.headline} characters`);
  });

  it("requires required text and turns empty optional text into null", () => {
    expect(heroSchema.safeParse({ ...hero, headline: "   " }).success).toBe(false);
    expect(heroSchema.parse({ ...hero, eyebrow: "  " }).eyebrow).toBeNull();
  });

  it("rejects unknown fields (no invented content such as ratings or prices)", () => {
    expect(heroSchema.safeParse({ ...hero, rating: 5 }).success).toBe(false);
    expect(
      testimonialsSchema.safeParse({
        heading: "Reviews",
        items: [{ quote: "Great", author: "A", detail: null, stars: 5 }],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown enum values and control characters", () => {
    expect(heroSchema.safeParse({ ...hero, variant: "carousel" }).success).toBe(false);
    expect(heroSchema.safeParse({ ...hero, headline: "Hi\u0007" }).success).toBe(false);
  });

  it("caps list lengths", () => {
    const item = { question: "Q?", answer: "A." };
    expect(faqSchema.safeParse({ heading: "FAQ", items: Array(LIMITS.faqItems).fill(item) }).success).toBe(
      true,
    );
    expect(
      faqSchema.safeParse({ heading: "FAQ", items: Array(LIMITS.faqItems + 1).fill(item) }).success,
    ).toBe(false);
  });

  it("validates image kinds", () => {
    expect(siteImageSchema.safeParse(generatedImage("waves")).success).toBe(true);
    expect(siteImageSchema.safeParse({ ...generatedImage("waves"), pattern: null }).success).toBe(false);
    const stock = {
      kind: "stock",
      url: "https://images.unsplash.com/photo-1",
      alt: "",
      pattern: null,
      attribution: { name: "A", url: "https://unsplash.com/@a" },
    };
    expect(siteImageSchema.safeParse(stock).success).toBe(true);
    expect(siteImageSchema.safeParse({ ...stock, url: "https://example.com/x.jpg" }).success).toBe(false);
    expect(siteImageSchema.safeParse({ ...stock, attribution: null }).success).toBe(false);
    expect(
      siteImageSchema.safeParse({
        kind: "upload",
        url: "javascript:alert(1)",
        alt: "",
        pattern: null,
        attribution: null,
      }).success,
    ).toBe(false);
  });

  it("checks palette contrast like the server", () => {
    expect(paletteProblem("#0e7c70", "primary")).toBeNull();
    expect(paletteProblem("#ffff00", "primary")).toMatch(/Too light for buttons/);
    expect(paletteProblem("#fde68a", "accent")).toMatch(/Too light for accents/);
    expect(paletteProblem(null, "accent")).toBeNull();
    expect(paletteProblem("teal", "primary")).toBe("Pick a colour");
  });
});

describe("planIssues / normalizePlan", () => {
  it("collects problems per section, palette and SEO", () => {
    const plan = samplePlan();
    expect(planIssues(plan).count).toBe(0);
    const broken = {
      ...plan,
      palette: { primaryColor: "#ffff00", accent: null },
      seo: { title: "x".repeat(LIMITS.seoTitle + 1), description: null },
      sections: plan.sections.map((s) =>
        s.type === "hero" ? { ...s, content: { ...s.content, headline: "" } } : s,
      ),
    };
    const issues = planIssues(broken);
    expect(issues.sections.hero).toEqual({ headline: "Required" });
    expect(issues.palette.primaryColor).toMatch(/Too light/);
    expect(issues.seo.title).toMatch(/at most 70/);
    expect(issues.count).toBe(3);
  });

  it("normalises raw form values to the API shape", () => {
    const plan = samplePlan();
    const raw = {
      ...plan,
      seo: { title: "  ", description: " Hi " },
      sections: plan.sections.map((s) =>
        s.type === "hero" ? { ...s, content: { ...s.content, eyebrow: "", headline: "  Hello  " } } : s,
      ),
    };
    const out = normalizePlan(raw);
    const heroOut = out.sections.find((s) => s.type === "hero")!.content;
    expect(heroOut.eyebrow).toBeNull();
    expect(heroOut.headline).toBe("Hello");
    expect(out.seo).toEqual({ title: null, description: "Hi" });
  });
});

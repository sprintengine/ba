import { INDUSTRIES } from "@/components/shells/industries";
import { priceLabel } from "@/lib/booking/quote";
import { must } from "@/test/must";
import {
  INDUSTRY_CONTENT,
  INDUSTRY_LIST,
  industryContent,
  quoteService,
  templateSignUpHref,
} from "./industry-content";

describe("industry content", () => {
  it("has content for every launch industry, keyed and ordered like INDUSTRIES", () => {
    expect(Object.keys(INDUSTRY_CONTENT).sort()).toEqual(INDUSTRIES.map((i) => i.slug).sort());
    expect(INDUSTRY_LIST.map((c) => c.slug)).toEqual(INDUSTRIES.map((i) => i.slug));
  });

  it.each(INDUSTRIES.map((i) => [i.slug, i] as const))("%s is complete and consistent", (slug, industry) => {
    const c = industryContent(slug)!;
    expect(c).not.toBeNull();
    expect(c.slug).toBe(slug);
    expect(c.templateKey).toBe(industry.template);
    expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(c.services.length).toBeGreaterThan(0);
    expect(c.features.length).toBeGreaterThanOrEqual(4);
    expect(c.hero.points.length).toBeGreaterThan(0);
    expect(c.meta.description.length).toBeLessThanOrEqual(200);
    expect(c.preview.serviceIndexes).toContain(c.preview.serviceIndex);
    for (const i of c.preview.serviceIndexes) expect(c.services[i]).toBeDefined();
    expect(c.preview.slots.length).toBeGreaterThan(0);
    for (const s of c.services) {
      if (s.paymentMode === "deposit") expect(s.depositCents).toBeGreaterThan(0);
      if (s.options) expect(s.options[0]?.priceCents).toBe(s.priceCents);
    }
  });

  it("returns null for unknown industries", () => {
    expect(industryContent("bakery")).toBeNull();
  });
});

describe("quoteService", () => {
  const valet = must(INDUSTRY_CONTENT["car-wash"].services[1], "valet");

  it("uses the base service without an option", () => {
    expect(quoteService(must(INDUSTRY_CONTENT.physio.services[0], "physio service"))).toEqual({
      durationMinutes: 60,
      priceCents: 7000,
      dueNowCents: 7000,
    });
  });

  it("applies the option and stacks add-ons; deposits are due now", () => {
    expect(quoteService(valet, 1, [0])).toEqual({
      durationMinutes: 140,
      priceCents: 9500,
      dueNowCents: 2000,
    });
    expect(quoteService(valet, 2, [0, 1])).toEqual({
      durationMinutes: 215,
      priceCents: 15000,
      dueNowCents: 2000,
    });
  });

  it("charges nothing upfront for pay-at-venue and free services", () => {
    expect(quoteService(must(INDUSTRY_CONTENT["gp-practice"].services[0], "GP service")).dueNowCents).toBe(0);
    expect(quoteService(must(INDUSTRY_CONTENT["music-lessons"].services[0], "lesson")).dueNowCents).toBe(0);
  });

  it("ignores unknown add-ons", () => {
    expect(quoteService(valet, 0, [9]).priceCents).toBe(6000);
  });
});

describe("helpers", () => {
  it("prices an example from its cheapest option", () => {
    expect(priceLabel(must(INDUSTRY_CONTENT["music-lessons"].services[1], "lesson"), "EUR")).toBe("from €25");
  });

  it("templateSignUpHref sends new users to onboarding with the template", () => {
    const href = templateSignUpHref("car_wash");
    expect(href.startsWith("/sign-up?redirect_url=")).toBe(true);
    expect(new URLSearchParams(href.split("?")[1]).get("redirect_url")).toBe("/onboarding?template=car_wash");
  });
});

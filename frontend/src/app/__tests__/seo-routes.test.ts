import { afterEach, describe, expect, it, vi } from "vitest";
import { metadata as exploreMetadata } from "../(marketing)/explore/layout";
import robots from "../robots";
import sitemap from "../sitemap";

afterEach(() => vi.unstubAllEnvs());

describe("robots.txt", () => {
  it("keeps crawlers out of signed-in, tokenised and internal routes, and points at the sitemap", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://bookanything.ie/");
    const { rules, sitemap: map } = robots();
    expect(map).toBe("https://bookanything.ie/sitemap.xml");
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect(rule?.userAgent).toBe("*");
    const disallow = [rule?.disallow ?? []].flat();
    for (const route of ["dashboard", "dev", "manage", "oauth", "my", "onboarding", "invitations", "api"])
      expect(disallow, route).toContain(`/${route}/`);
    expect(disallow).toEqual(expect.arrayContaining(["/dashboard$", "/my$", "/onboarding$"]));
  });

  it("never blocks a business whose slug starts like a reserved route (/my-physio, /devon-cars)", () => {
    const rule = [robots().rules].flat()[0];
    const blocked = (path: string) =>
      [rule?.disallow ?? []]
        .flat()
        .some((d) => (d.endsWith("$") ? path === d.slice(0, -1) : path.startsWith(d)));
    expect(blocked("/my-physio")).toBe(false);
    expect(blocked("/devon-cars")).toBe(false);
    expect(blocked("/managed-care/book")).toBe(false);
    expect(blocked("/my")).toBe(true);
    expect(blocked("/dashboard/lumen/calendar")).toBe(true);
    expect(blocked("/explore")).toBe(false); // its pages say noindex themselves
  });
});

describe("sitemap.xml", () => {
  it("lists the marketing pages on the public origin, without Explore or the draft legal pages", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://bookanything.ie");
    const urls = sitemap().map((e) => e.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        "https://bookanything.ie",
        "https://bookanything.ie/pricing",
        "https://bookanything.ie/for/physio",
        "https://bookanything.ie/for/gp-practice",
        "https://bookanything.ie/help/ai-assistant",
      ]),
    );
    expect(urls.some((u) => u.includes("/explore") || u.includes("/legal/"))).toBe(false);
  });

  it("lists the business agents guide unless the business server is switched off", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://bookanything.ie");
    const guide = "https://bookanything.ie/help/ai-agents-for-business";
    expect(sitemap().map((e) => e.url)).toContain(guide);
    vi.stubEnv("NEXT_PUBLIC_BUSINESS_MCP_ENABLED", "false");
    expect(sitemap().map((e) => e.url)).not.toContain(guide);
  });
});

describe("Explore while hidden", () => {
  it("is not indexed, but its links are followed", () => {
    expect(exploreMetadata.robots).toEqual({ index: false, follow: true });
  });
});

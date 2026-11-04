import { describe, expect, it } from "vitest";
import type { SiteVersion } from "@/lib/api/types";
import { aiHistory, canUseSiteAi } from "./ai";
import { describeImage, generatedImage, stockImage, uploadedImage, uploadProblem } from "./images";
import { siteSeo } from "./seo";

describe("site AI", () => {
  it("needs credits only when a model is connected", () => {
    const credits = {
      limit: 100,
      used: 100,
      remaining: 0,
      runningLow: true,
      limitReached: true,
      resetsOn: "2026-11-01",
      overage: false,
    };
    expect(canUseSiteAi({ model: true, credits })).toBe(false);
    expect(
      canUseSiteAi({
        model: true,
        credits: { ...credits, used: 20, remaining: 80, runningLow: false, limitReached: false },
      }),
    ).toBe(true);
    expect(canUseSiteAi({ model: false, credits }), "the built-in designer is free").toBe(true);
  });

  it("lists AI versions newest first", () => {
    const v = (version: number, source: SiteVersion["source"]): SiteVersion => ({
      version,
      source,
      instruction: null,
      changes: [],
      actorType: "owner",
      actorName: null,
      createdAt: "2026-09-30T10:00:00Z",
      isPublished: false,
      isDraft: false,
    });
    expect(
      aiHistory([v(1, "template"), v(2, "ai_generate"), v(3, "owner"), v(4, "ai_edit")]).map(
        (x) => x.version,
      ),
    ).toEqual([4, 2]);
  });
});

describe("images", () => {
  it("checks uploads before sending them", () => {
    expect(uploadProblem({ type: "image/png", size: 1000 }, 5_000_000)).toBeNull();
    expect(uploadProblem({ type: "image/gif", size: 1000 }, 5_000_000)).toMatch(/PNG, JPEG or WebP/);
    expect(uploadProblem({ type: "image/svg+xml", size: 1000 }, 5_000_000)).toMatch(/PNG, JPEG or WebP/);
    expect(uploadProblem({ type: "image/jpeg", size: 5_000_001 }, 5_000_000)).toMatch(
      /at most 4 MB|at most 5 MB/,
    );
  });

  it("builds image values and describes them", () => {
    expect(uploadedImage({ url: "https://x.test/a.png" })).toEqual({
      kind: "upload",
      url: "https://x.test/a.png",
      alt: "",
      pattern: null,
      attribution: null,
    });
    const stock = stockImage({
      id: "p1",
      url: "https://images.unsplash.com/p1",
      thumbUrl: "t",
      width: 1,
      height: 1,
      color: null,
      alt: "A room",
      attribution: { name: "Pat Doe", url: "https://unsplash.com/@pat" },
      downloadLocation: "https://api.unsplash.com/photos/p1/download",
    });
    expect(stock.attribution?.name).toBe("Pat Doe");
    expect(describeImage(stock)).toBe("Photo by Pat Doe");
    expect(describeImage(generatedImage("mesh"))).toBe("Generated · mesh");
    expect(describeImage(null)).toBe("No image");
  });
});

describe("siteSeo", () => {
  const base = {
    id: "b",
    slug: "s",
    name: "Harbour Lane Studio",
    description: null,
    industry: "generic",
    timezone: "Europe/Dublin",
    currency: "EUR",
    locale: "en-IE",
    contactEmail: null,
    contactPhone: null,
    websiteUrl: null,
    address: { line1: null, line2: null, city: "Dublin", postcode: null },
    branding: { primaryColor: "#0e7c70", logoUrl: null, coverImageUrl: null },
    vocabulary: {
      resource: "r",
      resources: "r",
      customer: "c",
      customers: "c",
      booking: "b",
      bookings: "Appointments",
    },
    policies: {
      minNoticeMinutes: 0,
      maxAdvanceDays: 1,
      cancellationNoticeHours: 0,
      lateCancellationRefundPercent: 0,
      allowCustomerCancel: true,
      allowCustomerReschedule: true,
      holdMinutes: 5,
      requireCustomerPhone: false,
      nextAvailableOnly: false,
    },
    customerGroups: [],
    paymentsEnabled: false,
    showBadge: false,
  };
  it("prefers the site plan's SEO and falls back to derived copy", () => {
    expect(siteSeo(base)).toEqual({
      title: "Harbour Lane Studio",
      description: expect.stringContaining("in Dublin"),
      image: null,
    });
    const withSite = {
      ...base,
      site: {
        isDefault: false,
        context: { team: [], openingHours: [] },
        plan: {
          theme: "calm" as const,
          palette: { primaryColor: "#0e7c70", accent: null },
          seo: { title: "Custom title", description: "Custom description" },
          sections: [
            {
              id: "hero",
              type: "hero" as const,
              enabled: true,
              content: {
                variant: "split" as const,
                eyebrow: null,
                headline: "H",
                subheadline: null,
                ctaLabel: null,
                image: uploadedImage({ url: "https://x.test/h.png" }),
              },
            },
          ],
        },
      },
    };
    expect(siteSeo(withSite)).toEqual({
      title: "Custom title",
      description: "Custom description",
      image: "https://x.test/h.png",
    });
  });
});

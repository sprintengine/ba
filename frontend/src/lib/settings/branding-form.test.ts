import { describe, expect, it } from "vitest";
import { business } from "@/components/dashboard/test/render";
import {
  brandingSchema,
  brandingValuesToUpdate,
  businessToBrandingValues,
  type BrandingValues,
} from "./branding-form";

const issues = (v: BrandingValues) => {
  const r = brandingSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};
const values = (patch: Partial<BrandingValues> = {}) => ({ ...businessToBrandingValues(business), ...patch });

describe("branding settings form", () => {
  it("maps a business to values, with missing images as empty strings", () => {
    expect(businessToBrandingValues(business)).toEqual({
      primaryColor: business.branding.primaryColor,
      logoUrl: "",
      coverImageUrl: "",
      portalStyle: business.branding.portalStyle ?? "minimal",
      ...business.vocabulary,
    });
    // An older API without a style: Minimal.
    expect(
      businessToBrandingValues({ ...business, branding: { ...business.branding, portalStyle: null } })
        .portalStyle,
    ).toBe("minimal");
    expect(issues(values())).toEqual([]);
  });

  it("takes only http(s) image addresses the backend keeps", () => {
    expect(issues(values({ logoUrl: "https://cdn.example.com/logo.png" }))).toEqual([]);
    expect(issues(values({ logoUrl: "ftp://example.com/logo.png" }))).toEqual([
      "logoUrl: Enter a full image address starting with https://",
    ]);
    expect(issues(values({ coverImageUrl: `https://example.com/${"a".repeat(500)}` }))).toEqual([
      "coverImageUrl: Keep it under 500 characters",
    ]);
  });

  it("needs a hex colour and every word, each at most 40 characters", () => {
    expect(issues(values({ primaryColor: "teal" }))).toEqual(["primaryColor: Use a hex colour like #0e7c70"]);
    expect(issues(values({ customer: "  " }))).toEqual(["customer: Required"]);
    expect(issues(values({ bookings: "x".repeat(41) }))[0]).toMatch(/^bookings:/);
  });

  it("sends a lowercase colour, trimmed words and blank images as null", () => {
    const update = brandingValuesToUpdate(
      values({
        primaryColor: "#0E7C70",
        logoUrl: " https://x.test/l.png ",
        customer: " Client ",
        portalStyle: "bold",
      }),
    );
    expect(update.branding).toEqual({
      primaryColor: "#0e7c70",
      logoUrl: "https://x.test/l.png",
      coverImageUrl: null,
      portalStyle: "bold",
    });
    expect(update.vocabulary).toMatchObject({ customer: "Client" });
  });
});

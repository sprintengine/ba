import { describe, expect, it } from "vitest";
import { cleanSlugInput, slugify, slugProblem, SLUG_FORMAT } from "./slug";

describe("slug rules", () => {
  it("mirrors backend slugify", () => {
    expect(slugify("Gleam Car Wash")).toBe("gleam-car-wash");
    expect(slugify("Café & Co.")).toBe("cafe-and-co");
    expect(slugify("  Lumen   Physiotherapy!! ")).toBe("lumen-physiotherapy");
    expect(slugify("AB")).toBe("ab-booking");
    expect(slugify("Dashboard")).toBe("dashboard-booking");
    expect(slugify("x".repeat(80))).toHaveLength(50);
  });

  it("flags bad formats and reserved words like the backend", () => {
    expect(slugProblem("gleam-car-wash")).toBeNull();
    expect(slugProblem("ab")).toMatch(/3 to 50/);
    expect(slugProblem("-gleam")).toMatch(/3 to 50/);
    expect(slugProblem("Gleam")).toMatch(/3 to 50/);
    expect(slugProblem("gleam--wash")).toMatch(/consecutive/);
    expect(slugProblem("pricing")).toMatch(/reserved/);
    expect(slugProblem("health")).toMatch(/reserved/);
    // Next.js metadata routes at the site root.
    for (const slug of [
      "opengraph-image",
      "twitter-image",
      "icon",
      "apple-icon",
      "manifest",
      "robots",
      "sitemap",
    ]) {
      expect(slugProblem(slug)).toMatch(/reserved/);
    }
  });

  it("never makes or accepts a UUID-shaped slug (the dashboard reads the business by id or slug)", () => {
    const id = "0b9f5c2e-6d1a-4c3b-9e8f-7a6b5c4d3e2f";
    expect(slugProblem(id)).toMatch(/reserved/);
    expect(slugify(id)).toBe(`${id}-booking`);
    expect(slugProblem(`${id}-booking`)).toBeNull();
  });

  it("cleans typed input", () => {
    expect(cleanSlugInput("My Great_Studio!")).toBe("my-great-studio");
  });
});

describe("SLUG_FORMAT", () => {
  it("allows 3 to 50 characters that start and end with a letter or digit", () => {
    expect(SLUG_FORMAT.test("abc")).toBe(true);
    expect(SLUG_FORMAT.test("a".repeat(50))).toBe(true);
    expect(SLUG_FORMAT.test("a".repeat(51))).toBe(false);
    expect(SLUG_FORMAT.test("abc-")).toBe(false);
  });
});

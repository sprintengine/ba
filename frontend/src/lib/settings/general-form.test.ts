import { describe, expect, it } from "vitest";
import { business } from "@/components/dashboard/test/render";
import {
  businessToGeneralValues,
  deleteBusinessDescription,
  generalSettingsSchema,
  generalValuesToUpdate,
  SLUG_PATTERN,
  type GeneralSettingsValues,
} from "./general-form";

const issues = (v: GeneralSettingsValues) => {
  const r = generalSettingsSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};
const values = (patch: Partial<GeneralSettingsValues> = {}) => ({
  ...businessToGeneralValues(business),
  ...patch,
});

describe("general settings form", () => {
  it("maps a business to values with nulls as empty strings", () => {
    expect(businessToGeneralValues(business)).toMatchObject({
      name: "Lumen Physiotherapy",
      slug: "lumen-physio",
      description: "",
      contactEmail: "",
      line1: "",
      published: true,
    });
    expect(businessToGeneralValues({ ...business, status: "draft" }).published).toBe(false);
  });

  it("builds the update with trimmed values, blanks as null and the status", () => {
    const update = generalValuesToUpdate(
      values({ name: " Lumen ", description: "  ", city: " Cork ", websiteUrl: "", published: false }),
    );
    expect(update).toMatchObject({
      name: "Lumen",
      slug: "lumen-physio",
      description: null,
      websiteUrl: null,
      address: { line1: null, line2: null, city: "Cork", postcode: null },
      status: "draft",
    });
  });

  it("uses the backend's limits: name 100, address 50, description 2000 characters", () => {
    expect(
      issues(values({ name: "x".repeat(100), slug: "a".repeat(50), description: "x".repeat(2000) })),
    ).toEqual([]);
    expect(issues(values({ name: "x".repeat(101) }))[0]).toMatch(/^name:/);
    expect(issues(values({ slug: "a".repeat(51) }))[0]).toMatch(/^slug:/);
    expect(issues(values({ description: "x".repeat(2001) }))[0]).toMatch(/^description:/);
  });

  it("checks the phone number and website like the backend", () => {
    expect(issues(values({ contactPhone: "+353 (1) 555-0199" }))).toEqual([]);
    expect(issues(values({ contactPhone: "" }))).toEqual([]);
    expect(issues(values({ contactPhone: "call reception" }))).toEqual([
      "contactPhone: Enter a valid phone number",
    ]);
    expect(issues(values({ contactPhone: "1".repeat(21) }))).toEqual([
      "contactPhone: Enter a valid phone number",
    ]);
    expect(issues(values({ websiteUrl: "https://example.com/about" }))).toEqual([]);
    expect(issues(values({ websiteUrl: "ftp://example.com" }))).toEqual([
      "websiteUrl: Enter a full address, e.g. https://example.com",
    ]);
    expect(issues(values({ websiteUrl: `https://example.com/${"x".repeat(500)}` }))[0]).toMatch(
      /^websiteUrl:/,
    );
  });

  it("validates the slug's format and reserved words", () => {
    expect(issues(values())).toEqual([]);
    expect(SLUG_PATTERN.test("a--b")).toBe(false);
    expect(issues(values({ slug: "Lumen" }))[0]).toMatch(/^slug: Lowercase/);
    expect(issues(values({ slug: "dashboard" }))).toEqual(["slug: That address is reserved"]);
    expect(issues(values({ contactEmail: "nope" }))).toEqual(["contactEmail: Enter a valid email"]);
  });
});

describe("deleteBusinessDescription", () => {
  it("says what deleting really does, in the business's words, and promises no grace period", () => {
    const text = deleteBusinessDescription({ customers: "patients", bookings: "appointments" });
    expect(text).toContain("Your patients can still see and cancel their appointments");
    expect(text).toContain("can't restore the business yourself");
    expect(text).toContain("Cancel it in Billing first");
    expect(text).not.toMatch(/30 days|change your mind/);
  });
});

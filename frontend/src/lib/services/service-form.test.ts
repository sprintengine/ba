import { describe, expect, it } from "vitest";
import type { Service } from "@/lib/api/types";
import {
  emptyServiceValues,
  formValuesToServiceInput,
  serviceFormSchema,
  serviceToFormValues,
  serviceWith,
  type ServiceFormValues,
} from "./service-form";

const service: Service = {
  id: "s1",
  name: "Full valet",
  description: null,
  category: "Valeting",
  color: "#0369A1",
  durationMinutes: 90,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 10,
  slotIntervalMinutes: 30,
  minNoticeMinutes: null,
  maxAdvanceDays: null,
  capacity: 1,
  priceCents: 6000,
  paymentMode: "full",
  depositCents: null,
  allowPayAtVenue: false,
  requiresApproval: false,
  locationType: "business",
  allowedGroupIds: [],
  isPublic: true,
  isActive: true,
  sortOrder: 2,
  options: [
    { id: "o2", name: "SUV / Van", description: null, durationMinutes: 120, priceCents: 9000, sortOrder: 2 },
    {
      id: "o1",
      name: "Small car",
      description: "Hatchbacks",
      durationMinutes: 75,
      priceCents: 5000,
      sortOrder: 1,
    },
  ],
  addons: [{ id: "a1", name: "Wax", description: null, extraMinutes: 15, priceCents: 1500, sortOrder: 0 }],
  requirements: [
    {
      id: "q1",
      label: "Bay",
      quantity: 1,
      customerSelectable: false,
      resourceIds: ["b1", "b2"],
      sortOrder: 0,
    },
  ],
};

const valid = (patch: Partial<ServiceFormValues> = {}): ServiceFormValues => ({
  ...emptyServiceValues(),
  name: "Consultation",
  ...patch,
});

const issues = (v: ServiceFormValues) => {
  const r = serviceFormSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("serviceFormSchema", () => {
  it("accepts a minimal valid service", () => {
    expect(issues(valid())).toEqual([]);
  });

  it("requires a name and a sane duration", () => {
    expect(issues(valid({ name: "  " }))[0]).toMatch(/^name:/);
    expect(issues(valid({ durationMinutes: 0 }))[0]).toMatch(/^durationMinutes: At least 5/);
    expect(issues(valid({ durationMinutes: 12.5 }))[0]).toMatch(/Whole minutes/);
  });

  it("requires a price for online payment and a deposit within the price", () => {
    expect(issues(valid({ paymentMode: "full", priceCents: 0 }))[0]).toMatch(/^priceCents:/);
    expect(issues(valid({ paymentMode: "deposit", priceCents: 5000, depositCents: null }))[0]).toMatch(
      /^depositCents: Enter/,
    );
    expect(issues(valid({ paymentMode: "deposit", priceCents: 5000, depositCents: 6000 }))[0]).toMatch(
      /more than the price/,
    );
    expect(issues(valid({ paymentMode: "deposit", priceCents: 5000, depositCents: 1000 }))).toEqual([]);
  });

  it("checks the deposit against the service's own price, options or not, as the backend does", () => {
    const options = [
      { name: "A", description: "", durationMinutes: 30, priceCents: 1500 },
      { name: "B", description: "", durationMinutes: 60, priceCents: 3000 },
    ];
    const deposit = (priceCents: number, depositCents: number) =>
      issues(valid({ paymentMode: "deposit", priceCents, depositCents, options }));
    // Priced only by its options (base 0): no deposit fits.
    expect(deposit(0, 2000)[0]).toMatch(/^depositCents: The deposit can't be more than the price/);
    // Within the base price, even above the cheapest option: the backend takes it.
    expect(deposit(5000, 2000)).toEqual([]);
    // Within the dearest option but above the base price: the backend refuses it.
    expect(deposit(1000, 2000)[0]).toMatch(/^depositCents:/);
  });

  it("allows only one customer-selectable requirement and enough resources", () => {
    const req = { label: "Therapist", quantity: 1, customerSelectable: true, resourceIds: ["r1"] };
    const out = issues(valid({ requirements: [req, { ...req, label: "Room" }] }));
    expect(out.filter((m) => m.includes("customerSelectable"))).toHaveLength(2);
    expect(issues(valid({ requirements: [{ ...req, quantity: 2 }] }))[0]).toMatch(/only 1 can do it/);
    expect(issues(valid({ requirements: [{ ...req, resourceIds: [] }] }))[0]).toMatch(/Pick at least one/);
  });

  it("accepts the backend's limits: buffers up to 8 hours and up to 1000 seats", () => {
    expect(issues(valid({ bufferBeforeMinutes: 480, bufferAfterMinutes: 300 }))).toEqual([]);
    expect(issues(valid({ bufferAfterMinutes: 481 }))).toEqual(["bufferAfterMinutes: At most 480 minutes"]);
    expect(issues(valid({ capacity: 1000 }))).toEqual([]);
    expect(issues(valid({ capacity: 1001 }))).toEqual(["capacity: At most 1000"]);
  });

  it("checks the backend's text limits on options, add-ons and requirements", () => {
    const o = { name: "x".repeat(120), description: "", durationMinutes: 30, priceCents: 0 };
    const a = { name: "x".repeat(120), description: "", extraMinutes: 0, priceCents: 0 };
    const r = { label: "x".repeat(100), quantity: 1, customerSelectable: false, resourceIds: ["r1"] };
    expect(issues(valid({ options: [o], addons: [a], requirements: [r] }))).toEqual([]);
    expect(
      issues(
        valid({
          options: [{ ...o, name: "x".repeat(121) }],
          addons: [{ ...a, name: "x".repeat(121) }],
          requirements: [{ ...r, label: "x".repeat(101) }],
        }),
      ),
    ).toEqual([
      "options.0.name: Keep it under 120 characters",
      "addons.0.name: Keep it under 120 characters",
      "requirements.0.label: Keep it under 100 characters",
    ]);
  });

  it("checks the backend's price cap and item counts", () => {
    expect(issues(valid({ priceCents: 10_000_000 }))).toEqual([]);
    expect(issues(valid({ priceCents: 10_000_001 }))).toEqual(["priceCents: That price is too high"]);
    const o = { name: "", description: "", durationMinutes: 30, priceCents: 0 };
    const options = Array.from({ length: 31 }, (_, i) => ({ ...o, name: `Option ${i}` }));
    expect(issues(valid({ options: options.slice(0, 30) }))).toEqual([]);
    expect(issues(valid({ options }))[0]).toMatch(/^options:/);
  });

  it("rejects duplicate option names and odd slot intervals", () => {
    const o = { name: "Small", description: "", durationMinutes: 30, priceCents: 0 };
    expect(issues(valid({ options: [o, { ...o, name: " small " }] }))[0]).toMatch(/unique/);
    expect(issues(valid({ slotIntervalMinutes: 7 }))[0]).toMatch(/multiple of 5/);
  });
});

describe("conversions", () => {
  it("maps a service to form values with options sorted and nulls as empty strings", () => {
    const v = serviceToFormValues(service);
    expect(v.description).toBe("");
    expect(v.options.map((o) => o.name)).toEqual(["Small car", "SUV / Van"]);
    expect(v.options[0]).toEqual({
      id: "o1",
      name: "Small car",
      description: "Hatchbacks",
      durationMinutes: 75,
      priceCents: 5000,
    });
  });

  it("builds a ServiceInput with sortOrder by position, nulls for blanks, and keeps item ids", () => {
    const input = formValuesToServiceInput(serviceToFormValues(service));
    expect(input).not.toHaveProperty("id");
    expect(input.description).toBeNull();
    expect(input.color).toBe("#0369a1");
    expect(input.options.map((o) => [o.id, o.sortOrder])).toEqual([
      ["o1", 0],
      ["o2", 1],
    ]);
    expect(input.requirements[0]).toEqual({
      id: "q1",
      label: "Bay",
      quantity: 1,
      customerSelectable: false,
      resourceIds: ["b1", "b2"],
      sortOrder: 0,
    });
  });

  it("zeroes prices for free services and drops the deposit unless in deposit mode", () => {
    const input = formValuesToServiceInput({
      ...serviceToFormValues(service),
      paymentMode: "free",
      depositCents: 500,
    });
    expect(input.priceCents).toBe(0);
    expect(input.options.every((o) => o.priceCents === 0)).toBe(true);
    expect(input.depositCents).toBeNull();
  });

  it("serviceWith patches a full replace body for list toggles", () => {
    const input = serviceWith(service, { isPublic: false });
    expect(input.isPublic).toBe(false);
    expect(input.options).toHaveLength(2);
    expect(input.name).toBe("Full valet");
  });
});

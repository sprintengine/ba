import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { FormQuestion, Service } from "@/lib/api/types";
import {
  answerErrors,
  buildStaffBooking,
  createBookingFailure,
  defaultPaymentMode,
  isPricedService,
  newBookingDefaults,
  newBookingSchema,
  questionsFor,
  type NewBookingValues,
} from "./new-booking";

const TODAY = "2026-10-01";
const TZ = "Europe/Dublin";

const therapists = {
  id: "req1",
  label: "Therapist",
  quantity: 1,
  customerSelectable: false,
  resourceIds: ["r1", "r2"],
  sortOrder: 0,
};
const service = (patch: Partial<Service> = {}): Service =>
  ({
    id: "s1",
    paymentMode: "at_venue",
    priceCents: 4500,
    options: [],
    requirements: [therapists],
    ...patch,
  }) as Service;

const valid = (patch: Partial<NewBookingValues> = {}): NewBookingValues => ({
  ...newBookingDefaults({}, TODAY),
  serviceId: "s1",
  slotStart: "2026-10-02T09:00:00.000Z",
  slotResourceIds: ["r1"],
  customerId: "c1",
  ...patch,
});

const errors = (values: NewBookingValues) => {
  const r = newBookingSchema.safeParse(values);
  return Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));
};

describe("newBookingDefaults", () => {
  it("starts today with free times, or at the prefilled exact time", () => {
    expect(newBookingDefaults({}, TODAY)).toMatchObject({
      date: TODAY,
      timeMode: "slots",
      withResource: "any",
    });
    expect(
      newBookingDefaults(
        { date: "2026-10-05", time: "14:30", resourceId: "r2", customer: { id: "c9", name: "A" } },
        TODAY,
      ),
    ).toMatchObject({
      date: "2026-10-05",
      timeMode: "exact",
      exactTime: "14:30",
      withResource: "r2",
      customerId: "c9",
    });
  });

  it("never starts in the past", () => {
    expect(newBookingDefaults({ date: "2026-09-01" }, TODAY).date).toBe(TODAY);
  });
});

describe("newBookingSchema", () => {
  it("accepts a complete booking", () => {
    expect(errors(valid())).toEqual({});
  });

  it("needs a time for the chosen mode and someone to book for", () => {
    expect(errors(valid({ slotStart: null, customerId: null }))).toEqual({
      slotStart: "Pick a time",
      customerId: "Choose who this is for",
    });
    expect(errors(valid({ timeMode: "exact" }))).toEqual({ exactTime: "Enter a start time" });
  });

  it("checks a new customer with the customer form's rules", () => {
    const newCustomer = (name: string, email: string) =>
      valid({ newCustomer: true, customerId: null, customer: { name, email, phone: "" } });
    expect(errors(newCustomer(" ", "nope"))).toEqual({
      "customer.name": "Enter a name",
      "customer.email": "Enter a valid email",
    });
    expect(errors(newCustomer("Alex", " alex@example.com "))).toEqual({});
  });

  it("checks a new customer's phone like the backend (optional, but well-formed)", () => {
    const withPhone = (phone: string) =>
      valid({ newCustomer: true, customerId: null, customer: { name: "Alex", email: "", phone } });
    expect(errors(withPhone("call me"))).toEqual({ "customer.phone": "Enter a valid phone number" });
    expect(errors(withPhone("087"))).toEqual({ "customer.phone": "Enter a valid phone number" });
    expect(errors(withPhone(" +353 (87) 123-4567 "))).toEqual({});
    expect(errors(withPhone("  "))).toEqual({});
  });
});

describe("payment defaults", () => {
  it("is priced unless free or zero everywhere", () => {
    expect(isPricedService(undefined)).toBe(false);
    expect(isPricedService(service())).toBe(true);
    expect(isPricedService(service({ paymentMode: "free" }))).toBe(false);
    expect(isPricedService(service({ priceCents: 0 }))).toBe(false);
    expect(
      isPricedService(service({ priceCents: 0, options: [{ priceCents: 1000 }] as Service["options"] })),
    ).toBe(true);
    expect(defaultPaymentMode(service())).toBe("at_venue");
    expect(defaultPaymentMode(service({ priceCents: 0 }))).toBe("none");
  });
});

describe("questionsFor", () => {
  it("keeps active general and service questions", () => {
    const q = (id: string, serviceId: string | null, isActive = true) =>
      ({ id, serviceId, isActive }) as FormQuestion;
    expect(
      questionsFor([q("a", null), q("b", "s1"), q("c", "s2"), q("d", null, false)], "s1").map((x) => x.id),
    ).toEqual(["a", "b"]);
  });
});

describe("answerErrors", () => {
  const q = (patch: Partial<FormQuestion>) =>
    ({ serviceId: null, isActive: true, options: [], required: true, ...patch }) as FormQuestion;
  const questions = [
    q({ id: "age", kind: "number" }),
    q({ id: "email", kind: "email" }),
    q({ id: "visit", kind: "select", options: ["Yes", "No"] }),
    q({ id: "ok", kind: "checkbox" }),
    q({ id: "other", kind: "number", serviceId: "s2" }),
  ];

  it("leaves unanswered questions alone, even required ones (optional for staff)", () => {
    expect(answerErrors({ answers: { ok: "false", age: "  " } }, "s1", questions)).toEqual({});
  });

  it("rejects answers the server would, like the public form", () => {
    expect(
      answerErrors(
        { answers: { age: "ten", email: "nope", visit: "Maybe", ok: "true", other: "x" } },
        "s1",
        questions,
      ),
    ).toEqual({
      age: "Enter a number",
      email: "Enter a valid email address",
      visit: "Choose one of the options",
    });
    expect(
      answerErrors({ answers: { age: " 42 ", email: "a@b.ie", visit: "Yes" } }, "s1", questions),
    ).toEqual({});
  });
});

describe("buildStaffBooking", () => {
  const question = (id: string, serviceId: string | null) =>
    ({ id, serviceId, isActive: true }) as FormQuestion;
  const questions = [question("q1", null), question("q2", "s1"), question("q3", "s1"), question("qB", "s2")];
  const ctx = { timeZone: TZ, bookAnyCalendar: true, questions };

  it("books the chosen free time with its resources and drops blank answers", () => {
    expect(
      buildStaffBooking(
        valid({ answers: { q1: " yes ", q2: "  ", q3: undefined }, internalNotes: "  ", addonIds: ["a1"] }),
        service(),
        ctx,
      ),
    ).toEqual({
      serviceId: "s1",
      optionId: null,
      addonIds: ["a1"],
      groupId: null,
      resourceIds: ["r1"],
      start: "2026-10-02T09:00:00.000Z",
      customerId: "c1",
      customer: null,
      answers: { q1: " yes " },
      internalNotes: null,
      paymentMode: "at_venue",
      notifyCustomer: true,
    });
  });

  it("sends only the chosen service's answers, not those typed for a service picked before", () => {
    const input = buildStaffBooking(
      valid({ answers: { q1: "yes", q2: "left knee", qB: "blue" } }),
      service(),
      ctx,
    );
    expect(input.answers).toEqual({ q1: "yes", q2: "left knee" });
  });

  it("books an exact time in the business timezone with the chosen resource", () => {
    const input = buildStaffBooking(
      valid({ timeMode: "exact", date: "2026-10-02", exactTime: "09:30", withResource: "r2" }),
      service(),
      ctx,
    );
    expect(input.start).toBe("2026-10-02T09:30:00+01:00");
    expect(input.resourceIds).toEqual(["r2"]);
    expect(
      buildStaffBooking(valid({ timeMode: "exact", exactTime: "09:30" }), service(), ctx).resourceIds,
    ).toBeNull();
  });

  it("leaves the calendar to the server at an exact time when the chosen one can't do the service", () => {
    // A click on the "Room 1" column prefills it; a therapist-only service can't use it ("With" shows "Any").
    const input = buildStaffBooking(
      valid({ timeMode: "exact", date: "2026-10-02", exactTime: "09:30", withResource: "room1" }),
      service(),
      ctx,
    );
    expect(input.resourceIds).toBeNull();
  });

  it("lets the server pick the calendar for staff", () => {
    expect(buildStaffBooking(valid(), service(), { ...ctx, bookAnyCalendar: false }).resourceIds).toBeNull();
  });

  it("sends a new customer's trimmed details", () => {
    const input = buildStaffBooking(
      valid({
        newCustomer: true,
        customerId: "c1",
        customer: { name: " Alex ", email: " ", phone: " 087 " },
      }),
      service(),
      ctx,
    );
    expect(input.customerId).toBeNull();
    expect(input.customer).toEqual({ name: "Alex", email: null, phone: "087" });
  });
});

describe("createBookingFailure", () => {
  it("recognises the cases the sheet handles in place", () => {
    expect(createBookingFailure(new ApiError(409, "SLOT_UNAVAILABLE", "Taken"), "appointments")).toEqual({
      kind: "slot_taken",
    });
    expect(
      createBookingFailure(new ApiError(402, "PLAN_LIMIT_REACHED", "Limit reached."), "appointments"),
    ).toEqual({
      kind: "plan_limit",
      message: "Limit reached. Upgrade in Settings → Billing to keep taking appointments.",
    });
    expect(createBookingFailure(new ApiError(400, "PAYMENTS_NOT_CONFIGURED", "No"), "x")).toEqual({
      kind: "payments_not_configured",
    });
    expect(createBookingFailure(new ApiError(400, "INVALID_REQUEST", "Bad"), "x")).toEqual({ kind: "other" });
    expect(createBookingFailure(new Error("boom"), "x")).toEqual({ kind: "other" });
  });
});

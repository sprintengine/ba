import { describe, expect, it } from "vitest";
import {
  customerContactSchema,
  customerSchema,
  customerToValues,
  valuesToCustomerInput,
} from "./customer-schema";

const messages = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));

describe("customer schema", () => {
  it("requires a name and accepts an empty email", () => {
    expect(messages(customerContactSchema.safeParse({ name: "  ", email: "" }))).toEqual({
      name: "Enter a name",
    });
    expect(customerContactSchema.safeParse({ name: "Alex", email: "" }).success).toBe(true);
  });

  it("checks the email after trimming", () => {
    expect(messages(customerContactSchema.safeParse({ name: "Alex", email: "alex@" }))).toEqual({
      email: "Enter a valid email",
    });
    expect(customerContactSchema.parse({ name: " Alex ", email: " alex@example.com " })).toEqual({
      name: "Alex",
      email: "alex@example.com",
    });
  });

  it("follows the backend's customer rules: 120-character names and its phone pattern", () => {
    // Regression: the dashboard allowed 200-character names and any 40 characters as a phone number, so the
    // backend (CustomerDetails.from, Validator.phone) refused them only on save.
    const values = { ...customerToValues(), name: "x".repeat(120), phone: "+353 (1) 555-0100" };
    expect(customerSchema.safeParse(values).success).toBe(true);
    const tooLong = customerSchema.safeParse({ ...values, name: "x".repeat(121), phone: "call me maybe" });
    expect(Object.keys(messages(tooLong)).sort()).toEqual(["name", "phone"]);
    expect(customerSchema.safeParse({ ...values, phone: "" }).success).toBe(true);
  });

  it("round-trips a customer to form values and back", () => {
    const values = customerToValues({ name: "Alex", email: null, phone: "087", groupId: null, notes: null });
    expect(values).toEqual({ name: "Alex", email: "", phone: "087", groupId: "none", notes: "" });
    expect(valuesToCustomerInput({ ...values, notes: "  " })).toEqual({
      name: "Alex",
      email: null,
      phone: "087",
      groupId: null,
      notes: null,
    });
  });
});

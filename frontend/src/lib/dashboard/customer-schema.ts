/** The customer form's rules, shared by the customer pages and the new-booking sheet's "new customer" fields. */
import * as z from "zod";
import type { Customer, CustomerInput } from "@/lib/api/types";
import { CUSTOMER_LIMITS, PHONE_PATTERN } from "@/lib/validation/limits";

/** A name is required (after trimming), up to the backend's limit. */
const customerNameSchema = z.string().trim().min(1, "Enter a name").max(CUSTOMER_LIMITS.name);

/** Optional: empty, or a valid address (surrounding spaces are ignored). */
const customerEmailSchema = z
  .string()
  .trim()
  .pipe(z.union([z.literal(""), z.email("Enter a valid email")]));

/** Who the customer is: what the new-booking sheet checks for a new customer. */
export const customerContactSchema = z.object({ name: customerNameSchema, email: customerEmailSchema });

export const customerSchema = customerContactSchema.extend({
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || PHONE_PATTERN.test(v), "Enter a valid phone number"),
  groupId: z.string(),
  notes: z.string().max(CUSTOMER_LIMITS.notes),
});
export type CustomerFormValues = z.infer<typeof customerSchema>;

export function customerToValues(
  c?: Pick<Customer, "name" | "email" | "phone" | "groupId" | "notes"> | null,
): CustomerFormValues {
  return {
    name: c?.name ?? "",
    email: c?.email ?? "",
    phone: c?.phone ?? "",
    groupId: c?.groupId ?? "none",
    notes: c?.notes ?? "",
  };
}

export function valuesToCustomerInput(v: CustomerFormValues): CustomerInput {
  return {
    name: v.name.trim(),
    email: v.email.trim() || null,
    phone: v.phone.trim() || null,
    groupId: v.groupId === "none" ? null : v.groupId,
    notes: v.notes.trim() || null,
  };
}

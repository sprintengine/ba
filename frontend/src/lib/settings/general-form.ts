/**
 * Settings → General: the zod schema and Business ↔ form values ↔ UpdateBusiness. Kept free of React so it
 * can be unit-tested.
 */
import * as z from "zod";
import type { Business, UpdateBusiness } from "@/lib/api/types";
import { isReservedSlug } from "@/lib/reserved-slugs";
import { SLUG_MAX_LENGTH } from "@/lib/slug";
import { BUSINESS_LIMITS, PHONE_PATTERN } from "@/lib/validation/limits";
import { optionalHttpUrl } from "@/lib/validation/url";

/** Lowercase words joined by single hyphens (the length is checked separately). */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const optionalEmail = z.union([z.literal(""), z.email("Enter a valid email")]);
const optionalUrl = optionalHttpUrl("Enter a full address, e.g. https://example.com");

export const generalSettingsSchema = z.object({
  name: z.string().trim().min(1, "Enter your business name").max(BUSINESS_LIMITS.name),
  slug: z
    .string()
    .trim()
    .min(3, "At least 3 characters")
    .max(SLUG_MAX_LENGTH)
    .regex(SLUG_PATTERN, "Lowercase letters, numbers and single hyphens only")
    .refine((s) => !isReservedSlug(s), "That address is reserved"),
  description: z.string().max(BUSINESS_LIMITS.description),
  timezone: z.string().min(1),
  currency: z.string().length(3),
  locale: z.string().min(2),
  contactEmail: optionalEmail,
  contactPhone: z
    .string()
    .refine((p) => !p.trim() || PHONE_PATTERN.test(p.trim()), "Enter a valid phone number"),
  websiteUrl: optionalUrl,
  line1: z.string().max(200),
  line2: z.string().max(200),
  city: z.string().max(100),
  postcode: z.string().max(20),
  published: z.boolean(),
});

export type GeneralSettingsValues = z.infer<typeof generalSettingsSchema>;

export const businessToGeneralValues = (b: Business): GeneralSettingsValues => ({
  name: b.name,
  slug: b.slug,
  description: b.description ?? "",
  timezone: b.timezone,
  currency: b.currency,
  locale: b.locale,
  contactEmail: b.contactEmail ?? "",
  contactPhone: b.contactPhone ?? "",
  websiteUrl: b.websiteUrl ?? "",
  line1: b.address.line1 ?? "",
  line2: b.address.line2 ?? "",
  city: b.address.city ?? "",
  postcode: b.address.postcode ?? "",
  published: b.status === "active",
});

const blankToNull = (s: string) => (s.trim() ? s.trim() : null);

export function generalValuesToUpdate(v: GeneralSettingsValues): UpdateBusiness {
  return {
    name: v.name.trim(),
    slug: v.slug.trim(),
    description: blankToNull(v.description),
    timezone: v.timezone,
    currency: v.currency,
    locale: v.locale,
    contactEmail: blankToNull(v.contactEmail),
    contactPhone: blankToNull(v.contactPhone),
    websiteUrl: blankToNull(v.websiteUrl),
    address: {
      line1: blankToNull(v.line1),
      line2: blankToNull(v.line2),
      city: blankToNull(v.city),
      postcode: blankToNull(v.postcode),
    },
    status: v.published ? "active" : "draft",
  };
}

/**
 * What deleting the business does, for the danger-zone card. Keep it true to the backend: the business is suspended,
 * not erased, with no way to restore it from the dashboard; its customers keep their manage links (view and cancel
 * only, no reminders); and it can't be deleted while a paid plan is still billing (409 "Cancel your plan in Billing
 * first").
 */
export function deleteBusinessDescription(words: { customers: string; bookings: string }): string {
  return (
    `Your booking page goes offline and nobody can book. Your ${words.customers} can still see and cancel their ` +
    `${words.bookings}, but can't move or pay for them, and get no reminders. Your records aren't erased, but you ` +
    "can't restore the business yourself. On a paid plan? Cancel it in Billing first."
  );
}

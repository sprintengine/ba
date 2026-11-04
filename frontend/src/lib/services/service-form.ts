/**
 * Service editor model: zod schema for the form, and conversions between the
 * API `Service` / `ServiceInput` and form values. Kept free of React so it can
 * be unit-tested.
 */
import * as z from "zod";
import type { PaymentMode, Service, ServiceInput } from "@/lib/api/types";
import { HEX_COLOR } from "@/lib/theme/color";
import { SERVICE_LIMITS as L, type Range } from "@/lib/validation/limits";
import { depositProblem } from "@/lib/validation/services";

const minutes = (label: string, { min, max }: Range) =>
  z
    .number({ error: `Enter ${label}` })
    .int("Whole minutes only")
    .min(min, min === 0 ? "Can't be negative" : `At least ${min} minutes`)
    .max(max, `At most ${max} minutes`);

const price = () =>
  z
    .number({ error: "Enter a price" })
    .int()
    .min(L.priceCents.min, "Can't be negative")
    .max(L.priceCents.max, "That price is too high");

// `id` is kept for existing items so the backend updates them in place (bookings stay linked).
const optionSchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .trim()
    .min(1, "Name this option")
    .max(L.optionName, `Keep it under ${L.optionName} characters`),
  description: z.string(),
  durationMinutes: minutes("a duration", L.optionDurationMinutes),
  priceCents: price(),
});

const addonSchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .trim()
    .min(1, "Name this add-on")
    .max(L.addonName, `Keep it under ${L.addonName} characters`),
  description: z.string(),
  extraMinutes: minutes("extra minutes", L.addonExtraMinutes),
  priceCents: price(),
});

const requirementSchema = z.object({
  id: z.string().optional(),
  label: z
    .string()
    .trim()
    .min(1, "Name this requirement, e.g. “Therapist”")
    .max(L.requirementLabel, `Keep it under ${L.requirementLabel} characters`),
  quantity: z
    .number({ error: "Enter a number" })
    .int()
    .min(L.requirementQuantity.min, `At least ${L.requirementQuantity.min}`)
    .max(L.requirementQuantity.max, `At most ${L.requirementQuantity.max}`),
  customerSelectable: z.boolean(),
  resourceIds: z.array(z.string()).min(1, "Pick at least one"),
});

/**
 * The dashboard's payment-mode wording. It differs from the onboarding copy (`PAYMENT_MODE_COPY` in
 * lib/catalog/services.ts): which wording to keep is a product decision.
 */
export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  full: "Pay in full online",
  deposit: "Deposit online",
  at_venue: "Pay at venue",
  free: "Free",
};
export const PAYMENT_MODE_SHORT: Record<PaymentMode, string> = {
  full: "Prepaid",
  deposit: "Deposit",
  at_venue: "At venue",
  free: "Free",
};

export const serviceFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give the service a name")
      .max(L.name, `Keep it under ${L.name} characters`),
    description: z.string().max(L.description, `Keep it under ${L.description} characters`),
    category: z.string().max(L.category, `Keep it under ${L.category} characters`),
    color: z.string().regex(HEX_COLOR, "Use a hex colour like #0e7c70"),
    durationMinutes: minutes("a duration", L.durationMinutes),
    bufferBeforeMinutes: minutes("a buffer", L.bufferMinutes),
    bufferAfterMinutes: minutes("a buffer", L.bufferMinutes),
    slotIntervalMinutes: minutes("an interval", L.slotIntervalMinutes).nullable(),
    minNoticeMinutes: z
      .number()
      .int()
      .min(L.minNoticeMinutes.min, "Can't be negative")
      .max(L.minNoticeMinutes.max)
      .nullable(),
    maxAdvanceDays: z
      .number()
      .int()
      .min(L.maxAdvanceDays.min, "At least 1 day")
      .max(L.maxAdvanceDays.max, "At most 2 years")
      .nullable(),
    capacity: z
      .number({ error: "Enter a capacity" })
      .int()
      .min(L.capacity.min, `At least ${L.capacity.min}`)
      .max(L.capacity.max, `At most ${L.capacity.max}`),
    priceCents: price(),
    paymentMode: z.enum(["full", "deposit", "at_venue", "free"]),
    depositCents: z.number().int().min(0).nullable(),
    allowPayAtVenue: z.boolean(),
    requiresApproval: z.boolean(),
    locationType: z.enum(["business", "customer", "online"]),
    allowedGroupIds: z.array(z.string()),
    isPublic: z.boolean(),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
    options: z.array(optionSchema).max(L.options),
    addons: z.array(addonSchema).max(L.addons),
    requirements: z.array(requirementSchema).max(L.requirements),
  })
  .superRefine((v, ctx) => {
    const paid = v.paymentMode === "full" || v.paymentMode === "deposit";
    const maxPrice = Math.max(v.priceCents, ...v.options.map((o) => o.priceCents));
    if (paid && maxPrice === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["priceCents"],
        message: "Set a price to take payment online, or choose “Free” or “Pay at venue”",
      });
    }
    // Only in deposit mode: other modes drop the deposit when saving (and zod refuses a negative one above).
    const deposit = v.paymentMode === "deposit" ? depositProblem(v) : null;
    if (deposit) ctx.addIssue({ code: "custom", path: ["depositCents"], message: deposit });
    if (v.slotIntervalMinutes !== null && v.slotIntervalMinutes % 5 !== 0) {
      ctx.addIssue({ code: "custom", path: ["slotIntervalMinutes"], message: "Use a multiple of 5 minutes" });
    }
    const selectable = v.requirements.filter((r) => r.customerSelectable).length;
    if (selectable > 1) {
      v.requirements.forEach((r, i) => {
        if (r.customerSelectable) {
          ctx.addIssue({
            code: "custom",
            path: ["requirements", i, "customerSelectable"],
            message: "Only one requirement can be chosen by the customer",
          });
        }
      });
    }
    v.requirements.forEach((r, i) => {
      if (r.resourceIds.length > 0 && r.quantity > r.resourceIds.length) {
        ctx.addIssue({
          code: "custom",
          path: ["requirements", i, "quantity"],
          message: `Needs ${r.quantity} but only ${r.resourceIds.length} can do it`,
        });
      }
    });
    const names = new Set<string>();
    v.options.forEach((o, i) => {
      const key = o.name.trim().toLowerCase();
      if (key && names.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["options", i, "name"],
          message: "Option names must be unique",
        });
      }
      names.add(key);
    });
  });

export type ServiceFormValues = z.infer<typeof serviceFormSchema>;

export const SERVICE_COLORS = [
  "#0e7c70",
  "#2a78d6",
  "#6d5bd0",
  "#c2417a",
  "#d9622b",
  "#b7791f",
  "#3f8f3a",
  "#5b6472",
] as const;

export function emptyServiceValues(sortOrder = 0, color: string = SERVICE_COLORS[0]): ServiceFormValues {
  return {
    name: "",
    description: "",
    category: "",
    color,
    durationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    slotIntervalMinutes: null,
    minNoticeMinutes: null,
    maxAdvanceDays: null,
    capacity: 1,
    priceCents: 0,
    paymentMode: "at_venue",
    depositCents: null,
    allowPayAtVenue: false,
    requiresApproval: false,
    locationType: "business",
    allowedGroupIds: [],
    isPublic: true,
    isActive: true,
    sortOrder,
    options: [],
    addons: [],
    requirements: [],
  };
}

export function serviceToFormValues(s: Service): ServiceFormValues {
  const bySort = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;
  return {
    name: s.name,
    description: s.description ?? "",
    category: s.category ?? "",
    color: HEX_COLOR.test(s.color) ? s.color : SERVICE_COLORS[0],
    durationMinutes: s.durationMinutes,
    bufferBeforeMinutes: s.bufferBeforeMinutes,
    bufferAfterMinutes: s.bufferAfterMinutes,
    slotIntervalMinutes: s.slotIntervalMinutes,
    minNoticeMinutes: s.minNoticeMinutes,
    maxAdvanceDays: s.maxAdvanceDays,
    capacity: s.capacity,
    priceCents: s.priceCents,
    paymentMode: s.paymentMode,
    depositCents: s.depositCents,
    allowPayAtVenue: s.allowPayAtVenue,
    requiresApproval: s.requiresApproval,
    locationType: s.locationType,
    allowedGroupIds: [...s.allowedGroupIds],
    isPublic: s.isPublic,
    isActive: s.isActive,
    sortOrder: s.sortOrder,
    options: [...s.options].sort(bySort).map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description ?? "",
      durationMinutes: o.durationMinutes,
      priceCents: o.priceCents,
    })),
    addons: [...s.addons].sort(bySort).map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description ?? "",
      extraMinutes: a.extraMinutes,
      priceCents: a.priceCents,
    })),
    requirements: [...s.requirements].sort(bySort).map((r) => ({
      id: r.id,
      label: r.label,
      quantity: r.quantity,
      customerSelectable: r.customerSelectable,
      resourceIds: [...r.resourceIds],
    })),
  };
}

const blankToNull = (s: string) => (s.trim() ? s.trim() : null);

export function formValuesToServiceInput(v: ServiceFormValues): ServiceInput {
  return {
    name: v.name.trim(),
    description: blankToNull(v.description),
    category: blankToNull(v.category),
    color: v.color.toLowerCase(),
    durationMinutes: v.durationMinutes,
    bufferBeforeMinutes: v.bufferBeforeMinutes,
    bufferAfterMinutes: v.bufferAfterMinutes,
    slotIntervalMinutes: v.slotIntervalMinutes,
    minNoticeMinutes: v.minNoticeMinutes,
    maxAdvanceDays: v.maxAdvanceDays,
    capacity: v.capacity,
    priceCents: v.paymentMode === "free" ? 0 : v.priceCents,
    paymentMode: v.paymentMode,
    depositCents: v.paymentMode === "deposit" ? v.depositCents : null,
    allowPayAtVenue: (v.paymentMode === "full" || v.paymentMode === "deposit") && v.allowPayAtVenue,
    requiresApproval: v.requiresApproval,
    locationType: v.locationType,
    allowedGroupIds: v.allowedGroupIds,
    isPublic: v.isPublic,
    isActive: v.isActive,
    sortOrder: v.sortOrder,
    options: v.options.map((o, i) => ({
      ...(o.id ? { id: o.id } : {}),
      name: o.name.trim(),
      description: blankToNull(o.description),
      durationMinutes: o.durationMinutes,
      priceCents: v.paymentMode === "free" ? 0 : o.priceCents,
      sortOrder: i,
    })),
    addons: v.addons.map((a, i) => ({
      ...(a.id ? { id: a.id } : {}),
      name: a.name.trim(),
      description: blankToNull(a.description),
      extraMinutes: a.extraMinutes,
      priceCents: a.priceCents,
      sortOrder: i,
    })),
    requirements: v.requirements.map((r, i) => ({
      ...(r.id ? { id: r.id } : {}),
      label: r.label.trim(),
      quantity: r.quantity,
      customerSelectable: r.customerSelectable,
      resourceIds: r.resourceIds,
      sortOrder: i,
    })),
  };
}

/** Full `ServiceInput` from an existing service with a patch — for list toggles (PUT replaces). */
export function serviceWith(s: Service, patch: Partial<ServiceInput>): ServiceInput {
  return { ...formValuesToServiceInput(serviceToFormValues(s)), color: s.color, ...patch };
}

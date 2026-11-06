/**
 * The staff "New booking" form: its schema and defaults, the `CreateStaffBooking` payload built from it, and what
 * to do when creating fails. Pure.
 */
import * as z from "zod";
import type { CreateStaffBooking, FormQuestion, Service, SlotOffer } from "@/lib/api/types";
import { isApiError } from "@/lib/api/client";
import { answerIssues, isAnswered } from "@/lib/booking/details-schema";
import { isSlotUnavailable } from "@/lib/booking/errors";
import { zonedToIso, type PlainDate } from "@/lib/format/datetime";
import { PHONE_PATTERN } from "@/lib/validation/limits";
import { customerContactSchema } from "./customer-schema";

export type NewBookingPrefill = {
  date?: string;
  /** "HH:mm" in the business timezone. */
  time?: string;
  resourceId?: string;
  serviceId?: string;
  customer?: { id: string; name: string; email?: string | null; phone?: string | null };
};

export const newBookingSchema = z
  .object({
    serviceId: z.string().min(1, "Choose a service"),
    optionId: z.string().nullable(),
    addonIds: z.array(z.string()),
    withResource: z.string(),
    date: z.string(),
    timeMode: z.enum(["slots", "exact"]),
    slotStart: z.string().nullable(),
    slotResourceIds: z.array(z.string()).nullable(),
    /** The deal on the chosen free time; the server applies it when booking. */
    slotOffer: z.custom<SlotOffer>().nullable(),
    exactTime: z.string().nullable(),
    newCustomer: z.boolean(),
    customerId: z.string().nullable(),
    customer: z.object({ name: z.string(), email: z.string(), phone: z.string() }),
    answers: z.record(z.string(), z.string().optional()),
    paymentMode: z.enum(["collect_online", "at_venue", "none"]),
    notifyCustomer: z.boolean(),
    internalNotes: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.timeMode === "slots" && !v.slotStart)
      ctx.addIssue({ code: "custom", path: ["slotStart"], message: "Pick a time" });
    if (v.timeMode === "exact" && !v.exactTime)
      ctx.addIssue({ code: "custom", path: ["exactTime"], message: "Enter a start time" });
    if (v.newCustomer) {
      // The same rules as the customer form.
      const contact = customerContactSchema.safeParse(v.customer);
      for (const issue of contact.error?.issues ?? []) {
        ctx.addIssue({ code: "custom", path: ["customer", ...issue.path], message: issue.message });
      }
      // Optional for staff bookings, but the backend rejects a malformed one (`Validator.phone`).
      const phone = v.customer.phone.trim();
      if (phone && !PHONE_PATTERN.test(phone))
        ctx.addIssue({ code: "custom", path: ["customer", "phone"], message: "Enter a valid phone number" });
    } else if (!v.customerId) {
      ctx.addIssue({ code: "custom", path: ["customerId"], message: "Choose who this is for" });
    }
  });

export type NewBookingValues = z.infer<typeof newBookingSchema>;

/** Starting values: the prefill (a date in the past becomes today; a time means "exact time"). */
export function newBookingDefaults(prefill: NewBookingPrefill, today: PlainDate): NewBookingValues {
  return {
    serviceId: prefill.serviceId ?? "",
    optionId: null,
    addonIds: [],
    withResource: prefill.resourceId ?? "any",
    date: prefill.date && prefill.date >= today ? prefill.date : today,
    timeMode: prefill.time ? "exact" : "slots",
    slotStart: null,
    slotResourceIds: null,
    slotOffer: null,
    exactTime: prefill.time ?? null,
    newCustomer: false,
    customerId: prefill.customer?.id ?? null,
    customer: { name: "", email: "", phone: "" },
    answers: {},
    paymentMode: "at_venue",
    notifyCustomer: true,
    internalNotes: "",
  };
}

/**
 * Whether a service costs anything (so there is something to pay online or at the venue): not a "free" service, and
 * its price or any option's price is above zero. (Unlike lib/booking `priceRange`, the service's own price counts even
 * when it has options.)
 */
export function isPricedService(service: Service | undefined): boolean {
  return (
    !!service &&
    service.paymentMode !== "free" &&
    (service.priceCents > 0 || service.options.some((o) => o.priceCents > 0))
  );
}

/** The payment choice preselected for a service: "Free" when it is free, else "At venue". */
export function defaultPaymentMode(service: Service | undefined): NewBookingValues["paymentMode"] {
  return isPricedService(service) ? "at_venue" : "none";
}

/** The service's active questions (general ones and its own). */
export function questionsFor(questions: readonly FormQuestion[], serviceId: string): FormQuestion[] {
  return questions.filter((q) => q.isActive && (q.serviceId === null || q.serviceId === serviceId));
}

/**
 * What is wrong with the answers given to [service]'s questions, by question id. Every question is optional for
 * staff, but an answer that is given must be one the server accepts (a number, an email, one of the choices, not too
 * long): the same checks as the public booking form.
 */
export function answerErrors(
  values: Pick<NewBookingValues, "answers">,
  serviceId: string,
  questions: readonly FormQuestion[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of questionsFor(questions, serviceId)) {
    const raw = values.answers[q.id];
    if (!isAnswered(q, raw)) continue;
    const [issue] = answerIssues(q, (raw ?? "").trim());
    if (issue) errors[q.id] = issue;
  }
  return errors;
}

/**
 * The create request for valid form values. Staff (who can't book any calendar) leave the resources to the server:
 * it always books their own linked calendar and rejects others. Only the service's own questions are answered:
 * answers typed for a service chosen before stay in the form, and the server rejects them as unknown.
 */
export function buildStaffBooking(
  values: NewBookingValues,
  service: Service,
  ctx: { timeZone: string; bookAnyCalendar: boolean; questions: readonly FormQuestion[] },
): CreateStaffBooking {
  const slots = values.timeMode === "slots";
  const asked = new Set(questionsFor(ctx.questions, service.id).map((q) => q.id));
  return {
    serviceId: service.id,
    optionId: values.optionId,
    addonIds: values.addonIds,
    groupId: null,
    resourceIds: ctx.bookAnyCalendar ? chosenResources(values, service) : null,
    start: slots ? (values.slotStart ?? "") : zonedToIso(values.date, values.exactTime ?? "", ctx.timeZone),
    customerId: values.newCustomer ? null : values.customerId,
    customer: values.newCustomer
      ? {
          name: values.customer.name.trim(),
          email: values.customer.email.trim() || null,
          phone: values.customer.phone.trim() || null,
        }
      : null,
    answers: Object.fromEntries(
      Object.entries(values.answers).filter(
        (e): e is [string, string] => asked.has(e[0]) && typeof e[1] === "string" && e[1].trim() !== "",
      ),
    ),
    internalNotes: values.internalNotes.trim() || null,
    paymentMode: values.paymentMode,
    notifyCustomer: values.notifyCustomer,
  };
}

/**
 * The resources to pin: a free time's, or at an exact time the "With" choice when the service can use it. A
 * calendar column prefills "With" whatever the service; one it can't use shows as "Any" and the server would
 * reject it.
 */
function chosenResources(values: NewBookingValues, service: Service): string[] | null {
  if (values.timeMode === "slots") return values.slotResourceIds;
  const usable = service.requirements.some((r) => r.resourceIds.includes(values.withResource));
  return values.withResource !== "any" && usable ? [values.withResource] : null;
}

/** How the sheet answers a failed create; anything else maps field errors and shows the server's message. */
export type CreateBookingFailure =
  | { kind: "slot_taken" }
  | { kind: "plan_limit"; message: string }
  | { kind: "payments_not_configured" }
  | { kind: "other" };

export function createBookingFailure(err: unknown, bookingsNoun: string): CreateBookingFailure {
  if (isSlotUnavailable(err)) return { kind: "slot_taken" };
  if (!isApiError(err)) return { kind: "other" };
  if (err.code === "PLAN_LIMIT_REACHED") {
    return {
      kind: "plan_limit",
      message: `${err.message} Upgrade in Settings → Billing to keep taking ${bookingsNoun}.`,
    };
  }
  if (err.code === "PAYMENTS_NOT_CONFIGURED") return { kind: "payments_not_configured" };
  return { kind: "other" };
}

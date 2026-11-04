/** Settings → Policies: the zod schema and the plain-language cancellation summary. */
import * as z from "zod";
import type { Policies } from "@/lib/api/types";
import { POLICY_LIMITS as L } from "@/lib/validation/limits";

export const policiesSchema = z.object({
  minNoticeMinutes: z.number().int().min(L.minNoticeMinutes.min).max(L.minNoticeMinutes.max),
  maxAdvanceDays: z
    .number({ error: "Enter a number of days" })
    .int()
    .min(L.maxAdvanceDays.min, "At least 1 day")
    .max(L.maxAdvanceDays.max, "At most 2 years"),
  cancellationNoticeHours: z
    .number({ error: "Enter a number of hours" })
    .int()
    .min(L.cancellationNoticeHours.min)
    .max(L.cancellationNoticeHours.max),
  lateCancellationRefundPercent: z
    .number()
    .int()
    .min(L.lateCancellationRefundPercent.min)
    .max(L.lateCancellationRefundPercent.max),
  allowCustomerCancel: z.boolean(),
  allowCustomerReschedule: z.boolean(),
  holdMinutes: z
    .number({ error: "Enter minutes" })
    .int()
    .min(L.holdMinutes.min, "At least 5 minutes")
    .max(L.holdMinutes.max),
  requireCustomerPhone: z.boolean(),
  nextAvailableOnly: z.boolean(),
});

/** One-line summary of the cancellation policy in plain language. */
export function policySummary(
  p: Pick<Policies, "allowCustomerCancel" | "cancellationNoticeHours" | "lateCancellationRefundPercent">,
  customers: string,
): string {
  if (!p.allowCustomerCancel) return `${customers} can't cancel online — they need to contact you.`;
  const late =
    p.lateCancellationRefundPercent === 0
      ? "no refund"
      : p.lateCancellationRefundPercent === 100
        ? "a full refund"
        : `${p.lateCancellationRefundPercent}% back`;
  if (p.cancellationNoticeHours === 0)
    return `${customers} can cancel any time before the start for a full refund.`;
  return `${customers} get a full refund if they cancel at least ${p.cancellationNoticeHours} hours before. Later than that, they get ${late}.`;
}

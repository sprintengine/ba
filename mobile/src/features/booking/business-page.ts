/** What a business's page says about its policies. Pure (tested in business-page.test.ts). */
import type { PaymentMode, PublicBusiness, PublicService } from "@shared/api/types";
import { cancellationSummary } from "@shared/booking/copy";
import { formatDuration } from "@shared/format";

/** The payment mode that decides the cancellation wording: paid when any service takes money online. */
export function strictestMode(services: Pick<PublicService, "paymentMode" | "priceCents">[]): PaymentMode {
  if (services.some((s) => (s.paymentMode === "full" || s.paymentMode === "deposit") && s.priceCents > 0))
    return "full";
  return services.some((s) => s.paymentMode === "at_venue" && s.priceCents > 0) ? "at_venue" : "free";
}

/** "Book at least 2 h ahead", "Up to 60 days ahead", the cancellation policy, rescheduling and approval. */
export function policyLines(business: PublicBusiness, services: PublicService[]): string[] {
  const p = business.policies;
  const lines: string[] = [];
  lines.push(cancellationSummary(p, strictestMode(services), business.name));
  lines.push(
    p.allowCustomerReschedule
      ? "You can move your booking online."
      : `To move a booking, contact ${business.name}.`,
  );
  if (p.minNoticeMinutes > 0) lines.push(`Book at least ${formatDuration(p.minNoticeMinutes)} ahead.`);
  lines.push(`Book up to ${p.maxAdvanceDays} days ahead.`);
  if (p.nextAvailableOnly) lines.push("You're offered the next available time, one at a time.");
  if (services.some((s) => s.requiresApproval))
    lines.push(`Some services are requests: ${business.name} confirms each one.`);
  return lines;
}

/** Website link as shown ("lumen-physio.test"), or null. */
export function websiteHost(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "") || null;
}

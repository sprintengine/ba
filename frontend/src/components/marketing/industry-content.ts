import { INDUSTRIES, type IndustrySlug } from "@/components/shells/industries";
import type { PaymentMode } from "@/lib/api/types";
import { quoteFor } from "@/lib/booking/quote";
import { CAR_WASH } from "./industries/car-wash";
import { GP_PRACTICE } from "./industries/gp-practice";
import { MUSIC_LESSONS } from "./industries/music-lessons";
import { PHYSIO } from "./industries/physio";
import type { ExampleService, IndustryContent } from "./industries/types";

/**
 * Marketing copy and example setups for `/for/[industry]` and the landing page, one file per industry in
 * `industries/` (types in `industries/types.ts`).
 * Service names, durations and prices mirror the backend templates
 * (`backend/…/templates/*Template.kt`) so what we show is what the template creates.
 * Business and people names are fictional.
 */

export const INDUSTRY_CONTENT: Record<IndustrySlug, IndustryContent> = {
  physio: PHYSIO,
  "car-wash": CAR_WASH,
  "music-lessons": MUSIC_LESSONS,
  "gp-practice": GP_PRACTICE,
};

export function industryContent(slug: string): IndustryContent | null {
  return (INDUSTRY_CONTENT as Record<string, IndustryContent | undefined>)[slug] ?? null;
}

/** Ordered like INDUSTRIES (nav, footer). */
export const INDUSTRY_LIST: IndustryContent[] = INDUSTRIES.map((i) => INDUSTRY_CONTENT[i.slug]);

/** Signup link that lands in onboarding with the template preselected. */
export function templateSignUpHref(templateKey: string): string {
  return `/sign-up?redirect_url=${encodeURIComponent(`/onboarding?template=${templateKey}`)}`;
}

/**
 * The quote for a marketing example, with the option and add-ons chosen by position. The rules are the booking flow's
 * (`lib/booking/quote`), so the demos show what the real flow would charge.
 */
export function quoteService(
  service: ExampleService,
  optionIndex: number | null = null,
  addonIndexes: number[] = [],
): { durationMinutes: number; priceCents: number; dueNowCents: number } {
  const option = optionIndex === null ? null : (service.options?.[optionIndex] ?? null);
  const addons = addonIndexes.flatMap((i) => {
    const addon = service.addons?.[i];
    return addon ? [addon] : [];
  });
  const q = quoteFor(service, option, addons);
  return { durationMinutes: q.durationMinutes, priceCents: q.totalCents, dueNowCents: q.dueNowCents };
}

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  full: "Paid online",
  deposit: "Deposit online",
  at_venue: "Pay at venue",
  free: "No payment needed",
};

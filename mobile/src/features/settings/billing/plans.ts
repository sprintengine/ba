/**
 * What the app says about the business's plan (read-only: see BillingSettings for why). Names, statuses and what each
 * plan includes, from `GET /billing` or, when it sends no price list, the website's fallback list
 * (billing-settings.tsx FALLBACK_PRICES), without prices.
 */
import type { BillingInfo, Plan } from "@shared/api/types";
import type { Tone } from "@shared/status";

const FALLBACK: Record<Plan, { name: string; features: string[] }> = {
  free: {
    name: "Free",
    features: ["100 bookings a month", "Up to 3 team members", "“Powered by bookanything” badge"],
  },
  pro: {
    name: "Pro",
    features: ["1,000 bookings a month", "Unlimited team", "Remove the badge", "SMS reminders at cost"],
  },
  business: {
    name: "Business",
    features: ["Everything in Pro", "Priority support", "AI receptionist (soon)"],
  },
};

/** The current plan's name and what it includes. */
export function currentPlan(b: BillingInfo): { name: string; features: string[] } {
  const listed = b.prices.find((p) => p.plan === b.plan);
  const fallback = FALLBACK[b.plan] ?? { name: b.plan, features: [] };
  return {
    name: listed?.name ?? fallback.name,
    features: listed?.features?.length ? listed.features : fallback.features,
  };
}

const STATUS: Record<string, { label: string; tone: Tone; text?: string }> = {
  active: { label: "Active", tone: "success" },
  trialing: { label: "Trial", tone: "info", text: "You're on a free trial of this plan." },
  past_due: {
    label: "Past due",
    tone: "warning",
    text: "The latest payment for this plan didn't go through.",
  },
  unpaid: { label: "Unpaid", tone: "warning", text: "The latest payment for this plan didn't go through." },
  canceled: { label: "Canceled", tone: "danger", text: "This subscription has been canceled." },
};

/** The subscription's status as a badge (and a sentence for anything but active); unknown ones are humanised. */
export function planStatus(status: string): { label: string; tone: Tone; text?: string } {
  const known = STATUS[status];
  if (known) return known;
  const words = status.replace(/_/g, " ").trim();
  return { label: words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unknown", tone: "neutral" };
}

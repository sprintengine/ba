/**
 * The plans on the pricing page: you pay for bookings, not people. Each plan is per business, with unlimited staff and
 * unlimited appointment types, Free included. Built-in AI is a paid add-on sold as monthly credits; connecting the
 * owner's own assistant is on every plan.
 */
export type PlanKey = "free" | "pro" | "business";

export type Plan = {
  key: PlanKey;
  name: string;
  /** Monthly price per business in euro. */
  price: number;
  tagline: string;
  /** One-line summary for compact plan cards. */
  summary: string;
  cta: { label: string; href: string };
  highlight?: boolean;
  /** The label on a highlighted card. */
  badge?: string;
  intro?: string;
  features: string[];
};

export const PLANS: Plan[] = [
  {
    key: "free",
    name: "Free",
    price: 0,
    tagline: "For solo starters, and anyone starting a business with AI.",
    summary: "100 bookings a month",
    cta: { label: "Start for free", href: "/sign-up" },
    highlight: true,
    badge: "Start here",
    features: [
      "100 bookings a month",
      "Unlimited staff",
      "Unlimited appointment types",
      "Connect your own assistant, included (our built-in one runs on paid credits)",
      "Plug booking into your own site",
      "0% platform fee on payments",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: 10,
    tagline: "For when the diary is filling up.",
    summary: "1,000 bookings a month",
    cta: { label: "Start with Pro", href: "/sign-up" },
    intro: "Everything in Free, plus",
    features: ["1,000 bookings a month", "No bookanything badge", "SMS reminders, charged at cost"],
  },
  {
    key: "business",
    name: "Business",
    price: 49,
    tagline: "For busy practices that want help setting up.",
    summary: "10,000 bookings a month",
    cta: { label: "Start with Business", href: "/sign-up" },
    intro: "Everything in Pro, plus",
    features: [
      "10,000 bookings a month",
      "Priority support",
      "Setup help from our team",
      "Early access to new features",
    ],
  },
];

/** Past the biggest plan, a conversation. */
export const TALK_TO_US = "mailto:hello@bookanything.ie";

export type ComparisonValue = boolean | string;
export type ComparisonRow = {
  label: string;
  values: [ComparisonValue, ComparisonValue, ComparisonValue];
  hint?: string;
};
export type ComparisonGroup = { title: string; rows: ComparisonRow[] };

export const PLAN_COMPARISON: ComparisonGroup[] = [
  {
    title: "Bookings",
    rows: [
      {
        label: "Bookings per month",
        values: ["100", "1,000", "10,000"],
        hint: "Above that, talk to us.",
      },
      { label: "Staff", values: ["Unlimited", "Unlimited", "Unlimited"] },
      { label: "Appointment types", values: ["Unlimited", "Unlimited", "Unlimited"] },
      { label: "Choose which staff do which appointments", values: [true, true, true] },
      { label: "Rooms and equipment", values: ["Unlimited", "Unlimited", "Unlimited"] },
      { label: "Double-booking protection", values: [true, true, true] },
      { label: "Customer groups and booking questions", values: [true, true, true] },
    ],
  },
  {
    title: "Your booking page",
    rows: [
      { label: "Your logo and colours", values: [true, true, true] },
      { label: "Guest booking and self-service changes", values: [true, true, true] },
      { label: "Plug booking into your own site", values: [true, true, true] },
      { label: "Remove the bookanything badge", values: [false, true, true] },
      { label: "Custom domain", values: [false, "Coming soon", "Coming soon"] },
    ],
  },
  {
    title: "Payments",
    rows: [
      { label: "Platform fee on payments", values: ["0%", "0%", "0%"] },
      { label: "Full prepayment, deposits or pay at venue", values: [true, true, true] },
      { label: "Automatic, policy-based refunds", values: [true, true, true] },
    ],
  },
  {
    title: "Notifications",
    rows: [
      { label: "Email confirmations and reminders", values: [true, true, true] },
      {
        label: "SMS reminders",
        values: [false, "At cost", "At cost"],
        hint: "Billed at what the SMS provider charges us.",
      },
    ],
  },
  {
    title: "AI",
    rows: [
      { label: "Connect your own AI assistant", values: [true, true, true] },
      { label: "Clients book through their own AI", values: [true, true, true] },
      { label: "Setup drafted from a description or website", values: [true, true, true] },
      {
        label: "Built-in assistant",
        values: ["Add-on", "Add-on", "Add-on"],
        hint: "A paid add-on, sold as monthly credits.",
      },
    ],
  },
  {
    title: "Support",
    rows: [
      { label: "Email support", values: [true, true, true] },
      { label: "Priority support", values: [false, false, true] },
      { label: "Setup help from our team", values: [false, false, true] },
    ],
  },
];

/**
 * Worked example on the pricing page. Illustrative assumptions for typical
 * pricing models; not quotes from any provider.
 */
export const WORKED_EXAMPLE = {
  teamSize: 3,
  monthlyBookingsEur: 8000,
  perSeatEur: 15,
  commissionLowPct: 2,
  commissionHighPct: 5,
  proPlanEur: 10,
};

export function workedExampleCosts(e = WORKED_EXAMPLE) {
  const perSeat = e.teamSize * e.perSeatEur;
  const commissionLow = (e.monthlyBookingsEur * e.commissionLowPct) / 100;
  const commissionHigh = (e.monthlyBookingsEur * e.commissionHighPct) / 100;
  return {
    perSeat: { month: perSeat, year: perSeat * 12 },
    commission: { month: [commissionLow, commissionHigh], year: [commissionLow * 12, commissionHigh * 12] },
    bookanything: { month: e.proPlanEur, year: e.proPlanEur * 12 },
  } as const;
}

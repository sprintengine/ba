/**
 * The plans on the pricing page. Limits mirror architecture §5.3:
 * Free = 100 bookings/month, 3 team members, badge shown.
 */
export type PlanKey = "free" | "pro" | "business";

export type Plan = {
  key: PlanKey;
  name: string;
  /** Monthly price per location in euro. */
  price: number;
  tagline: string;
  /** One-line summary for compact plan cards. */
  summary: string;
  cta: { label: string; href: string };
  highlight?: boolean;
  intro?: string;
  features: string[];
};

export const PLANS: Plan[] = [
  {
    key: "free",
    name: "Free",
    price: 0,
    tagline: "For one-person businesses and small teams starting out.",
    summary: "Up to 100 bookings a month",
    cta: { label: "Start for free", href: "/sign-up" },
    features: [
      "Up to 100 bookings a month",
      "Up to 3 team members",
      "Your booking page, with a small bookanything badge",
      "Online payments with 0% platform fee",
      "Email confirmations and reminders",
      "AI setup",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: 12,
    tagline: "For when you've outgrown the Free limits or want the badge gone.",
    summary: "Unlimited bookings and team",
    cta: { label: "Start with Pro", href: "/sign-up" },
    highlight: true,
    intro: "Everything in Free, plus",
    features: [
      "Unlimited bookings",
      "Unlimited team members",
      "No bookanything badge",
      "SMS reminders, charged at cost",
      "More AI usage included",
    ],
  },
  {
    key: "business",
    name: "Business",
    price: 39,
    tagline: "For bigger practices that want priority support and help setting up.",
    summary: "Priority support and setup help",
    cta: { label: "Start with Business", href: "/sign-up" },
    intro: "Everything in Pro, plus",
    features: [
      "Our highest AI allowance",
      "Priority support",
      "Setup help from our team",
      "Early access to new features",
    ],
  },
];

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
      { label: "Bookings per month", values: ["100", "Unlimited", "Unlimited"] },
      { label: "Team members", values: ["3", "Unlimited", "Unlimited"] },
      { label: "Services, options and add-ons", values: ["Unlimited", "Unlimited", "Unlimited"] },
      { label: "People, rooms and equipment", values: ["Unlimited", "Unlimited", "Unlimited"] },
      { label: "Double-booking protection", values: [true, true, true] },
      { label: "Customer groups and booking questions", values: [true, true, true] },
    ],
  },
  {
    title: "Your booking page",
    rows: [
      { label: "Your logo and colours", values: [true, true, true] },
      { label: "Guest booking and self-service changes", values: [true, true, true] },
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
      { label: "AI setup from a description or website", values: [true, true, true] },
      { label: "AI usage included", values: ["Starter", "More", "Most"] },
      { label: "Bookable by AI assistants", values: ["Coming soon", "Coming soon", "Coming soon"] },
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
  proPlanEur: 12,
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

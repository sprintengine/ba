import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PlanCards, PlanNotes } from "../pricing/plan-cards";
import { WorkedExample } from "../pricing/worked-example";
import { PrismContainer, PrismHeading } from "./heading";

/** Who the free plan is for: the people the pricing is built around. */
const STARTERS = [
  {
    title: "Working on your own",
    body: "Every kind of appointment and your own booking page, free until you pass 100 bookings a month.",
  },
  {
    title: "Starting a business with AI",
    body: "Build your own site with AI and plug our booking in for free. Your assistant can run the rest.",
  },
];

/** Pricing in brief: the three plans, flat on the page, with the full comparison a click away. */
export function PricingTeaser() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-24 py-20 sm:py-28">
      <PrismContainer>
        <PrismHeading
          id="pricing-title"
          label="Pricing"
          title="Free until you’re busy."
          lit="You pay for bookings, not people."
          punch
          lead="Most booking software charges per person. We don’t: every plan has unlimited staff and unlimited appointment types, and you only move up when the bookings do."
        />
        <div className="mt-12 sm:mt-14">
          <PlanCards heading="h3" />
        </div>
        <div className="mt-6">
          <PlanNotes />
        </div>
        <ul className="mt-10 grid gap-4 md:grid-cols-2">
          {STARTERS.map((s) => (
            <li key={s.title} className="rounded-2xl bg-surface-sunken p-6 sm:p-7">
              <h3 className="font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-1 text-sm leading-normal text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ul>
        <div className="mt-10 sm:mt-14">
          <WorkedExample />
        </div>
        <div className="mt-6 flex justify-center">
          <Link
            href="/pricing"
            className="focus-ring group inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold"
          >
            Compare every plan
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </PrismContainer>
    </section>
  );
}

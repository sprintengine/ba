import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PlanCards, PlanNotes } from "../pricing/plan-cards";
import { PrismContainer, PrismHeading } from "./heading";

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

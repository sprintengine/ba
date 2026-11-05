import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrismContainer, PrismDot } from "../heading";

/**
 * The opening, to the business owner: what it is, what it takes off their hands, and where to start. The real calendar
 * follows straight on, so the first screen ends on the product.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="pt-24 pb-8 sm:pt-28 sm:pb-10 lg:pt-24 lg:pb-10">
      <PrismContainer className="lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-end lg:gap-14">
        <div>
          <p className="mb-5 text-[0.9375rem] font-semibold text-muted-foreground">
            Online booking for appointment businesses
          </p>
          <h1
            id="hero-title"
            className="text-[clamp(3rem,6.2vw,5rem)] leading-[0.96] font-semibold tracking-[-0.05em] text-balance"
          >
            Booking software your AI can run
            <PrismDot />
          </h1>
        </div>
        <div className="mt-7 lg:mt-0 lg:pb-1">
          <p className="text-lg leading-[1.55] text-muted-foreground">
            Your bookings, payments and reminders look after themselves, so you’re not interrupted while
            you’re with someone. Connect the AI you already use, like ChatGPT or Claude, and run the whole
            business by asking it.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild variant="primary" size="xl" className="rounded-[14px] font-semibold">
              <Link href="/sign-up">
                Start for free <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="xl" className="rounded-[14px] font-semibold">
              <Link href="#product">See how it works</Link>
            </Button>
          </div>
          <p className="mt-4 text-[0.9375rem] text-pretty text-muted-foreground">
            Free for 100 bookings a month. No card needed. We never take a cut of your payments.
          </p>
        </div>
      </PrismContainer>
    </section>
  );
}

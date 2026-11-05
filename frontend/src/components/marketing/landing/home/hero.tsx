import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrismContainer } from "../heading";
import { HeroBookings } from "./hero-bookings";

/** The opening: what it is and what it does for you, with every booking coming together behind it. */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden pt-24 pb-20 sm:pt-32 sm:pb-28 lg:flex lg:min-h-[min(100svh,54rem)] lg:items-center"
    >
      <PrismContainer className="grid items-center gap-20 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-20">
        <div>
          <p className="mb-5 text-[0.9375rem] font-semibold text-muted-foreground">
            Online booking for appointment businesses
          </p>
          <h1
            id="hero-title"
            className="text-[clamp(3rem,7vw,6rem)] leading-[0.96] font-semibold tracking-[-0.05em] text-balance"
          >
            Booking software your AI can run.
          </h1>
          <p className="mt-7 max-w-[35rem] text-lg leading-[1.55] text-muted-foreground sm:text-xl sm:leading-[1.5]">
            Clients book and pay themselves, day and night. Your AI, or ours, handles the rest. Fewer calls,
            and you&apos;re home on time.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild variant="primary" size="xl" className="rounded-[14px] font-semibold">
              <Link href="/sign-up">
                Start for free <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="xl" className="rounded-[14px] font-semibold">
              <Link href="#product">See how it works</Link>
            </Button>
          </div>
          <p className="mt-5 text-[0.9375rem] text-muted-foreground">
            Free for up to 100 bookings a month. No card needed. We never take a cut of your payments.
          </p>
        </div>
        <HeroBookings />
      </PrismContainer>
    </section>
  );
}

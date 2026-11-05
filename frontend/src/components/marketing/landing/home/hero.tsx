import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrismContainer, PrismDot } from "../heading";
import { HeroStage } from "./hero-stage";

/** The opening: what it is and what it does for you, and the brand, large, with the product at work in front of it. */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden pt-24 pb-16 sm:pt-32 sm:pb-24 lg:flex lg:min-h-[min(100svh,54rem)] lg:items-center lg:pb-20"
    >
      <PrismContainer>
        <div className="relative z-[6] lg:max-w-[27rem] xl:max-w-[36rem]">
          <p className="mb-5 text-[0.9375rem] font-semibold text-muted-foreground">
            Online booking for appointment businesses
          </p>
          <h1
            id="hero-title"
            className="text-[clamp(3rem,6.2vw,5.5rem)] leading-[0.96] font-semibold tracking-[-0.05em] text-balance"
          >
            Booking software your AI can run
            <PrismDot />
          </h1>
          <p className="mt-7 max-w-[35rem] text-lg leading-[1.55] text-muted-foreground sm:text-xl sm:leading-[1.5]">
            Clients book and pay online, so you&apos;re not interrupted while you&apos;re with someone.
            Connect the AI you already use, like ChatGPT or Claude, and run the whole business by asking it.
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
            Free for 100 bookings a month. No card needed. We never take a cut of your payments.
          </p>
        </div>
      </PrismContainer>
      <HeroStage />
    </section>
  );
}

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrismContainer } from "../heading";
import { ThreadField } from "./thread-field";

/** The opening: what it is in one line, the threads behind it. */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[min(100svh,56rem)] items-center overflow-hidden pt-32 pb-20 sm:pb-28"
    >
      <ThreadField className="inset-0 -z-10 [mask-image:linear-gradient(180deg,transparent_74%,black_94%)] lg:[mask-image:linear-gradient(100deg,transparent_16%,black_56%)]" />
      <PrismContainer>
        <div className="max-w-[46rem]">
          <p className="mb-5 text-[0.9375rem] font-semibold text-muted-foreground">
            Online booking for appointment businesses
          </p>
          <h1
            id="hero-title"
            className="text-[clamp(3rem,7.4vw,6.25rem)] leading-[0.96] font-semibold tracking-[-0.05em] text-balance"
          >
            Booking software your AI can run.
          </h1>
          <p className="mt-7 max-w-[35rem] text-lg leading-[1.55] text-muted-foreground sm:text-xl sm:leading-[1.5]">
            Clients book and pay online. You get one calendar for your staff, rooms and equipment. Connect
            your own AI, or use ours, and it can run the whole business.
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
      </PrismContainer>
    </section>
  );
}

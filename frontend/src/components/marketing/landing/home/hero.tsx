import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrismContainer, PrismDot } from "../heading";
import { HeroStage } from "./hero-stage";

/**
 * The first screen, to the business owner: what it is and where to start, then the product working. The words are in
 * the page's HTML and paint at once; the stage's animation arrives after them.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="pt-3 pb-4 lg:pt-1">
      <PrismContainer className="lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-end lg:gap-12">
        <h1
          id="hero-title"
          className="text-[clamp(2.75rem,min(4.6vw,7vh),4.25rem)] leading-[0.98] font-semibold tracking-[-0.05em] text-balance"
        >
          Booking software your AI can run
          <PrismDot />
        </h1>
        <div className="mt-5 lg:mt-0 lg:pb-1">
          <p className="text-lg leading-[1.45] text-pretty text-muted-foreground [@media(max-height:760px)]:text-base">
            Clients book and pay online, and it lands on your calendar. Connect the AI you already use to run
            the rest.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 [@media(max-height:760px)]:mt-3">
            <Button
              asChild
              variant="primary"
              size="xl"
              className="rounded-[14px] font-semibold [@media(max-height:760px)]:h-11 [@media(max-height:760px)]:px-5"
            >
              <Link href="/sign-up">
                Start for free <ArrowRight />
              </Link>
            </Button>
            <p className="text-sm text-muted-foreground lg:max-xl:hidden [@media(max-height:760px)]:hidden">
              Free for 100 bookings a month. No card needed.
            </p>
          </div>
        </div>
      </PrismContainer>
      <div className="mt-5 sm:mt-6 [@media(max-height:760px)]:mt-4">
        <HeroStage />
      </div>
      <p className="sr-only">
        A clinic’s calendar across three people. A client books a follow-up treatment at 15:30 on their phone
        and pays €60, and the booking lands straight away in Sam’s column, with a notice. It then shows on the
        day’s list, among the customers and in the reports.
      </p>
      <PrismContainer>
        <p className="mt-3 text-center text-[0.8125rem] text-subtle-foreground">
          A sample business with made-up clients.
        </p>
      </PrismContainer>
    </section>
  );
}

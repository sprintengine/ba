import { PrismDot } from "../heading";
import { DescribeForm } from "./describe-form";

const BACKDROP =
  "mx-auto w-[calc(100%-1.25rem)] max-w-[80rem] rounded-[1.5rem] bg-[#7c7ab4] bg-[url('/hero/lough-dusk.webp')] bg-cover bg-center p-3 sm:w-[calc(100%-3rem)] sm:rounded-[2.25rem] sm:p-8 lg:p-14";

/** The close: the outcome in one line, on the hero's own landscape, with the box to start in. */
export function ClosingSection() {
  return (
    <section id="start" aria-labelledby="cta-title" className="pt-10 pb-20 sm:pb-28">
      <div className={BACKDROP}>
        <div className="mx-auto max-w-3xl rounded-[1.25rem] bg-surface/92 px-6 py-14 text-center shadow-sm backdrop-blur-md sm:rounded-[1.75rem] sm:px-12 sm:py-20">
          <h2
            id="cta-title"
            className="mx-auto text-[clamp(2.5rem,5vw,4.5rem)] leading-[0.98] font-semibold tracking-[-0.05em] text-balance"
          >
            Fewer calls. Home on time
            <PrismDot />
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-[1.5] text-muted-foreground">
            Have your booking page live this afternoon, and let it take the bookings tonight. Your assistant
            can run the rest.
          </p>
          <div className="mx-auto mt-8 max-w-xl">
            <DescribeForm cta="Start for free" />
          </div>
          <p className="mt-5 text-[0.9375rem] text-muted-foreground">
            Free for 100 bookings a month, no card needed. We never take a cut of your payments.
          </p>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useRef } from "react";
import { PrismDot } from "../heading";
import { DescribeForm } from "./describe-form";
import { ThreadField } from "./thread-field";

/** The close: the outcome in one line, with the threads coming together on the box to start in. */
export function ClosingSection() {
  const target = useRef<HTMLDivElement>(null);
  return (
    <section
      id="start"
      aria-labelledby="cta-title"
      className="relative isolate overflow-hidden py-28 text-center sm:py-40"
    >
      <ThreadField
        target={target}
        sides
        paused
        className="inset-0 -z-10 [mask-image:radial-gradient(ellipse_44%_60%_at_50%_34%,transparent_60%,black_100%)]"
      />
      <div className="px-6">
        <h2
          id="cta-title"
          className="mx-auto max-w-4xl text-[clamp(2.75rem,6.4vw,5.75rem)] leading-[0.98] font-semibold tracking-[-0.05em] text-balance"
        >
          Fewer calls. Home on time
          <PrismDot />
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-[1.5] text-muted-foreground sm:text-xl">
          Have your booking page live this afternoon, and let it take the bookings tonight. Your assistant can
          run the rest.
        </p>
        <div ref={target} className="mx-auto mt-10 max-w-xl">
          <DescribeForm cta="Start for free" />
        </div>
        <p className="mt-5 text-[0.9375rem] text-muted-foreground">
          Free for 100 bookings a month, no card needed. We never take a cut of your payments.
        </p>
      </div>
    </section>
  );
}

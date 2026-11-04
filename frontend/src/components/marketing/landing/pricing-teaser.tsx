import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ComparisonTable } from "../comparison";
import { PLANS } from "../plans";
import { PrismContainer, PrismHeading } from "./heading";
import prism from "./prism/prism.module.css";
import { Tilt } from "./tilt";

/** Pricing in brief: the three plans as glass over the light, then how per-location compares with the market. */
export function PricingTeaser() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-24 py-24 sm:py-32">
      <PrismContainer>
        <PrismHeading
          id="pricing-title"
          label="Pricing"
          title="One price per location,"
          lit="however big your team."
          lead="Add everyone who works there at no extra cost. You pay a flat monthly fee for each location and nothing per booking."
        />
        <Tilt
          className={cn(
            prism.tile,
            "relative mt-14 overflow-hidden rounded-[28px] px-5 py-8 max-sm:rounded-3xl sm:mt-16 sm:px-10 sm:py-14",
          )}
        >
          <div aria-hidden className={cn(prism.glow, "top-[55%] h-[60%]")} />
          <ul className="relative grid gap-3 md:grid-cols-3 md:gap-4">
            {PLANS.map((p) => (
              <li
                key={p.key}
                data-tilt
                className={cn(
                  prism.gl,
                  "flex flex-col rounded-[20px] p-5 sm:p-6",
                  // The plan most businesses want stands out on every screen, not only where it lifts.
                  p.highlight && [prism.lift, "outline-2 outline-foreground"],
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{p.name}</span>
                  {p.highlight && (
                    <span className="rounded-md bg-primary px-2 py-0.5 text-2xs font-semibold text-primary-foreground">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="tnum mt-4 text-[2.5rem] leading-none font-semibold tracking-[-0.045em]">
                  €{p.price}
                  <small className="ml-1.5 text-[0.8125rem] font-medium tracking-normal text-muted-foreground">
                    {p.price ? "/ location / month" : "free forever"}
                  </small>
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>
                <ul className="mt-5 flex flex-col gap-2 border-t border-(--prism-hairline) pt-4 text-[0.8125rem]">
                  {p.features.slice(0, 4).map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Tilt>
        <div className="mt-6 flex justify-center">
          <Link
            href="/pricing"
            className="focus-ring group inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold"
          >
            Compare every plan
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-20 grid gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-14">
          <div>
            <h3 className="text-[clamp(1.75rem,2.6vw,2.25rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
              How that compares <span className="text-prism">with other booking software.</span>
            </h3>
            <p className="mt-4 text-base leading-[1.6] text-muted-foreground">
              Most booking software either charges for every person on your team or takes a percentage of
              every booking. With us, a busy month costs the same as a quiet one.
            </p>
          </div>
          <div>
            <ComparisonTable className="rounded-[22px]" />
            <p className="mt-3 text-xs text-subtle-foreground">
              Describes typical pricing models in the market, not any particular product.
            </p>
          </div>
        </div>
      </PrismContainer>
    </section>
  );
}

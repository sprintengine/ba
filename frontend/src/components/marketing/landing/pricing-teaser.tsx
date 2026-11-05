import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PLANS } from "../plans";
import { PrismContainer, PrismHeading } from "./heading";

/** Pricing in brief: the three plans, flat on the page, with the full comparison a click away. */
export function PricingTeaser() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-24 py-20 sm:py-28">
      <PrismContainer>
        <PrismHeading
          id="pricing-title"
          label="Pricing"
          title="One price per location,"
          lit="however big your team."
          lead="Everyone who works there is included. You pay a flat monthly fee for each location and nothing per booking, so a busy month costs the same as a quiet one."
        />
        <ul className="mt-12 grid gap-4 sm:mt-14 md:grid-cols-3">
          {PLANS.map((p) => (
            <li
              key={p.key}
              className={cn(
                "flex flex-col rounded-2xl border border-border bg-surface p-6 sm:p-7",
                p.highlight && "border-foreground shadow-md",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{p.name}</span>
                {p.highlight && (
                  <span className="rounded-md bg-primary px-2 py-0.5 text-2xs font-semibold text-primary-foreground">
                    Recommended
                  </span>
                )}
              </div>
              <p className="tnum mt-4 text-[2.75rem] leading-none font-semibold tracking-[-0.045em]">
                €{p.price}
                <small className="ml-1.5 text-[0.8125rem] font-medium tracking-normal text-muted-foreground">
                  {p.price ? "/ location / month" : "free forever"}
                </small>
              </p>
              <p className="mt-2.5 text-sm leading-normal text-muted-foreground">{p.tagline}</p>
              <ul className="mt-5 flex flex-1 flex-col gap-2 border-t border-border-subtle pt-4 text-sm">
                {p.features.slice(0, 4).map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                variant={p.highlight ? "primary" : "secondary"}
                className="mt-6 h-11 rounded-xl font-semibold"
              >
                <Link href={p.cta.href}>{p.cta.label}</Link>
              </Button>
            </li>
          ))}
        </ul>
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

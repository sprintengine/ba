import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PLANS } from "../plans";

export function PlanCards() {
  return (
    <ul className="grid gap-4 lg:grid-cols-3">
      {PLANS.map((plan) => (
        <li
          key={plan.key}
          className={cn(
            "relative flex flex-col rounded-2xl border bg-surface p-7 sm:p-8",
            plan.highlight ? "border-foreground shadow-md" : "border-border",
          )}
        >
          <div className="relative flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">{plan.name}</h2>
            {plan.highlight && (
              <span className="rounded-md bg-primary px-2 py-0.5 text-2xs font-semibold text-primary-foreground">
                Recommended
              </span>
            )}
          </div>
          <p className="relative mt-2 min-h-11 text-sm text-muted-foreground">{plan.tagline}</p>
          <div className="relative mt-6 flex items-end gap-2">
            <span className="tnum text-5xl leading-none font-semibold tracking-tight">€{plan.price}</span>
            <span className="pb-1 text-sm leading-tight text-muted-foreground">
              {plan.price ? (
                <>
                  per location
                  <br />
                  per month
                </>
              ) : (
                <>
                  free
                  <br />
                  forever
                </>
              )}
            </span>
          </div>
          <Button
            asChild
            variant={plan.highlight ? "primary" : "secondary"}
            size="lg"
            block
            className="relative mt-7"
          >
            <Link href={plan.cta.href}>{plan.cta.label}</Link>
          </Button>
          <div className="relative mt-8 border-t border-border-subtle pt-6">
            {plan.intro && <p className="mb-4 text-sm font-medium">{plan.intro}</p>}
            <ul className="flex flex-col gap-3 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PLANS, TALK_TO_US } from "../plans";

/** The plans, the same on the home page and the pricing page. */
export function PlanCards({ heading: Heading = "h2" }: { heading?: "h2" | "h3" }) {
  // Three stacked plans fill a phone: it shows one, and the switch moves between them.
  const [chosen, setChosen] = useState<string>(PLANS[0]?.key ?? "free");
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Plan" className="flex self-center rounded-lg bg-muted p-0.5 sm:hidden">
        {PLANS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={p.key === chosen}
            onClick={() => setChosen(p.key)}
            className={cn(
              "focus-ring min-h-11 rounded-md px-4 text-sm font-medium",
              p.key === chosen ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground",
            )}
          >
            {p.name}
          </button>
        ))}
      </div>
      <ul className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <li
            key={plan.key}
            className={cn(
              "relative flex flex-col rounded-2xl border bg-surface p-7 sm:p-8",
              plan.highlight ? "border-foreground shadow-md" : "border-border",
              plan.key !== chosen && "max-sm:hidden",
            )}
          >
            <div className="relative flex items-center justify-between gap-3">
              <Heading className="text-lg font-semibold tracking-tight">{plan.name}</Heading>
              {plan.highlight && (
                <span className="rounded-md bg-primary px-2 py-0.5 text-2xs font-semibold text-primary-foreground">
                  {plan.badge}
                </span>
              )}
            </div>
            <p className="relative mt-2 min-h-11 text-sm text-muted-foreground">{plan.tagline}</p>
            <div className="relative mt-6 flex items-end gap-2">
              <span className="tnum text-5xl leading-none font-semibold tracking-tight">€{plan.price}</span>
              <span className="pb-1 text-sm leading-tight text-muted-foreground">
                {plan.price ? (
                  <>
                    per business
                    <br />
                    per month
                  </>
                ) : (
                  <>
                    until
                    <br />
                    you’re busy
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
    </div>
  );
}

/** What every plan shares and where the plans end, under the cards. */
export function PlanNotes() {
  return (
    <div className="flex flex-col gap-1 text-center text-sm text-muted-foreground">
      <p>
        More than 10,000 bookings a month?{" "}
        <a
          href={TALK_TO_US}
          className="focus-ring rounded-sm font-medium text-foreground underline underline-offset-4 hover:decoration-2"
        >
          Talk to us
        </a>
        .
      </p>
      <p>
        Connecting your own assistant is included on every plan. Our built-in assistant is a paid add-on, sold
        as monthly credits.
      </p>
    </div>
  );
}

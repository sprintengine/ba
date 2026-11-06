"use client";

import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PLAN_COMPARISON, PLANS, type ComparisonValue } from "../plans";

function Value({ value }: { value: ComparisonValue }) {
  if (value === true)
    return (
      <>
        <Check className="mx-auto size-4 text-brand" aria-hidden />
        <span className="sr-only">Included</span>
      </>
    );
  if (value === false)
    return (
      <>
        <Minus className="mx-auto size-4 text-subtle-foreground/60" aria-hidden />
        <span className="sr-only">Not included</span>
      </>
    );
  if (value === "Coming soon")
    return (
      <Badge tone="outline" className="text-muted-foreground">
        Coming soon
      </Badge>
    );
  return <span className="tnum font-medium">{value}</span>;
}

/** A phone's width holds the features and one plan, so a phone picks the plan and every value stays readable. */
const WIDE_ONLY = "max-[35.99rem]:hidden";

/** Full feature matrix: every plan side by side, or one at a time on a phone. */
export function PlanComparison() {
  const [shown, setShown] = useState(1);
  return (
    <>
      <div
        role="group"
        aria-label="Plan to compare"
        className="mb-3 flex gap-1 rounded-xl bg-muted p-1 min-[36rem]:hidden"
      >
        {PLANS.map((p, i) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={shown === i}
            onClick={() => setShown(i)}
            className={cn(
              "focus-ring min-h-11 flex-1 rounded-lg text-sm font-medium text-muted-foreground",
              shown === i && "bg-surface text-foreground shadow-xs",
            )}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div
        role="region"
        aria-label="Plan comparison"
        className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-xs"
      >
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">Features included in each plan</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="w-[58%] bg-surface px-4 py-4 text-left min-[36rem]:w-[36%] sm:px-5">
                <span className="sr-only">Feature</span>
              </th>
              {PLANS.map((p, i) => (
                <th
                  key={p.key}
                  scope="col"
                  className={cn("px-2 py-4 text-center sm:px-4", shown !== i && WIDE_ONLY)}
                >
                  <span className="block text-sm font-semibold">{p.name}</span>
                  <span className="tnum block text-xs font-normal text-muted-foreground">
                    {p.price ? `€${p.price} / month` : "€0"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          {PLAN_COMPARISON.map((group) => (
            <tbody key={group.title}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={PLANS.length + 1}
                  className="border-y border-border-subtle bg-surface-sunken/70 px-5 py-2.5 text-left text-xs font-medium text-subtle-foreground"
                >
                  {group.title}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.label} className="border-b border-border-subtle last:border-b-0">
                  <th scope="row" className="bg-surface px-4 py-3.5 text-left font-normal sm:px-5">
                    {row.label}
                    {row.hint && (
                      <span className="mt-0.5 block text-xs text-subtle-foreground">{row.hint}</span>
                    )}
                  </th>
                  {row.values.map((v, i) => (
                    <td key={i} className={cn("px-2 py-3.5 text-center sm:px-4", shown !== i && WIDE_ONLY)}>
                      <Value value={v} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}

import { Check, Minus } from "lucide-react";
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

/** Full feature matrix. Scrolls horizontally on small screens. */
export function PlanComparison() {
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground min-[36rem]:hidden">
        Swipe the table sideways to see every plan.
      </p>
      <div
        // Scrolls sideways on phones, so keyboard users must be able to focus and scroll it.
        tabIndex={0}
        role="region"
        aria-label="Plan comparison"
        className="relative scrollbar-thin overflow-x-auto rounded-2xl border border-border bg-surface shadow-xs max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] max-sm:pr-8"
      >
        <table className="w-full min-w-[34rem] table-fixed border-collapse text-sm">
          <caption className="sr-only">Features included in each plan</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="sticky left-0 z-10 w-[36%] bg-surface px-5 py-4 text-left">
                <span className="sr-only">Feature</span>
              </th>
              {PLANS.map((p) => (
                <th key={p.key} scope="col" className="px-2 py-4 text-center sm:px-4">
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
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-surface px-5 py-3.5 text-left font-normal max-md:shadow-[1px_0_0_var(--border-subtle)]"
                  >
                    {row.label}
                    {row.hint && (
                      <span className="mt-0.5 block text-xs text-subtle-foreground">{row.hint}</span>
                    )}
                  </th>
                  {row.values.map((v, i) => (
                    <td key={i} className="px-2 py-3.5 text-center sm:px-4">
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

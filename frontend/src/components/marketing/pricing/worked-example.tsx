import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { LogoMark } from "@/components/brand/logo";
import { WORKED_EXAMPLE, workedExampleCosts } from "../plans";

const eur = (n: number) => formatMoney(Math.round(n * 100), "EUR");

/** "What a month costs" for a 3-person team doing €8,000 in bookings. Illustrative. */
export function WorkedExample() {
  const e = WORKED_EXAMPLE;
  const c = workedExampleCosts();
  const columns = [
    {
      title: "Per-seat scheduling tool",
      month: eur(c.perSeat.month),
      year: `${eur(c.perSeat.year)} a year`,
      working: `${e.teamSize} seats × ${eur(e.perSeatEur)}`,
    },
    {
      title: "Commission marketplace",
      month: `${eur(c.commission.month[0])}–${eur(c.commission.month[1])}`,
      year: `${eur(c.commission.year[0])}–${eur(c.commission.year[1])} a year`,
      working: `${e.commissionLowPct}–${e.commissionHighPct}% of ${eur(e.monthlyBookingsEur)}`,
    },
    {
      title: "bookanything Pro",
      month: eur(c.bookanything.month),
      year: `${eur(c.bookanything.year)} a year`,
      working: "1 location, whole team, 0% platform fee",
      us: true,
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-col gap-1 border-b border-border-subtle px-6 py-5 sm:px-8">
        <p className="text-sm font-semibold">
          A {e.teamSize}-person physio team taking {eur(e.monthlyBookingsEur)} a month in bookings
        </p>
        <p className="text-sm text-muted-foreground">What the booking software costs each month.</p>
      </div>
      <div className="grid divide-y divide-border-subtle md:grid-cols-3 md:divide-x md:divide-y-0">
        {columns.map((col) => (
          <div
            key={col.title}
            className={cn("flex flex-col gap-4 p-6 sm:p-8", col.us && "bg-surface-sunken")}
          >
            <p className="flex items-center gap-2 text-sm font-medium">
              {col.us && <LogoMark className="size-5" aria-hidden title="" />}
              {col.title}
            </p>
            <div>
              <p className="tnum text-4xl font-semibold tracking-tight text-foreground">
                {col.month}
                <span className="ml-1 text-sm font-normal text-muted-foreground">/ month</span>
              </p>
              <p className="tnum mt-1 text-sm text-muted-foreground">{col.year}</p>
            </div>
            <p className="tnum mt-auto border-t border-border-subtle pt-4 text-xs text-subtle-foreground">
              {col.working}
            </p>
          </div>
        ))}
      </div>
      <p className="border-t border-border-subtle bg-surface-sunken/60 px-6 py-4 text-xs text-subtle-foreground sm:px-8">
        Illustrative figures for typical pricing models, not quotes from any provider. Card processing fees
        from your payment provider apply in every scenario and are not included.
      </p>
    </div>
  );
}

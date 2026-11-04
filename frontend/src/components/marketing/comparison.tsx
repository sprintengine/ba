import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand/logo";

type Cell = { text: string; good?: boolean };
type Row = { label: string; perSeat: Cell; commission: Cell; us: Cell };

/**
 * Generic pricing-model comparison. Describes typical models in the market,
 * never a named product.
 */
const ROWS: Row[] = [
  {
    label: "How you're charged",
    perSeat: { text: "A monthly fee for every team member" },
    commission: { text: "A percentage of each booking, sometimes plus a subscription" },
    us: { text: "One flat price per location", good: true },
  },
  {
    label: "Fees on payments",
    perSeat: { text: "Varies by tool and add-on" },
    commission: { text: "Commission on every paid booking" },
    us: { text: "0% platform fee. You only pay Stripe's processing fee", good: true },
  },
  {
    label: "When your team grows",
    perSeat: { text: "Your bill grows with every hire" },
    commission: { text: "Your bill grows with your revenue" },
    us: { text: "Unlimited team members on paid plans", good: true },
  },
  {
    label: "Refunds",
    perSeat: { text: "Often handled by hand" },
    commission: { text: "Set by the platform's rules" },
    us: { text: "Automatic, following your own policy", good: true },
  },
  {
    label: "Rooms and equipment",
    perSeat: { text: "Usually people's calendars only" },
    commission: { text: "Usually staff only" },
    us: { text: "People, rooms and equipment booked together", good: true },
  },
  {
    label: "Your customers",
    perSeat: { text: "Yours", good: true },
    commission: { text: "Shown on a marketplace beside your competitors" },
    us: { text: "Yours, on your own booking page", good: true },
  },
];

export function ComparisonTable({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-surface shadow-xs", className)}>
      {/* Desktop table */}
      <table className="hidden w-full table-fixed border-collapse text-sm md:table">
        <caption className="sr-only">
          How bookanything compares with typical per-seat and commission pricing
        </caption>
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className="w-[22%] px-5 py-4 text-left text-xs font-medium text-subtle-foreground"
            >
              <span className="sr-only">Compared on</span>
            </th>
            <th scope="col" className="px-5 py-4 text-left font-medium">
              Per-seat scheduling tools
            </th>
            <th scope="col" className="px-5 py-4 text-left font-medium">
              Commission marketplaces
            </th>
            <th scope="col" className="bg-surface-sunken px-5 py-4 text-left font-semibold">
              <span className="inline-flex items-center gap-2">
                <LogoMark className="size-5" aria-hidden title="" /> bookanything
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className="border-b border-border-subtle last:border-b-0">
              <th scope="row" className="px-5 py-4 text-left align-top text-sm font-medium">
                {row.label}
              </th>
              <td className="px-5 py-4 align-top text-muted-foreground">{row.perSeat.text}</td>
              <td className="px-5 py-4 align-top text-muted-foreground">{row.commission.text}</td>
              <td className="bg-surface-sunken px-5 py-4 align-top font-medium">
                <span className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
                  {row.us.text}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: stacked */}
      <dl className="divide-y divide-border-subtle md:hidden">
        {ROWS.map((row) => (
          <div key={row.label} className="flex flex-col gap-3 p-5">
            <dt className="text-sm font-semibold">{row.label}</dt>
            <dd className="flex flex-col gap-2 text-sm">
              <span className="flex gap-2 font-medium">
                <Check className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
                <span>
                  <span className="sr-only">bookanything: </span>
                  {row.us.text}
                </span>
              </span>
              <span className="flex gap-2 text-muted-foreground">
                <Minus className="mt-0.5 size-4 shrink-0 text-subtle-foreground" aria-hidden />
                <span>
                  <span className="text-subtle-foreground">Per-seat: </span>
                  {row.perSeat.text}
                </span>
              </span>
              <span className="flex gap-2 text-muted-foreground">
                <Minus className="mt-0.5 size-4 shrink-0 text-subtle-foreground" aria-hidden />
                <span>
                  <span className="text-subtle-foreground">Commission: </span>
                  {row.commission.text}
                </span>
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

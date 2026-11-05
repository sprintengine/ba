import type { Quote } from "@/lib/booking/quote";
import { formatDuration, formatMoney, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DealLine, DealPrice } from "@/components/offers/deal-price";

/**
 * A quote's lines, the deal, the total and, for a deposit, what is due now. `summary` is the booking summary's narrow
 * column (lines truncate, the total shows the length, a deposit shows only what is due now); `review` is the review
 * step's full width (a deposit also shows what is left to pay at the appointment).
 */
export function QuoteBreakdown({
  quote,
  currency,
  locale,
  variant,
}: {
  quote: Quote;
  currency: string;
  locale: string;
  variant: "summary" | "review";
}) {
  const summary = variant === "summary";
  const row = cn("flex justify-between gap-3", summary && "items-baseline");
  return (
    <dl className="flex flex-col gap-1.5 text-sm">
      {/* One line would only repeat the total under it. */}
      {(quote.lines.length > 1 || quote.deal || !summary) &&
        quote.lines.map((l, i) => (
          <div key={i} className={row}>
            <dt className={cn("text-muted-foreground", summary && "min-w-0 truncate")}>{l.label}</dt>
            <dd className={cn("tnum", summary && "shrink-0")}>
              {formatPrice(l.cents, currency, { locale })}
            </dd>
          </div>
        ))}
      {quote.deal && <DealLine deal={quote.deal} currency={currency} locale={locale} />}
      <div className={cn(row, !summary && "mt-1 border-t border-border-subtle pt-2")}>
        <dt className="font-medium">
          Total
          {summary && (
            <>
              {" "}
              <span className="font-normal text-muted-foreground">
                · {formatDuration(quote.durationMinutes)}
              </span>
            </>
          )}
        </dt>
        <dd className={cn("font-semibold", summary && "text-base")}>
          {quote.deal ? (
            <DealPrice
              originalCents={quote.deal.originalTotalCents}
              priceCents={quote.totalCents}
              currency={currency}
              locale={locale}
            />
          ) : (
            <span className="tnum">{formatPrice(quote.totalCents, currency, { locale })}</span>
          )}
        </dd>
      </div>
      {quote.mode === "deposit" &&
        (summary ? (
          <div className={cn(row, "text-muted-foreground")}>
            <dt>Due now</dt>
            <dd className="tnum font-medium text-foreground">
              {formatMoney(quote.dueNowCents, currency, { locale })}
            </dd>
          </div>
        ) : (
          <>
            <div className={row}>
              <dt className="text-muted-foreground">Deposit due now</dt>
              <dd className="tnum font-medium">{formatMoney(quote.dueNowCents, currency, { locale })}</dd>
            </div>
            <div className={row}>
              <dt className="text-muted-foreground">At your appointment</dt>
              <dd className="tnum">{formatMoney(quote.dueLaterCents, currency, { locale })}</dd>
            </div>
          </>
        ))}
    </dl>
  );
}

import { Tag } from "lucide-react";
import { formatMoney, formatPrice } from "@/lib/format";
import { wasNowText } from "@/lib/offers/display";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * A discounted price: the original struck through, then the new price. Screen readers hear
 * "was €50, now €40" instead of two bare numbers.
 */
export function DealPrice({
  originalCents,
  priceCents,
  currency,
  locale,
  className,
  priceClassName,
  inverted = false,
}: {
  originalCents: number;
  priceCents: number;
  currency: string;
  locale?: string;
  className?: string;
  priceClassName?: string;
  /**
   * On a filled or tinted background (a selected slot, a green deal chip): the original price follows the text colour
   * at full strength. The strike-through marks it; fading it too fails contrast on tinted chips.
   */
  inverted?: boolean;
}) {
  return (
    <span className={cn("tnum inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
      <span className="sr-only">{wasNowText(originalCents, priceCents, currency, locale)}</span>
      <s
        aria-hidden
        className={cn("decoration-1", !inverted && "text-muted-foreground decoration-subtle-foreground/50")}
      >
        {formatPrice(originalCents, currency, { locale })}
      </s>
      <span aria-hidden className={cn("font-semibold", priceClassName)}>
        {formatPrice(priceCents, currency, { locale })}
      </span>
    </span>
  );
}

/** A price-breakdown row for an applied deal (inside a `<dl>`): badge + name, and the saving. */
export function DealLine({
  deal,
  currency,
  locale,
  className,
}: {
  deal: { name: string; label: string; discountCents: number };
  currency: string;
  locale?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <dt className="flex min-w-0 items-center gap-2">
        <DealBadge label={deal.label} />
        <span className="truncate text-muted-foreground">{deal.name}</span>
      </dt>
      <dd className="tnum shrink-0 font-medium text-brand">
        <span className="sr-only">Saving </span>
        {formatMoney(-deal.discountCents, currency, { locale, signed: true })}
      </dd>
    </div>
  );
}

/** The deal label ("20% off") as a badge; follows the business colour on public pages. */
export function DealBadge({ label, className }: { label: string; className?: string }) {
  return (
    <Badge tone="brand" className={className}>
      <Tag aria-hidden /> {label}
    </Badge>
  );
}

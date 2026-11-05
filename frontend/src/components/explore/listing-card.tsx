import Link from "next/link";
import { MapPin, Tag } from "lucide-react";
import type { Listing, NextSlot } from "@/lib/api/types";
import { formatDistance, formatPriceFrom, formatSlotLabel } from "@/lib/explore";
import { cn } from "@/lib/utils";
import { BusinessTile } from "@/components/shells/business-tile";
import { DealPrice } from "@/components/offers/deal-price";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "./category-icon";

const MAX_DEALS_SHOWN = 2;

/**
 * A marketplace result. The business name is a stretched link, so the whole card opens the business's
 * site (`/{slug}`) while the link's accessible name stays just the name. Never shows ratings (none exist yet).
 */
export function ListingCard({ listing, now }: { listing: Listing; now?: Date }) {
  const { business, category, currency } = listing;
  const price = formatPriceFrom(listing.priceFromCents, currency);
  const hasDeals = listing.deals.length > 0;
  const place = [
    business.address.city,
    listing.distanceKm !== null ? formatDistance(listing.distanceKm) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs sm:p-5",
        "transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-md",
        "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring",
      )}
    >
      <div className="flex items-start gap-3.5">
        <BusinessTile
          name={business.name}
          logoUrl={business.branding.logoUrl}
          color={business.branding.primaryColor}
          size="xl"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 text-base leading-6 font-semibold tracking-tight">
              <Link
                href={`/${business.slug}`}
                className="line-clamp-2 outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
              >
                {business.name}
              </Link>
            </h3>
            {price && <p className="tnum shrink-0 pt-0.5 text-sm font-semibold whitespace-nowrap">{price}</p>}
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CategoryIcon category={category.key} className="size-3.5 text-brand" />
              {category.label}
            </span>
            {place && (
              <span className="tnum inline-flex items-center gap-1">
                <MapPin aria-hidden className="size-3.5 text-subtle-foreground" />
                {place}
              </span>
            )}
          </p>
        </div>
      </div>

      {business.description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{business.description}</p>
      )}

      {hasDeals && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="success">
            <Tag aria-hidden /> Deals
          </Badge>
          {listing.deals.slice(0, MAX_DEALS_SHOWN).map((deal) => (
            <span key={deal.id} className="text-xs text-muted-foreground">
              <span className="font-medium text-success-soft-foreground">{deal.label}</span>
              {deal.summary && <span className="tnum"> · {deal.summary}</span>}
            </span>
          ))}
          {listing.deals.length > MAX_DEALS_SHOWN && (
            <span className="text-xs text-subtle-foreground">
              +{listing.deals.length - MAX_DEALS_SHOWN} more
            </span>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <p className="text-xs font-medium text-subtle-foreground">
          {listing.nextSlots.length > 0 ? "Next free times" : "No free times in the next few days"}
        </p>
        {listing.nextSlots.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {listing.nextSlots.map((slot) => (
              <SlotChip
                key={`${slot.start}-${slot.serviceId}-${slot.optionId ?? ""}`}
                slot={slot}
                timeZone={business.timezone}
                currency={currency}
                now={now}
              />
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function SlotChip({
  slot,
  timeZone,
  currency,
  now,
}: {
  slot: NextSlot;
  timeZone: string;
  currency: string;
  now?: Date;
}) {
  const service = slot.optionName ? `${slot.serviceName}, ${slot.optionName}` : slot.serviceName;
  const label = formatSlotLabel(slot.start, timeZone, now);
  const offer = slot.offer;
  return (
    <li
      title={service}
      className={cn(
        "tnum inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        offer
          ? "border-success-border bg-success-soft text-success-soft-foreground"
          : "border-border bg-surface-sunken text-foreground",
      )}
    >
      <span>{label}</span>
      <span className="sr-only">, {service}</span>
      {offer && (
        <>
          <span aria-hidden className="opacity-50">
            ·
          </span>
          <DealPrice
            originalCents={offer.originalPriceCents}
            priceCents={offer.priceCents}
            currency={currency}
            inverted
          />
          <span className="sr-only">, {offer.label}</span>
        </>
      )}
    </li>
  );
}

/** Placeholder with the card's shape. */
export function ListingCardSkeleton() {
  return (
    <div
      aria-hidden
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs sm:p-5"
    >
      <div className="flex items-start gap-3.5">
        <Skeleton className="size-14 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <div className="flex justify-between gap-3">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-14" />
          </div>
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      </div>
      <Skeleton className="h-3.5 w-4/5" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <div className="flex gap-1.5">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}

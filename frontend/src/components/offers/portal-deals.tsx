"use client";

import Link from "next/link";
import { ArrowRight, Tag } from "lucide-react";
import { usePublicOffers } from "@/lib/api/hooks";
import type { PublicBusiness, PublicOffer, PublicService } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { touchHitArea } from "@/components/ui/touch";
import { cn } from "@/lib/utils";
import { DealBadge } from "./deal-price";

/**
 * The business's active deals above the booking flow, for a portal without a site (the site shows them in its own
 * `DealsStrip`). Each deal on a single service links to that service; the flow prices the matching times. Renders
 * nothing while loading, on error or with none.
 */
export function PortalDeals({
  business,
  services,
  initialOffers = null,
  className,
}: {
  business: PublicBusiness;
  services: PublicService[];
  /** From the server render, so the deals are in the first paint. */
  initialOffers?: PublicOffer[] | null;
  className?: string;
}) {
  // Fresh from the server render, like the services: no refetch right after hydration.
  const offers = usePublicOffers(business.slug, {
    initialData: initialOffers ?? undefined,
    staleTime: 60_000,
  });
  // Defensive: an older API without deals answers with something else (or 404).
  const list = Array.isArray(offers.data) ? offers.data : [];
  if (list.length === 0) return null;
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name;
  return (
    <section aria-labelledby="portal-deals-heading" className={cn("flex flex-col gap-3", className)}>
      <h2 id="portal-deals-heading" className="flex items-center gap-2 text-sm font-semibold">
        <Tag className="size-4 text-brand" aria-hidden />
        {list.length === 1 ? "Current deal" : "Current deals"}
      </h2>
      <ul className={cn("grid gap-3", list.length > 1 && "sm:grid-cols-2")}>
        {list.map((o) => {
          const single = o.serviceIds.length === 1 ? o.serviceIds[0] : undefined;
          const only = single ? serviceName(single) : undefined;
          const details = [
            only,
            o.summary,
            o.validUntil && `until ${formatDate(o.validUntil, business.timezone, "short", business.locale)}`,
          ].filter(Boolean);
          return (
            <li key={o.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium text-balance">{o.name}</h3>
                <DealBadge label={o.label} className="shrink-0" />
              </div>
              {o.description && <p className="text-sm text-pretty text-muted-foreground">{o.description}</p>}
              {details.length > 0 && <p className="text-sm text-muted-foreground">{details.join(" · ")}</p>}
              {single && (
                <Link
                  href={`/${encodeURIComponent(business.slug)}/book?service=${encodeURIComponent(single)}`}
                  className={cn(
                    "focus-ring mt-1 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand underline-offset-4 hover:underline",
                    touchHitArea,
                  )}
                >
                  Book {only ?? "now"}
                  <span className="sr-only"> with {o.name}</span>
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

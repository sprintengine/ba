"use client";

import { useWatch } from "react-hook-form";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { formatDuration } from "@/lib/format";
import { durationLabel, priceLabel } from "@/lib/booking/quote";
import type { ServiceFormValues as V } from "@/lib/services/service-form";
import { BusinessThemeProvider } from "@/lib/theme/business-theme";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFmt } from "../../common";

/** What customers will see on the booking page, themed with the business colour. */
export function CustomerPreview() {
  const business = useCurrentBusiness();
  const fmt = useFmt();
  const values = useWatch<V>() as V;
  const priceText = priceLabel(values, fmt.currency, { locale: fmt.locale, capitalize: true });
  const durText = durationLabel(values);
  return (
    <div className="flex flex-col gap-3">
      <span aria-hidden className="text-xs font-medium tracking-wide text-subtle-foreground uppercase">
        Customer preview
      </span>
      <BusinessThemeProvider
        primaryColor={business.branding.primaryColor}
        className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight">{values.name || "Service name"}</p>
            <p className="tnum text-sm text-muted-foreground">{durText}</p>
          </div>
          <span className="tnum shrink-0 text-sm font-semibold">{priceText}</span>
        </div>
        {values.description && (
          <p className="line-clamp-4 text-sm text-muted-foreground">{values.description}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {values.paymentMode === "deposit" && values.depositCents ? (
            <Badge tone="brand">{fmt.money(values.depositCents)} deposit</Badge>
          ) : null}
          {values.paymentMode === "at_venue" && <Badge>Pay at venue</Badge>}
          {(values.paymentMode === "full" || values.paymentMode === "deposit") && values.allowPayAtVenue && (
            <Badge>Or pay at venue</Badge>
          )}
          {values.requiresApproval && <Badge tone="info">Request to book</Badge>}
          {values.capacity > 1 && <Badge>{values.capacity} seats</Badge>}
          {values.locationType === "online" && <Badge>Online</Badge>}
        </div>
        {values.options.length > 0 && (
          <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border">
            {values.options.map((o, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="truncate">{o.name || `Option ${i + 1}`}</span>
                <span className="tnum shrink-0 text-muted-foreground">
                  {formatDuration(o.durationMinutes || 0)} ·{" "}
                  {values.paymentMode === "free" ? "Free" : fmt.price(o.priceCents || 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {values.addons.length > 0 && (
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-subtle-foreground">Extras</span>
            {values.addons.map((a, i) => (
              <span key={i} className="flex justify-between text-muted-foreground">
                <span>+ {a.name || `Add-on ${i + 1}`}</span>
                <span className="tnum">
                  {a.priceCents ? fmt.money(a.priceCents, { signed: true }) : "Free"}
                </span>
              </span>
            ))}
          </div>
        )}
        {/* A picture of the booking button, not a control: hidden from assistive technology. */}
        <Button variant="primary" size="sm" tabIndex={-1} aria-hidden className="pointer-events-none mt-1">
          {values.requiresApproval ? "Request" : "Book"}
        </Button>
      </BusinessThemeProvider>
      {!values.isPublic && (
        <p className="text-xs text-muted-foreground">Private: only your team can book this.</p>
      )}
      {!values.isActive && (
        <p className="text-xs text-muted-foreground">Inactive: hidden and can&apos;t be booked.</p>
      )}
    </div>
  );
}

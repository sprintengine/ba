"use client";

import { useState } from "react";
import { Pause, Pencil, Play, Trash2 } from "lucide-react";
import type { Offer, Service } from "@/lib/api/types";
import { errorMessage } from "@/lib/api/client";
import { useDeleteOffer, usePauseOffer, useResumeOffer } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { OFFER_KIND_LABEL, OFFER_STATE, offerState, redemptionsText } from "@/lib/offers/display";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { toast } from "@/components/ui/toast";
import { withToast } from "@/components/common/with-toast";
import { useFmt } from "@/components/dashboard/common";
import { DealBadge } from "./deal-price";

/** One deal in the Offers list: what, when, how much it's used, and its actions. */
export function OfferCard({
  offer,
  services,
  today,
  onEdit,
}: {
  offer: Offer;
  services: Service[];
  /** `YYYY-MM-DD` in the business timezone. */
  today: string;
  onEdit: () => void;
}) {
  const business = useCurrentBusiness();
  const fmt = useFmt();
  const pause = usePauseOffer(business.id);
  const resume = useResumeOffer(business.id);
  const remove = useDeleteOffer(business.id);
  const state = OFFER_STATE[offerState(offer, today)];
  const paused = offer.status === "paused";
  const [confirming, setConfirming] = useState(false);

  const toggle = async () => {
    try {
      if (paused) {
        await resume.mutateAsync(offer.id);
        toast.success(`${offer.name} resumed`);
      } else {
        await pause.mutateAsync(offer.id);
        toast.success(`${offer.name} paused`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const dates = validDates(offer, (d) => fmt.day(d));
  return (
    <li
      className={cn(
        "flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4",
        paused && "bg-surface-sunken/50",
      )}
    >
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{offer.name}</span>
          <DealBadge label={offer.label} />
          <Badge tone={state.tone} dot>
            {state.label}
          </Badge>
        </span>
        <span className="text-sm text-muted-foreground">
          {OFFER_KIND_LABEL[offer.kind]} · {offer.summary}
        </span>
        <span className="tnum flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{serviceNames(offer.serviceIds, services)}</span>
          <span aria-hidden>·</span>
          <span>{redemptionsText(offer.redemptions, offer.maxRedemptions)}</span>
          {dates && (
            <>
              <span aria-hidden>·</span>
              <span>{dates}</span>
            </>
          )}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
        <Button
          size="sm"
          variant="secondary"
          aria-label={`${paused ? "Resume" : "Pause"} ${offer.name}`}
          loading={pause.isPending || resume.isPending}
          onClick={toggle}
        >
          {paused ? <Play /> : <Pause />}
          {paused ? "Resume" : "Pause"}
        </Button>
        <IconButton label={`Edit ${offer.name}`} onClick={onEdit}>
          <Pencil />
        </IconButton>
        <IconButton label={`Delete ${offer.name}`} variant="danger" onClick={() => setConfirming(true)}>
          <Trash2 />
        </IconButton>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Delete ${offer.name}?`}
          description="It stops applying straight away. Bookings that already have the deal keep their price."
          confirmLabel="Delete offer"
          destructive
          onConfirm={async () => {
            await withToast(() => remove.mutateAsync(offer.id), `${offer.name} deleted`);
          }}
        />
      </div>
    </li>
  );
}

function serviceNames(ids: string[], services: Service[]): string {
  const names = ids.map((id) => services.find((s) => s.id === id)?.name).filter((n): n is string => !!n);
  if (names.length === 0) return `${ids.length} ${ids.length === 1 ? "service" : "services"}`;
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}

function validDates(offer: Offer, date: (d: string) => string): string | null {
  if (offer.validFrom && offer.validUntil) return `${date(offer.validFrom)} – ${date(offer.validUntil)}`;
  if (offer.validFrom) return `From ${date(offer.validFrom)}`;
  if (offer.validUntil) return `Until ${date(offer.validUntil)}`;
  return null;
}

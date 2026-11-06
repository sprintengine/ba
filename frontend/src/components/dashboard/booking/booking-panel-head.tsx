"use client";

import { Copy } from "lucide-react";
import type { Booking } from "@/lib/api/types";
import { cn, copyText } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { touchHitArea } from "@/components/ui/touch";
import { useFmt } from "../common";

/** The head of a booking's panel: who, when, and its status, payment and reference. */
export function BookingPanelName({ booking: b }: { booking: Booking }) {
  return (
    <span className="flex items-center gap-2.5">
      {/* Decorative: the initials would otherwise prefix the dialog's name ("AM Alex Morgan"). */}
      <span aria-hidden className="flex">
        <Avatar name={b.customer.name} size="md" />
      </span>
      <span className="min-w-0 truncate">{b.customer.name}</span>
    </span>
  );
}

export function BookingPanelWhen({ booking: b }: { booking: Booking }) {
  const fmt = useFmt();
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
      <span className="tnum font-medium text-foreground">
        {fmt.date(b.start, "dayMonthYear")} · {fmt.range(b.start, b.end)}
      </span>
    </span>
  );
}

export function BookingPanelBadges({ booking: b }: { booking: Booking }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-2">
      <BookingStatusBadge status={b.status} />
      <PaymentStatusBadge status={b.paymentStatus} />
      <ReferenceChip reference={b.reference} />
    </div>
  );
}

function ReferenceChip({ reference }: { reference: string }) {
  return (
    <Tooltip content="Copy reference">
      <button
        type="button"
        aria-label={`Copy reference ${reference}`}
        onClick={() => {
          void copyText(reference);
          toast.success("Reference copied");
        }}
        className={cn(
          "inline-flex h-5.5 items-center gap-1 rounded-full border border-border px-2 font-mono text-2xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:h-8 pointer-coarse:px-3 pointer-coarse:text-xs",
          touchHitArea,
        )}
      >
        {reference}
        <Copy className="size-3" aria-hidden />
      </button>
    </Tooltip>
  );
}

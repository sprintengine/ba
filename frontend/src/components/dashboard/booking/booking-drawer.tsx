"use client";

import { CircleSlash, Copy } from "lucide-react";
import { useBooking } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { cn, copyText } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsivePanel } from "@/components/ui/responsive-panel";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { touchHitArea } from "@/components/ui/touch";
import { ErrorState } from "@/components/common/feedback";
import { useFmt } from "../common";
import { BookingActionsBar } from "./booking-actions-bar";
import { BookingDetailBody } from "./booking-detail-body";

/** Booking detail: side sheet on desktop, bottom drawer on mobile. */
export function BookingDrawer({
  bookingId,
  open,
  onOpenChange,
}: {
  bookingId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const detail = useBooking(business.id, bookingId ?? "", { enabled: open && !!bookingId });
  const b = detail.data;
  const fmt = useFmt();

  return (
    <ResponsivePanel
      open={open}
      onOpenChange={onOpenChange}
      title={
        b ? (
          <span className="flex items-center gap-2.5">
            {/* Decorative: the initials would otherwise prefix the dialog's name ("AM Alex Morgan"). */}
            <span aria-hidden className="flex">
              <Avatar name={b.customer.name} size="md" />
            </span>
            <span className="min-w-0 truncate">{b.customer.name}</span>
          </span>
        ) : (
          <span className="flex items-center gap-2.5">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-5 w-40" />
            <span className="sr-only">{`${v("booking", { title: true })} details`}</span>
          </span>
        )
      }
      description={
        b ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
            <span className="tnum font-medium text-foreground">
              {fmt.date(b.start, "dayMonthYear")} · {fmt.range(b.start, b.end)}
            </span>
          </span>
        ) : null
      }
      header={
        b ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-2">
            <BookingStatusBadge status={b.status} />
            <PaymentStatusBadge status={b.paymentStatus} />
            <ReferenceChip reference={b.reference} />
          </div>
        ) : null
      }
      // Keyed by booking: the drawer can swap to another (cached) booking while open (⌘K), and the actions' dialogs
      // and the notes draft belong to the one they were started on.
      footer={b ? <BookingActionsBar key={b.id} booking={b} onDone={() => undefined} /> : undefined}
    >
      {/* A failed refresh keeps showing the booking already loaded; the error is for when there is none. */}
      {detail.data ? (
        <BookingDetailBody key={detail.data.id} booking={detail.data} />
      ) : detail.isError ? (
        detail.error.isNotFound || detail.error.isForbidden ? (
          <EmptyState
            icon={<CircleSlash />}
            title={`This ${v("booking")} isn't available`}
            description={`It may have been removed, or it's on a calendar you don't have access to.`}
          />
        ) : (
          <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
        )
      ) : (
        <div className="flex flex-col gap-6" aria-busy>
          <SkeletonText lines={3} />
          <SkeletonText lines={4} />
          <SkeletonText lines={2} />
        </div>
      )}
    </ResponsivePanel>
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

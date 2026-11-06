"use client";

import { CircleSlash } from "lucide-react";
import { useBooking } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsivePanel } from "@/components/ui/responsive-panel";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/feedback";
import { BookingActionsBar } from "./booking-actions-bar";
import { BookingDetailBody } from "./booking-detail-body";
import { BookingPanelBadges, BookingPanelName, BookingPanelWhen } from "./booking-panel-head";

/** Booking detail: an inspector beside the page on desktop, a bottom drawer on mobile. */
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

  return (
    <ResponsivePanel
      inspector
      open={open}
      onOpenChange={onOpenChange}
      title={
        b ? (
          <BookingPanelName booking={b} />
        ) : (
          <span className="flex items-center gap-2.5">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-5 w-40" />
            <span className="sr-only">{`${v("booking", { title: true })} details`}</span>
          </span>
        )
      }
      description={b ? <BookingPanelWhen booking={b} /> : null}
      header={b ? <BookingPanelBadges booking={b} /> : null}
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

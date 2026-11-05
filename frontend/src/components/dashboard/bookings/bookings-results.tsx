"use client";

import { useCallback, useRef } from "react";
import { CalendarPlus, CalendarSearch } from "lucide-react";
import type { Booking } from "@/lib/api/types";
import { useVocabulary } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InfiniteFooter, type InfinitePaging } from "@/components/ui/infinite-footer";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMediaQuery } from "@/components/ui/use-media-query";
import { useBookingActions } from "../booking/booking-actions-provider";
import { BookingRow, MobileRow, MobileSkeletonRow, SkeletonRow } from "./booking-rows";

/** The pieces of `useInfiniteBookings` the results need. */
type Paging = InfinitePaging & { isPending: boolean };

/**
 * The bookings: a scrolling table from iPad landscape up (loads more as you scroll inside it) and a list with "Load
 * more" on phones and iPad portrait, where the table's columns don't fit without clipping the status; an empty state
 * when there are none. Only the one for the screen is rendered (not both, one hidden by CSS).
 */
export function BookingsResults({
  items,
  paging,
  filtered,
}: {
  items: Booking[];
  paging: Paging;
  filtered: boolean;
}) {
  const { v } = useVocabulary();
  const { openBooking, openNewBooking } = useBookingActions();
  const wide = useMediaQuery("(min-width: 1024px)");

  // Infinite scroll inside the table viewport (the list, under lg, has "Load more" instead).
  const scroller = useRef<HTMLDivElement>(null);
  const getScrollRoot = useCallback(() => scroller.current, []);

  if (!paging.isPending && items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface shadow-xs">
        {filtered ? (
          <EmptyState
            headingLevel={2}
            icon={<CalendarSearch />}
            title={`No ${v("bookings")} match`}
            description="Try clearing the search or filters."
          />
        ) : (
          <EmptyState
            headingLevel={2}
            icon={<CalendarPlus />}
            title={`No upcoming ${v("bookings")}`}
            description={`${v("bookings", { title: true })} made on your booking page or added here show up in this list.`}
            action={
              <Button variant="primary" onClick={() => openNewBooking()}>
                <CalendarPlus /> New {v("booking")}
              </Button>
            }
          />
        )}
      </div>
    );
  }

  if (wide) {
    return (
      // Table (iPad landscape and desktop)
      <div
        ref={scroller}
        // A scroll container keyboard users can focus and scroll.
        tabIndex={0}
        role="region"
        aria-label="Results"
        className="relative max-h-[calc(100dvh-15rem)] scrollbar-thin overflow-auto rounded-xl border border-border bg-surface shadow-xs"
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-surface-sunken/95 backdrop-blur-sm">
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>{v("customer", { title: true })}</TableHead>
              <TableHead>Service</TableHead>
              <TableHead className="hidden xl:table-cell">With</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead align="right">Price</TableHead>
              <TableHead className="hidden 2xl:table-cell">Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paging.isPending
              ? Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)
              : items.map((b) => <BookingRow key={b.id} booking={b} onOpen={() => openBooking(b.id)} />)}
          </TableBody>
        </Table>
        <InfiniteFooter
          paging={paging}
          rootMargin="240px"
          getRoot={getScrollRoot}
          endLabel={items.length > 0 ? `${items.length} ${v("booking", { count: items.length })}` : undefined}
          className="h-12"
        />
      </div>
    );
  }

  return (
    <>
      {/* Phone and iPad portrait list */}
      <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        {paging.isPending
          ? Array.from({ length: 6 }, (_, i) => <MobileSkeletonRow key={i} />)
          : items.map((b) => <MobileRow key={b.id} booking={b} onOpen={() => openBooking(b.id)} />)}
      </ul>
      {paging.hasNextPage && (
        <Button
          block
          variant="secondary"
          className="mt-3"
          loading={paging.isFetchingNextPage}
          onClick={() => paging.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </>
  );
}

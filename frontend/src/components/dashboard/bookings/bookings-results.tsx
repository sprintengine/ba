"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { CalendarPlus, Plus, CalendarSearch } from "lucide-react";
import type { Booking } from "@/lib/api/types";
import { useVocabulary } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InfiniteFooter, type InfinitePaging } from "@/components/ui/infinite-footer";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMediaQuery } from "@/components/ui/use-media-query";
import { useBookingActions } from "../booking/booking-actions-provider";
import { useFmt } from "../common";
import {
  BookingRow,
  ClassRow,
  DayRow,
  MobileClassRow,
  MobileDayHeading,
  MobileRow,
  MobileSkeletonRow,
  SkeletonRow,
} from "./booking-rows";
import { groupBookings } from "./group-bookings";

/** The pieces of `useInfiniteBookings` the results need. */
type Paging = InfinitePaging & { isPending: boolean };

/**
 * The bookings, by day, with a class as one row: a scrolling table from iPad landscape up (loads more as you scroll inside it) and a list with "Load
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
  const fmt = useFmt();
  const days = useMemo(() => groupBookings(items, (b) => fmt.date(b.start)), [items, fmt]);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setOpened((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  // Infinite scroll inside the table viewport (the list, under lg, has "Load more" instead).
  const scroller = useRef<HTMLDivElement>(null);
  const getScrollRoot = useCallback(() => scroller.current, []);

  if (!paging.isPending && items.length === 0) {
    return (
      <div>
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
                <Plus /> New {v("booking")}
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
        className="relative max-h-[calc(100dvh-11rem)] scrollbar-thin overflow-auto border-y border-border [&_td]:h-10"
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-surface-sunken/95 backdrop-blur-sm">
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>{v("customer", { title: true })}</TableHead>
              <TableHead>Service</TableHead>
              <TableHead className="hidden xl:table-cell">With</TableHead>
              <TableHead>Needs attention</TableHead>
              <TableHead align="right">Price</TableHead>
              <TableHead className="hidden 2xl:table-cell">Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paging.isPending
              ? Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)
              : days.map((day) => (
                  <Fragment key={day.key}>
                    <DayRow day={day} />
                    {day.slots.map(({ key, bookings }) =>
                      bookings.length === 1 ? (
                        <BookingRow
                          key={key}
                          booking={bookings[0]}
                          onOpen={() => openBooking(bookings[0].id)}
                        />
                      ) : (
                        <Fragment key={key}>
                          <ClassRow bookings={bookings} open={opened.has(key)} onToggle={() => toggle(key)} />
                          {opened.has(key) &&
                            bookings.map((b) => (
                              <BookingRow key={b.id} nested booking={b} onOpen={() => openBooking(b.id)} />
                            ))}
                        </Fragment>
                      ),
                    )}
                  </Fragment>
                ))}
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
      <ul className="flex flex-col divide-y divide-border-subtle border-b border-border">
        {paging.isPending
          ? Array.from({ length: 6 }, (_, i) => <MobileSkeletonRow key={i} />)
          : days.map((day) => (
              <Fragment key={day.key}>
                <MobileDayHeading day={day} />
                {day.slots.map(({ key, bookings }) =>
                  bookings.length === 1 ? (
                    <MobileRow key={key} booking={bookings[0]} onOpen={() => openBooking(bookings[0].id)} />
                  ) : (
                    <Fragment key={key}>
                      <MobileClassRow
                        bookings={bookings}
                        open={opened.has(key)}
                        onToggle={() => toggle(key)}
                      />
                      {opened.has(key) &&
                        bookings.map((b) => (
                          <MobileRow key={b.id} nested booking={b} onOpen={() => openBooking(b.id)} />
                        ))}
                    </Fragment>
                  ),
                )}
              </Fragment>
            ))}
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

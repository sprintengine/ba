"use client";

import { useEffect, useMemo } from "react";
import { Plus } from "lucide-react";
import type { Booking } from "@/lib/api/types";
import { useBookings, useInfiniteBookings, useResources, useServices } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { bookingListQuery, isFilteredView, parseBookingFilters } from "@/lib/dashboard/booking-filters";
import { todayInTz } from "@/lib/format/datetime";
import { useNow } from "@/lib/hooks/use-now";
import { useUrlParams } from "@/lib/hooks/use-url-params";
import { useVocabulary } from "@/lib/vocabulary";
import { ErrorState } from "@/components/common/feedback";
import { ActionButton } from "@/components/ui/action-button";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { useDebouncedSearch } from "@/components/ui/search-input";
import { useBookingActions } from "../booking/booking-actions-provider";
import { BookingsResults } from "./bookings-results";
import { BookingsToolbar } from "./bookings-toolbar";
import { CalendarViewSwitch } from "./calendar-view-switch";
import { BookingViews } from "./booking-views";

const NO_BOOKINGS: Booking[] = [];

/** Filterable, infinitely scrolling list of bookings. Filters live in the URL. */
export function BookingsList() {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const { params, setParams, clearParams } = useUrlParams();
  const { openNewBooking } = useBookingActions();
  const today = todayInTz(business.timezone);

  const filters = parseBookingFilters(params);
  const search = useDebouncedSearch(params.get("q") ?? "");
  const q = search.query;

  // Mirror the debounced search into the URL.
  useEffect(() => {
    if ((params.get("q") ?? "") !== q) setParams({ q: q || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced value
  }, [q]);

  // ⌘K "New booking" lands here with ?new=1.
  useEffect(() => {
    if (params.get("new") === "1") {
      openNewBooking();
      setParams({ new: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when the flag appears
  }, [params.get("new")]);

  const bookings = useInfiniteBookings(business.id, bookingListQuery(filters, q, today));
  const resources = useResources(business.id);
  const services = useServices(business.id);
  const pending = useBookings(business.id, { status: "pending_approval", from: today, limit: 50 });
  const needsYou = pending.data?.items.length ?? 0;
  const loaded = bookings.data ?? NO_BOOKINGS;
  // Upcoming means still to come: what has finished today is on Today and Past.
  const now = useNow(60_000);
  const items = useMemo(
    () =>
      filters.range === "upcoming" && filters.statuses.length === 0
        ? loaded.filter((b) => new Date(b.end) >= now)
        : loaded,
    [loaded, filters.range, filters.statuses.length, now],
  );
  const filtered = isFilteredView(filters, q);
  const reset = () => {
    search.setText("");
    clearParams();
  };

  return (
    // Under the inspector in a small window the list makes room, so the toolbar stays in reach.
    <PageContainer size="wide" className="@container/list max-xl:sm:pr-(--inspector-width,0px)">
      <PageHeader
        title={v("bookings", { title: true })}
        actions={
          <>
            <CalendarViewSwitch />
            <ActionButton
              variant="primary"
              onClick={() => openNewBooking()}
              icon={<Plus />}
              collapse={false}
              label={`New ${v("booking")}`}
              className="@max-[34rem]/list:aspect-square @max-[34rem]/list:px-0 @max-[34rem]/list:[&>span]:sr-only"
            />
          </>
        }
      />
      <div className="flex flex-col gap-2 pb-3 sm:flex-row sm:flex-wrap sm:items-center">
        <BookingViews filters={filters} needsYou={needsYou} setParams={setParams} />
        <BookingsToolbar
          filters={filters}
          search={search.text}
          onSearchChange={search.setText}
          setParams={setParams}
          resources={resources.data ?? []}
          services={services.data ?? []}
          filtered={filtered}
          onReset={reset}
        />
      </div>
      {/* A failed refresh (or next page) keeps the rows already loaded; the error is for when there are none. */}
      {bookings.isError && !bookings.data ? (
        <ErrorState error={bookings.error} onRetry={() => bookings.refetch()} headingLevel={2} />
      ) : (
        <BookingsResults items={items} paging={bookings} filtered={filtered} />
      )}
    </PageContainer>
  );
}

import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { CalendarCheck2 } from "lucide-react-native";
import { useResources } from "@shared/api/hooks/use-resources";
import { useServices } from "@shared/api/hooks/use-services";
import { useCurrentBusiness } from "@shared/business/business-context";
import {
  bookingListQuery,
  isFilteredView,
  parseBookingFilters,
  type BookingFilters,
} from "@shared/dashboard/booking-filters";
import { todayInTz } from "@shared/format";
import { useDebouncedValue } from "@shared/hooks/use-debounced-value";
import { useVocabulary } from "@shared/vocabulary";
import { EmptyState, Screen, SplitView, useLayout } from "~/ui";
import { layout, space } from "~/ui/tokens";
import { useBookingActions } from "./BookingActions";
import { BookingPanel } from "./BookingDetailScreen";
import { BookingFilterBar, DEFAULT_FILTERS } from "./BookingFilters";
import { BookingsList, SearchField } from "./BookingsList";
import { HeaderNew } from "./HeaderNew";
import { useKeyCommand } from "./keys";

type Params = {
  status?: string;
  range?: string;
  resource?: string;
  service?: string;
  q?: string;
  new?: string;
};

/**
 * `/dashboard/[slug]/bookings`: search, filter and manage every booking (`?status=pending_approval` from Today and
 * notifications, `?new=1` opens the form). Phones push a booking; large screens show it beside the list.
 */
export function BookingsScreen() {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const { isWide } = useLayout();
  const params = useLocalSearchParams<Params>();
  const { openBooking, openNewBooking } = useBookingActions();
  const today = todayInTz(business.timezone);
  const [filters, setFilters] = useState<BookingFilters>(() =>
    parseBookingFilters({
      get: (key: string) => (params as Record<string, string | undefined>)[key] ?? null,
    }),
  );
  const [search, setSearch] = useState(params.q ?? "");
  const q = useDebouncedValue(search.trim(), 300);
  const [chosen, setChosen] = useState<string | null>(null);
  const resources = useResources(business.id);
  const services = useServices(business.id);

  // A link with ?status= (Today's "See all", a nudge) replaces the filters, and one with ?q= (an approved agent
  // request's "View booking") the search, while the screen stays mounted.
  const [linked, setLinked] = useState({ status: params.status, q: params.q });
  if (params.status !== linked.status || params.q !== linked.q) {
    setLinked({ status: params.status, q: params.q });
    const status = params.status;
    if (status && status !== linked.status) {
      const statuses = parseBookingFilters({ get: (k) => (k === "status" ? status : null) }).statuses;
      setFilters((f) => ({ ...f, statuses }));
    }
    if (params.q && params.q !== linked.q) setSearch(params.q);
  }
  useEffect(() => {
    if (params.new === "1") {
      openNewBooking();
      router.setParams({ new: undefined });
    }
  }, [params.new, openNewBooking]);

  const newBooking = useCallback(() => openNewBooking(), [openNewBooking]);
  useKeyCommand("n", newBooking);

  const filtered = isFilteredView(filters, q);
  const reset = () => {
    setSearch("");
    setFilters(DEFAULT_FILTERS);
  };
  const open = useCallback((id: string) => (isWide ? setChosen(id) : openBooking(id)), [isWide, openBooking]);

  const header = (
    <View style={styles.header}>
      <SearchField
        testID="bookings-search"
        label={`Search ${v("bookings")}`}
        placeholder="Name, email, phone or reference"
        value={search}
        onChange={setSearch}
      />
      <BookingFilterBar
        filters={filters}
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        resources={resources.data ?? []}
        services={services.data ?? []}
        filtered={filtered}
        onReset={reset}
        today={today}
      />
    </View>
  );

  const list = (
    <BookingsList
      query={bookingListQuery(filters, q, today)}
      header={header}
      filtered={filtered}
      onClearFilters={reset}
      onNew={newBooking}
      onOpen={open}
      selectedId={isWide ? chosen : null}
      showPayment={isWide}
    />
  );

  return (
    <Screen testID="bookings-screen">
      <Stack.Screen
        options={{
          title: v("bookings", { title: true }),
          headerLargeTitle: !isWide,
          headerRight: () => (
            <HeaderNew label={`New ${v("booking")}`} onPress={newBooking} testID="new-booking" />
          ),
        }}
      />
      {isWide ? (
        <SplitView
          list={list}
          detail={
            chosen ? (
              <BookingPanel key={chosen} bookingId={chosen} />
            ) : (
              <EmptyState
                icon={CalendarCheck2}
                title={`Choose a ${v("booking")}`}
                description="Its details and actions show here."
              />
            )
          }
        />
      ) : (
        list
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space[3], padding: space[4], maxWidth: layout.maxContentWidth },
});

import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { CalendarHeart } from "lucide-react-native";
import { useMyBookings } from "@shared/api/hooks/use-me";
import type { CustomerBooking } from "@shared/api/types";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import { businessesIn } from "@shared/booking/booking";
import { Button, EmptyState, ErrorState, SegmentedControl, Skeleton, Text } from "~/ui";
import { layout, radius, space } from "~/ui/tokens";
import { BookingCard } from "./BookingCard";
import { InvitationBanners } from "./InvitationBanners";
import { bookingsFor, isInactive, type BookingsTab } from "./my-bookings";

export type MyBookingsListProps = {
  onOpen: (booking: CustomerBooking) => void;
  /** The booking open beside the list (split view). */
  selectedId?: string | null;
};

/**
 * My bookings: Upcoming / Past with counts, newest data from the cache first (persisted), pull to refresh, refreshed
 * when the screen regains focus. Loading, empty and error states as on the website.
 */
export function MyBookingsList({ onOpen, selectedId }: MyBookingsListProps) {
  const [tab, setTab] = useState<BookingsTab>("upcoming");
  const bookings = useMyBookings();
  const refetch = bookings.refetch;
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  useRefetchOnFocus(refetch);

  const renderItem = useCallback(
    ({ item }: { item: CustomerBooking }) => (
      <BookingCard
        booking={item}
        inactive={isInactive(item, tab)}
        selected={item.id === selectedId}
        onPress={onOpen}
      />
    ),
    [tab, selectedId, onOpen],
  );

  if (bookings.isError && !bookings.data) {
    return <ErrorState error={bookings.error} onRetry={() => void refetch()} />;
  }

  const items = bookings.data ? bookingsFor(bookings.data, tab) : [];
  const header = (
    <View style={styles.header}>
      <InvitationBanners />
      <SegmentedControl
        accessibilityLabel="Bookings"
        value={tab}
        onChange={setTab}
        segments={[
          { value: "upcoming", label: "Upcoming", count: bookings.data?.upcoming.length },
          { value: "past", label: "Past", count: bookings.data?.past.length },
        ]}
      />
    </View>
  );

  return (
    <FlashList
      testID="my-bookings-list"
      data={items}
      extraData={selectedId}
      keyExtractor={(b) => b.id}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={bookings.data ? <Empty tab={tab} past={bookings.data.past} /> : <Loading />}
      ItemSeparatorComponent={Gap}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    />
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

function Loading() {
  return (
    <View
      style={styles.loading}
      accessible
      accessibilityLabel="Loading bookings"
      accessibilityRole="progressbar"
    >
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={132} radius="2xl" />
      ))}
    </View>
  );
}

function Empty({ tab, past }: { tab: BookingsTab; past: CustomerBooking[] }) {
  const previous = businessesIn(past, 4);
  if (tab === "upcoming" && previous.length > 0) {
    return (
      <View testID="my-bookings-empty">
        <EmptyState
          icon={CalendarHeart}
          title="Nothing coming up"
          description="Anything you book with a business on bookanything shows up here, wherever you booked it."
        />
        <View style={styles.again}>
          <Text variant="footnote" tone="subtle">
            Book again with
          </Text>
          {previous.map((b) => (
            <Button
              key={b.slug}
              variant="secondary"
              label={b.name}
              onPress={() => router.push({ pathname: "/[slug]", params: { slug: b.slug } })}
            />
          ))}
          <Button
            variant="ghost"
            label="Find somewhere to book"
            onPress={() => router.navigate("/explore")}
          />
        </View>
      </View>
    );
  }
  return tab === "upcoming" ? (
    <EmptyState
      testID="my-bookings-empty"
      icon={CalendarHeart}
      title="Nothing coming up"
      description="Anything you book with a business on bookanything shows up here, wherever you booked it."
      action={{ label: "Find somewhere to book", onPress: () => router.navigate("/explore") }}
    />
  ) : (
    <EmptyState
      testID="my-bookings-empty"
      icon={CalendarHeart}
      title="No past bookings yet"
      description="Bookings you've had will be listed here."
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: space[4] },
  header: { paddingBottom: space[4], gap: space[3], maxWidth: layout.maxContentWidth },
  gap: { height: space[3] },
  loading: { gap: space[3], borderRadius: radius["2xl"] },
  again: { alignItems: "center", gap: space[2] },
});

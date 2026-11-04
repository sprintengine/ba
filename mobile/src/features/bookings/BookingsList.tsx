import { FlashList } from "@shopify/flash-list";
import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { CalendarPlus, CalendarSearch } from "lucide-react-native";
import { useInfiniteBookings } from "@shared/api/hooks/use-bookings";
import type { Booking, BookingListQuery } from "@shared/api/types";
import { useCurrentBusiness } from "@shared/business/business-context";
import { useVocabulary } from "@shared/vocabulary";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import { Divider, EmptyState, ErrorState, Skeleton, Text, TextField } from "~/ui";
import { space } from "~/ui/tokens";
import { BookingRow } from "./BookingRow";
import { useFmt } from "./fmt";

const NO_BOOKINGS: Booking[] = [];

/**
 * Bookings matching a query, newest page first from the cache, more as you scroll (infinite), pull to refresh,
 * refreshed on focus. The header (search and filters) scrolls with the list.
 */
export function BookingsList({
  query,
  header,
  filtered,
  onClearFilters,
  onNew,
  onOpen,
  selectedId,
  showPayment,
}: {
  query: Omit<BookingListQuery, "cursor">;
  header: React.ReactElement;
  filtered: boolean;
  onClearFilters: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  selectedId?: string | null;
  showPayment?: boolean;
}) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const bookings = useInfiniteBookings(business.id, query);
  const { refreshing, onRefresh } = usePullToRefresh(bookings.refetch);
  useRefetchOnFocus(bookings.refetch);
  const items = bookings.data ?? NO_BOOKINGS;

  const renderItem = useCallback(
    ({ item }: { item: Booking }) => (
      <BookingRow
        booking={item}
        fmt={fmt}
        onOpen={onOpen}
        selected={item.id === selectedId}
        showPayment={showPayment}
      />
    ),
    [fmt, onOpen, selectedId, showPayment],
  );

  const empty = bookings.isError ? (
    <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
  ) : bookings.isPending ? (
    <Loading />
  ) : filtered ? (
    <EmptyState
      testID="bookings-empty"
      icon={CalendarSearch}
      title={`No ${v("bookings")} match`}
      description="Try a wider date range or fewer filters."
      action={{ label: "Clear filters", onPress: onClearFilters }}
    />
  ) : (
    <EmptyState
      testID="bookings-empty"
      icon={CalendarPlus}
      title={`No upcoming ${v("bookings")}`}
      description={`${v("bookings", { title: true })} made on your booking page or added here show up in this list.`}
      action={{ label: `New ${v("booking")}`, onPress: onNew, icon: CalendarPlus }}
    />
  );

  return (
    <FlashList
      testID="bookings-list"
      data={items}
      extraData={selectedId}
      keyExtractor={(b) => b.id}
      renderItem={renderItem}
      ItemSeparatorComponent={Divider}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={
        bookings.isFetchingNextPage ? (
          <ActivityIndicator style={styles.footer} accessibilityLabel={`Loading more ${v("bookings")}`} />
        ) : items.length > 0 && !bookings.hasNextPage ? (
          <Text variant="footnote" tone="subtle" align="center" style={styles.footer}>
            {items.length} {v("booking", { count: items.length })}
          </Text>
        ) : null
      }
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (bookings.hasNextPage && !bookings.isFetchingNextPage) void bookings.fetchNextPage();
      }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    />
  );
}

/** The search box above the filters. */
export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  testID,
}: {
  value: string;
  onChange: (text: string) => void;
  label: string;
  placeholder: string;
  testID?: string;
}) {
  return (
    <TextField
      testID={testID}
      label={label}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      autoCorrect={false}
      autoCapitalize="none"
      returnKeyType="search"
      clearButtonMode="while-editing"
    />
  );
}

function Loading() {
  return (
    <View style={styles.loading} accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton width={36} height={36} radius="full" />
          <View style={styles.flex}>
            <Skeleton height={14} width="60%" />
            <View style={styles.gap} />
            <Skeleton height={12} width="80%" />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { padding: space[4] },
  flex: { flex: 1 },
  loading: { padding: space[4], gap: space[4] },
  skeletonRow: { flexDirection: "row", gap: space[3], alignItems: "center" },
  gap: { height: space[1.5] },
});

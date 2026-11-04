import { FlashList } from "@shopify/flash-list";
import { useCallback, useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { CalendarDays } from "lucide-react-native";
import { useInfiniteBookings } from "@shared/api/hooks/use-bookings";
import type { Booking } from "@shared/api/types";
import { useCurrentBusiness } from "@shared/business/business-context";
import { calendarStatuses } from "@shared/dashboard/calendar";
import { toPlainDate, type PlainDate } from "@shared/format";
import { useVocabulary } from "@shared/vocabulary";
import { usePullToRefresh } from "~/api/use-refresh";
import { EmptyState, ErrorState, Skeleton, Text, useTheme } from "~/ui";
import { space } from "~/ui/tokens";
import { BookingRow } from "~/features/bookings/BookingRow";
import { useFmt } from "~/features/bookings/fmt";

type Item = { type: "day"; date: PlainDate; count: number } | { type: "booking"; booking: Booking };

/** Bookings as day headers and rows, for a list (pure; exported for tests). */
export function agendaItems(bookings: readonly Booking[], timeZone: string): Item[] {
  const items: Item[] = [];
  let current: { date: PlainDate; header: Extract<Item, { type: "day" }> } | null = null;
  for (const b of [...bookings].sort((x, y) => Date.parse(x.start) - Date.parse(y.start))) {
    const date = toPlainDate(b.start, timeZone);
    if (!current || current.date !== date) {
      const header: Extract<Item, { type: "day" }> = { type: "day", date, count: 0 };
      items.push(header);
      current = { date, header };
    }
    if (b.status !== "cancelled") current.header.count += 1;
    items.push({ type: "booking", booking: b });
  }
  return items;
}

/**
 * The agenda: every booking from the chosen day on, day by day, loading more as you scroll (a long recycled list,
 * fast however busy the business is).
 */
export function AgendaList({
  from,
  resourceId,
  showCancelled,
  header,
  onOpen,
}: {
  from: PlainDate;
  resourceId: string;
  showCancelled: boolean;
  header: React.ReactElement;
  onOpen: (id: string) => void;
}) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const { colors } = useTheme();
  const bookings = useInfiniteBookings(business.id, {
    from,
    status: calendarStatuses(showCancelled),
    resourceId: resourceId === "all" ? undefined : resourceId,
    limit: 50,
  });
  const { refreshing, onRefresh } = usePullToRefresh(bookings.refetch);
  const items = useMemo(
    () => agendaItems(bookings.data ?? [], business.timezone),
    [bookings.data, business.timezone],
  );

  const renderItem = useCallback(
    ({ item }: { item: Item }) =>
      item.type === "day" ? (
        <View style={[styles.day, { backgroundColor: colors.background }]} accessibilityRole="header">
          <Text variant="headline">{fmt.relDay(item.date)}</Text>
          <Text variant="footnote" tone="muted">
            {fmt.date(item.date, "long")} · {item.count} {v("booking", { count: item.count })}
          </Text>
        </View>
      ) : (
        <BookingRow booking={item.booking} fmt={fmt} onOpen={onOpen} when="date" />
      ),
    [colors.background, fmt, onOpen, v],
  );

  return (
    <FlashList
      testID="agenda-list"
      data={items}
      keyExtractor={(i) => (i.type === "day" ? `day-${i.date}` : i.booking.id)}
      getItemType={(i) => i.type}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={
        bookings.isError ? (
          <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
        ) : bookings.isPending ? (
          <View
            style={styles.loading}
            accessible
            accessibilityLabel="Loading"
            accessibilityRole="progressbar"
          >
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={64} radius="lg" />
            ))}
          </View>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title={`No ${v("bookings")} from ${fmt.date(from, "dayMonth")}`}
            description="New ones show up here as they come in."
          />
        )
      }
      ListFooterComponent={
        bookings.isFetchingNextPage ? (
          <ActivityIndicator style={styles.footer} accessibilityLabel="Loading more" />
        ) : null
      }
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (bookings.hasNextPage && !bookings.isFetchingNextPage) void bookings.fetchNextPage();
      }}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    />
  );
}

const styles = StyleSheet.create({
  day: { paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[2] },
  loading: { padding: space[4], gap: space[3] },
  footer: { padding: space[4] },
});

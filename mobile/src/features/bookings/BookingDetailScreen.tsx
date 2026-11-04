import { Stack, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { CircleSlash } from "lucide-react-native";
import { isApiError } from "@shared/api/client";
import { useBooking } from "@shared/api/hooks/use-bookings";
import { useCurrentBusiness } from "@shared/business/business-context";
import { useVocabulary } from "@shared/vocabulary";
import { usePullToRefresh } from "~/api/use-refresh";
import { EmptyState, ErrorState, Screen, Skeleton } from "~/ui";
import { space } from "~/ui/tokens";
import { BookingDetail } from "./BookingDetail";

/** One booking by id (from the route, or given by a split view): loading, unavailable and error states. */
export function BookingPanel({ bookingId }: { bookingId: string }) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const detail = useBooking(business.id, bookingId);
  const { refreshing, onRefresh } = usePullToRefresh(detail.refetch);
  if (detail.data) {
    return <BookingDetail booking={detail.data} refreshing={refreshing} onRefresh={() => void onRefresh()} />;
  }
  if (detail.isError) {
    if (isApiError(detail.error) && (detail.error.isNotFound || detail.error.isForbidden)) {
      return (
        <EmptyState
          testID="booking-unavailable"
          icon={CircleSlash}
          title={`This ${v("booking")} isn't available`}
          description="It may have been removed, or it's on a calendar you don't have access to."
        />
      );
    }
    return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  }
  return (
    <View
      style={styles.loading}
      accessible
      accessibilityLabel={`Loading ${v("booking")}`}
      accessibilityRole="progressbar"
    >
      <Skeleton height={48} width="70%" />
      <Skeleton height={20} width="40%" />
      <Skeleton height={44} />
      <Skeleton height={140} radius="2xl" />
      <Skeleton height={120} radius="2xl" />
    </View>
  );
}

/** `/dashboard/[slug]/…/[id]`: a booking on its own screen (phones, and from Today, the calendar or a customer). */
export function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { v } = useVocabulary();
  return (
    <Screen testID="booking-screen">
      <Stack.Screen options={{ title: v("booking", { title: true }) }} />
      <BookingPanel bookingId={id} />
    </Screen>
  );
}

const styles = StyleSheet.create({ loading: { padding: space[4], gap: space[3] } });

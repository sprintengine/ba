import { router, Stack, useLocalSearchParams } from "expo-router";
import { SearchX } from "lucide-react-native";
import { useMyBookings } from "@shared/api/hooks/use-me";
import { EmptyState, ErrorState, Screen, ScreenScroll, Skeleton } from "~/ui";
import { BookingDetail } from "./BookingDetail";
import { findMyBooking } from "./my-bookings";

/** `/my/bookings/[id]`: one booking (phones, and links from notifications). */
export function MyBookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookings = useMyBookings();
  const booking = findMyBooking(bookings.data, id);
  const header = <Stack.Screen options={{ title: booking?.service.name ?? "Booking" }} />;

  if (booking) {
    return (
      <Screen>
        {header}
        <BookingDetail booking={booking} />
      </Screen>
    );
  }
  if (bookings.isError) {
    return (
      <Screen>
        {header}
        <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
      </Screen>
    );
  }
  if (bookings.data) {
    return (
      <Screen testID="booking-not-found">
        {header}
        <EmptyState
          icon={SearchX}
          title="We couldn't find that booking"
          description="It may belong to another account, or it was removed."
          action={{ label: "Back to My bookings", onPress: () => router.navigate("/my/bookings") }}
        />
      </Screen>
    );
  }
  return (
    <Screen>
      {header}
      <ScreenScroll accessibilityLabel="Loading booking">
        <Skeleton height={180} radius="2xl" />
        <Skeleton height={120} radius="2xl" />
      </ScreenScroll>
    </Screen>
  );
}

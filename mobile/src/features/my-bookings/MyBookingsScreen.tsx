import { router, Stack } from "expo-router";
import { useCallback, useState } from "react";
import { CalendarCheck2 } from "lucide-react-native";
import { useMyBookings } from "@shared/api/hooks/use-me";
import type { CustomerBooking } from "@shared/api/types";
import { EmptyState, Screen, SplitView, useLayout } from "~/ui";
import { BookingDetail } from "./BookingDetail";
import { MyBookingsList } from "./MyBookingsList";
import { bookingsFor, findMyBooking } from "./my-bookings";

/**
 * `/my/bookings`. Phones: the list, a booking opens on its own screen. Large screens: list and booking side by side
 * (the first upcoming booking open to start with).
 */
export function MyBookingsScreen() {
  const { isWide } = useLayout();
  const bookings = useMyBookings();
  const [chosen, setChosen] = useState<string | null>(null);

  const open = useCallback(
    (booking: CustomerBooking) => {
      if (isWide) setChosen(booking.id);
      else router.push(`/my/bookings/${booking.id}`);
    },
    [isWide],
  );

  const title = <Stack.Screen options={{ title: "My bookings", headerLargeTitle: !isWide }} />;
  if (!isWide) {
    return (
      <Screen testID="my-bookings">
        {title}
        <MyBookingsList onOpen={open} />
      </Screen>
    );
  }

  const fallback = bookings.data ? bookingsFor(bookings.data, "upcoming")[0] : undefined;
  const selected = (chosen ? findMyBooking(bookings.data, chosen) : undefined) ?? fallback;
  return (
    <Screen testID="my-bookings">
      {title}
      <SplitView
        list={<MyBookingsList onOpen={open} selectedId={selected?.id ?? null} />}
        detail={
          selected ? (
            <BookingDetail booking={selected} />
          ) : (
            <EmptyState icon={CalendarCheck2} title="Choose a booking" description="Its details show here." />
          )
        }
      />
    </Screen>
  );
}

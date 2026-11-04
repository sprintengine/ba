import { BookingActionsProvider } from "~/features/bookings/BookingActions";
import { BusinessStack } from "~/shell/BusinessStack";

/** Bookings: the section's stack, with the booking actions (the new-booking form) its screens use. */
export const unstable_settings = { initialRouteName: "index" };

export default function BookingsLayout() {
  return (
    <BookingActionsProvider section="bookings">
      <BusinessStack />
    </BookingActionsProvider>
  );
}

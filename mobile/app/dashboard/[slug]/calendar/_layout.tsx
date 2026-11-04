import { BookingActionsProvider } from "~/features/bookings/BookingActions";
import { BusinessStack } from "~/shell/BusinessStack";

/** Calendar: the section's stack; bookings open in it, and the new-booking form over it. */
export const unstable_settings = { initialRouteName: "index" };

export default function CalendarLayout() {
  return (
    <BookingActionsProvider section="calendar">
      <BusinessStack />
    </BookingActionsProvider>
  );
}

import { BookingActionsProvider } from "~/features/bookings/BookingActions";
import { BusinessStack } from "~/shell/BusinessStack";

/** Today: the section's stack; bookings open in it (`/dashboard/[slug]/booking/[id]`), new ones over it. */
export const unstable_settings = { initialRouteName: "index" };

export default function OverviewLayout() {
  return (
    <BookingActionsProvider section="overview">
      <BusinessStack />
    </BookingActionsProvider>
  );
}

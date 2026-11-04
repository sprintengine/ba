import { BookingActionsProvider } from "~/features/bookings/BookingActions";
import { BusinessStack } from "~/shell/BusinessStack";

/** Customers: the section's stack; a customer's bookings open in it (`customers/booking/[id]`), new ones over it. */
export const unstable_settings = { initialRouteName: "index" };

export default function CustomersLayout() {
  return (
    <BookingActionsProvider section="customers">
      <BusinessStack />
    </BookingActionsProvider>
  );
}

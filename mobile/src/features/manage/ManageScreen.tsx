import { useLocalSearchParams } from "expo-router";
import { manageContextFrom } from "@shared/booking/manage";
import { Screen } from "~/ui";
import { paramsToSearch } from "~/features/booking/params";
import { ManageBookingView } from "./ManageBookingView";

/**
 * `/manage/[token]`: the booking from an email's link, no account needed (signed in or not). `?booked=1` and
 * `?payment=succeeded|cancelled` (Stripe's return) say how the person got here, as on the website.
 */
export function ManageScreen() {
  const params = useLocalSearchParams<{ token: string }>();
  const context = manageContextFrom(paramsToSearch(params));
  return (
    <Screen testID="manage-screen">
      <ManageBookingView token={params.token} context={context} />
    </Screen>
  );
}

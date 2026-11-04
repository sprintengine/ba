/** My bookings tab: the list and a booking's detail. */
import { Stack } from "expo-router";
import { RequireSignIn } from "~/auth/RequireSignIn";
import { HeaderActions } from "~/shell/HeaderActions";
import { useStackOptions } from "~/shell/stack";

export const unstable_settings = { initialRouteName: "my/bookings/index" };

export default function Layout() {
  const options = useStackOptions();
  return (
    <RequireSignIn>
      <Stack screenOptions={{ ...options, headerRight: () => <HeaderActions /> }} />
    </RequireSignIn>
  );
}

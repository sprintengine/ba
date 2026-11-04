/** Account tab: profile, notifications, connected AI apps, switching to a business, signing out. */
import { Stack } from "expo-router";
import { RequireSignIn } from "~/auth/RequireSignIn";
import { HeaderActions } from "~/shell/HeaderActions";
import { useStackOptions } from "~/shell/stack";

export const unstable_settings = { initialRouteName: "my/index" };

export default function Layout() {
  const options = useStackOptions();
  return (
    <RequireSignIn>
      <Stack screenOptions={{ ...options, headerRight: () => <HeaderActions /> }} />
    </RequireSignIn>
  );
}

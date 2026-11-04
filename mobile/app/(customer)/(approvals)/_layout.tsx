/** Approvals tab: what the customer's AI apps asked to do (architecture §20.9). */
import { Stack } from "expo-router";
import { RequireSignIn } from "~/auth/RequireSignIn";
import { HeaderActions } from "~/shell/HeaderActions";
import { useStackOptions } from "~/shell/stack";

export const unstable_settings = { initialRouteName: "my/approvals/index" };

export default function Layout() {
  const options = useStackOptions();
  return (
    <RequireSignIn>
      <Stack screenOptions={{ ...options, headerRight: () => <HeaderActions /> }} />
    </RequireSignIn>
  );
}

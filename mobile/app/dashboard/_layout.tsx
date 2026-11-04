import { Stack } from "expo-router";
import { RequireSignIn } from "~/auth/RequireSignIn";

/** `/dashboard` (picks a business) and `/dashboard/[slug]/…` (the business experience), signed in. */
export default function DashboardLayout() {
  return (
    <RequireSignIn>
      <Stack screenOptions={{ headerShown: false }} />
    </RequireSignIn>
  );
}

import { Stack } from "expo-router";
import { useStackOptions } from "~/shell/stack";

/** `/onboarding`: its own stack so the full-screen modal has a native header (title, Cancel). */
export default function OnboardingLayout() {
  return <Stack screenOptions={useStackOptions()} />;
}

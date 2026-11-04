/**
 * The stack inside each business section (app/dashboard/[slug]/<section>/_layout.tsx): themed native headers, Bo
 * and the bell on the right, and on phones the business switcher on the left of the section's first screen.
 */
import { Stack, useLocalSearchParams } from "expo-router";
import { useLayout } from "~/ui";
import { BusinessSwitcher } from "./BusinessSwitcher";
import { HeaderActions } from "./HeaderActions";
import { useStackOptions } from "./stack";

export function BusinessStack() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const options = useStackOptions();
  const { isWide } = useLayout();
  return (
    <Stack
      screenOptions={({ route }) => ({
        ...options,
        headerRight: () => <HeaderActions business={slug} />,
        ...(route.name === "index" && !isWide
          ? { headerLeft: () => <BusinessSwitcher current={slug} compact /> }
          : {}),
      })}
    />
  );
}

/** Explore tab: the marketplace, a business's page and its booking flow (the website's /explore, /[slug], /[slug]/book). */
import { Stack } from "expo-router";
import { HeaderActions } from "~/shell/HeaderActions";
import { useStackOptions } from "~/shell/stack";

export const unstable_settings = { initialRouteName: "explore/index" };

export default function Layout() {
  const options = useStackOptions();
  return <Stack screenOptions={{ ...options, headerRight: () => <HeaderActions /> }} />;
}

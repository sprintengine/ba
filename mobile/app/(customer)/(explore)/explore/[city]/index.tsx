import { useLocalSearchParams } from "expo-router";
import { ExploreScreen } from "~/features/explore/ExploreScreen";

/** The website's city pages (`/explore/galway`): Explore around that city. */
export default function ExploreCityScreen() {
  const { city } = useLocalSearchParams<{ city: string }>();
  return <ExploreScreen preset={{ city }} />;
}

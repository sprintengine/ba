import { useLocalSearchParams } from "expo-router";
import { ExploreScreen } from "~/features/explore/ExploreScreen";

/** The website's city and category pages (`/explore/galway/physio`): Explore with both chosen. */
export default function ExploreCityCategoryScreen() {
  const { city, category } = useLocalSearchParams<{ city: string; category: string }>();
  return <ExploreScreen preset={{ city, category }} />;
}

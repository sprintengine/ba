import { Stack } from "expo-router";
import { Hammer } from "lucide-react-native";
import { EmptyState, ScreenScroll, Text } from "~/ui";

export type PlaceholderProps = {
  /** Header title. */
  title: string;
  /** What will be here (one sentence, for people trying the build). */
  description: string;
  /** The feature folder that owns the screen (README.md "Feature areas"). */
  feature: string;
  /** The website page it mirrors, if any. */
  web?: string;
};

/**
 * A screen whose feature isn't built yet. The route, title and navigation are final; the feature agent replaces the
 * body with `src/features/<feature>/…`.
 */
export function Placeholder({ title, description, feature, web }: PlaceholderProps) {
  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScreenScroll testID={`placeholder-${feature}`}>
        <EmptyState icon={Hammer} title={`${title} is coming`} description={description} />
        <Text variant="footnote" tone="subtle" align="center">
          src/features/{feature}
          {web ? ` · web: ${web}` : ""}
        </Text>
      </ScreenScroll>
    </>
  );
}

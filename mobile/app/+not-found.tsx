import { router, Stack } from "expo-router";
import { SearchX } from "lucide-react-native";
import { EmptyState, Screen } from "~/ui";

export default function NotFound() {
  return (
    <Screen testID="not-found">
      <Stack.Screen options={{ title: "Not found", headerShown: true }} />
      <EmptyState
        icon={SearchX}
        title="This page doesn't exist"
        description="The link may be old, or for the website only."
        action={{ label: "Go home", onPress: () => router.replace("/") }}
      />
    </Screen>
  );
}

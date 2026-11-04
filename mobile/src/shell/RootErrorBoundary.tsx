import { useEffect } from "react";
import type { ErrorBoundaryProps } from "expo-router";
import { Bug } from "lucide-react-native";
import { logError } from "~/lib/logger";
import { EmptyState, Screen } from "~/ui";

/**
 * Last resort for a render error in a route (Expo Router's `ErrorBoundary` export): report it and offer a retry
 * instead of a white screen. Data errors don't get here: screens show `<ErrorState>` for those.
 */
export function RootErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => logError(error, { boundary: "route" }), [error]);
  return (
    <Screen testID="route-error">
      <EmptyState
        icon={Bug}
        title="This screen hit a problem"
        description="It has been reported. Try again, and if it keeps happening, restart the app."
        action={{ label: "Try again", onPress: () => void retry() }}
      />
    </Screen>
  );
}

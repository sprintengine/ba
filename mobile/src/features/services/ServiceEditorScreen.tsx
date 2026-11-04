import { router, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";
import { SearchX } from "lucide-react-native";
import { useServices } from "@shared/api/hooks/use-services";
import { useBusinessContext } from "@shared/business/business-context";
import { EmptyState, ErrorState, Screen, Skeleton } from "~/ui";
import { layout, space } from "~/ui/tokens";
import { ServiceEditor } from "./ServiceEditor";
import { NEW_SERVICE } from "./editor";

/**
 * `/dashboard/[slug]/services/[id]` on phones: one service's editor (`new` creates one). Goes back to the list after
 * saving or deleting.
 */
export function ServiceEditorScreen({ id }: { id: string }) {
  const { business } = useBusinessContext();
  const services = useServices(business.id);
  const isNew = id === NEW_SERVICE;
  const service = isNew ? null : services.data?.find((s) => s.id === id);
  // The section's stack always has the list under this screen (`initialRouteName: "index"`), deep links included.
  const back = () => router.back();

  if (!services.data) {
    return (
      <Screen testID="service-screen">
        <Stack.Screen options={{ title: isNew ? "New service" : "Service" }} />
        {services.isError ? (
          <ErrorState error={services.error} onRetry={() => void services.refetch()} />
        ) : (
          <View
            style={styles.loading}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Loading the service"
            testID="service-loading"
          >
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={160} radius="xl" />
            ))}
          </View>
        )}
      </Screen>
    );
  }

  if (service === undefined) {
    return (
      <Screen testID="service-screen">
        <Stack.Screen options={{ title: "Service" }} />
        <EmptyState
          testID="service-missing"
          icon={SearchX}
          title="Service not found"
          description="It may have been deleted."
          action={{ label: "All services", onPress: back }}
        />
      </Screen>
    );
  }

  return (
    <ServiceEditor
      service={service}
      services={services.data}
      onSaved={() => back()}
      onDeleted={() => back()}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    gap: space[4],
    padding: space[4],
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
  },
});

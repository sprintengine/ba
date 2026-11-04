import { router, Stack, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Boxes } from "lucide-react-native";
import { useBusinessContext } from "@shared/business/business-context";
import { useVocabulary } from "@shared/vocabulary";
import { useRefetchOnFocus } from "~/api/use-refresh";
import { HeaderActions } from "~/shell/HeaderActions";
import { EmptyState, ErrorState, Screen, Skeleton } from "~/ui";
import { space } from "~/ui/tokens";
import { ResourceDetail } from "./ResourceDetail";
import { useResourcesData } from "./use-resources-data";

/** `/dashboard/[slug]/resources/[id]`: one resource's weekly hours and time off, on phones (iPad: the split view). */
export function ResourceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const { resources, list } = useResourcesData();
  useRefetchOnFocus(resources.refetch);
  const resource = list.find((r) => r.id === id);
  const back = () =>
    router.canGoBack() ? router.back() : router.replace(`/dashboard/${business.slug}/resources`);

  const header = (
    <Stack.Screen
      options={{
        title: resource?.name ?? v("resource", { title: true }),
        headerLargeTitle: false,
        headerRight: () => <HeaderActions business={business.slug} />,
      }}
    />
  );

  if (resource) {
    return (
      <Screen testID="resource-screen">
        {header}
        <ResourceDetail resource={resource} onDeleted={back} />
      </Screen>
    );
  }
  return (
    <Screen testID="resource-screen">
      {header}
      {resources.isError && !resources.data ? (
        <View style={styles.fill}>
          <ErrorState error={resources.error} onRetry={() => void resources.refetch()} />
        </View>
      ) : resources.data ? (
        <EmptyState
          testID="resource-missing"
          icon={Boxes}
          title={`This ${v("resource")} isn't here any more`}
          description="It may have been deleted."
          action={{ label: `All ${v("resources")}`, onPress: back }}
        />
      ) : (
        <View style={styles.loading} accessible accessibilityRole="progressbar" accessibilityLabel="Loading">
          <Skeleton height={56} radius="lg" />
          <Skeleton height={360} radius="xl" />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { padding: space[4], gap: space[4] },
});

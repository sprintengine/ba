import { router, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";
import { BadgePercent } from "lucide-react-native";
import { useOffers } from "@shared/api/hooks/use-offers";
import { useServices } from "@shared/api/hooks/use-services";
import { useBusinessContext } from "@shared/business/business-context";
import { EmptyState, ErrorState, Screen, Skeleton } from "~/ui";
import { layout, space } from "~/ui/tokens";
import { OfferEditor } from "./OfferEditor";
import { editorServices } from "./offers";

/**
 * `/dashboard/[slug]/offers/[id]` (phones; iPad edits beside the list): an offer's editor, `id` "new" creates one.
 * Saving goes back to the list.
 */
export function OfferEditorScreen({ id, previewDelay }: { id: string; previewDelay?: number }) {
  const { business } = useBusinessContext();
  const offers = useOffers(business.id, { enabled: id !== "new" });
  const services = useServices(business.id);
  const isNew = id === "new";
  const offer = isNew ? null : (offers.data?.find((o) => o.id === id) ?? null);
  const failed = (!isNew && offers.isError && !offers.data) || (services.isError && !services.data);

  if (failed) {
    return (
      <Screen testID="offer-editor-screen">
        <Stack.Screen options={{ title: "Offer" }} />
        <ErrorState
          error={offers.error ?? services.error}
          onRetry={() => {
            if (!isNew) void offers.refetch();
            void services.refetch();
          }}
        />
      </Screen>
    );
  }
  if (!services.data || (!isNew && !offers.data)) {
    return (
      <Screen testID="offer-editor-screen">
        <Stack.Screen options={{ title: isNew ? "New offer" : "Offer" }} />
        <View
          style={styles.loading}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading the offer"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={160} radius="2xl" />
          ))}
        </View>
      </Screen>
    );
  }
  if (!isNew && !offer) {
    return (
      <Screen testID="offer-editor-screen">
        <Stack.Screen options={{ title: "Offer" }} />
        <EmptyState
          icon={BadgePercent}
          title="This offer is gone"
          description="It may have been deleted by someone else on your team."
          action={{ label: "Back to offers", onPress: () => router.back() }}
        />
      </Screen>
    );
  }
  return (
    <OfferEditor
      offer={offer}
      services={editorServices(services.data, offer)}
      variant="screen"
      previewDelay={previewDelay}
      onSaved={() => router.back()}
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

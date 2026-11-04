import { router, Stack, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { CalendarSearch } from "lucide-react-native";
import { usePublicBusiness, usePublicServices } from "@shared/api/hooks/use-public";
import type { ApiError } from "@shared/api/client";
import { parseFlowParams } from "@shared/booking/url";
import { BrandScope, EmptyState, ErrorState, Screen, Skeleton } from "~/ui";
import { space } from "~/ui/tokens";
import { BookingFlow } from "./BookingFlow";
import { paramsToSearch } from "./params";

/**
 * `/[slug]/book`: the business and its services load together (no waterfall), then the flow, in the business's
 * colour. Deep links carry the website's flow parameters (`?service=…&date=…&time=…`).
 */
export function BookScreen() {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = params.slug;
  const business = usePublicBusiness(slug, { staleTime: 60_000 });
  const services = usePublicServices(slug, { staleTime: 60_000 });

  if (business.isError && !business.data) {
    return <BusinessFailed slug={slug} error={business.error} onRetry={() => void business.refetch()} />;
  }
  if (services.isError && !services.data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: business.data?.name ?? "Book" }} />
        <ErrorState
          error={services.error}
          title="We couldn't load the services"
          onRetry={() => void services.refetch()}
        />
      </Screen>
    );
  }
  if (!business.data || !services.data) return <FlowSkeleton />;
  return (
    <BrandScope color={business.data.branding.primaryColor}>
      <BookingFlow
        business={business.data}
        services={services.data}
        initial={parseFlowParams(paramsToSearch(params))}
      />
    </BrandScope>
  );
}

/** A business page or booking flow that failed: "doesn't exist" for a 404, else the error with a retry. */
export function BusinessFailed({
  slug,
  error,
  onRetry,
}: {
  slug: string;
  error: ApiError;
  onRetry: () => void;
}) {
  return (
    <Screen testID="business-failed">
      <Stack.Screen options={{ title: "Book" }} />
      {error.isNotFound ? (
        <EmptyState
          icon={CalendarSearch}
          title="This booking page doesn't exist"
          description={`There's no business at bookanything.ie/${slug}. Check the link you were given.`}
          action={{ label: "Explore businesses", onPress: () => router.navigate("/explore") }}
        />
      ) : (
        <ErrorState error={error} onRetry={onRetry} />
      )}
    </Screen>
  );
}

function FlowSkeleton() {
  return (
    <Screen>
      <Stack.Screen options={{ title: "" }} />
      <View style={styles.skeleton} accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
        <Skeleton height={32} width="60%" />
        <Skeleton height={16} width="80%" />
        <Skeleton height={4} radius="full" />
        <Skeleton height={28} width="45%" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={96} radius="xl" />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeleton: { padding: space[4], paddingTop: space[16] + space[10], gap: space[4] },
});

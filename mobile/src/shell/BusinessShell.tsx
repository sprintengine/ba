/**
 * The business experience (`/dashboard/[slug]/…`): loads the membership and the business, provides the website's
 * business context (`useBusinessContext`, `usePermissions`, `useVocabulary` all work as on the website), and shows
 * the sections the member's role allows (tabs on phones, a sidebar on iPad).
 */
import { router, Tabs, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Building2, UserRound } from "lucide-react-native";
import { useBusiness, useBusinessBySlug } from "@shared/api/hooks/use-business";
import { BusinessContextProvider } from "@shared/business/business-context";
import { VocabularyProvider } from "@shared/vocabulary";
import { AssistantDock } from "~/features/assistant/AssistantDock";
import { EmptyState, ErrorState, ListRow, Screen, Skeleton } from "~/ui";
import { space } from "~/ui/tokens";
import { AdaptiveTabs } from "./AdaptiveTabs";
import { BusinessSwitcher } from "./BusinessSwitcher";
import { BUSINESS_ROUTES, businessNav } from "./nav";
import { rememberVisit, useSignedInMe } from "./session";

export function BusinessShell() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const me = useSignedInMe();
  // Started alongside /me (the website does the same): the URL names the business before the memberships do.
  const bySlug = useBusinessBySlug(slug);
  const membership = me.data?.memberships.find((m) => m.slug === slug);
  const business = useBusiness(membership?.businessId ?? bySlug.data ?? "");

  useEffect(() => {
    if (membership) rememberVisit("business", membership.slug);
  }, [membership]);

  if (me.isError && !me.data) return <Failed error={me.error} retry={() => void me.refetch()} />;
  if (me.data && !membership) {
    return (
      <Screen testID="not-a-member">
        <EmptyState
          icon={Building2}
          title="You're not a member of this business"
          description="Ask its owner to invite you, or switch to one of your own."
          action={{ label: "Go to My bookings", onPress: () => router.replace("/my/bookings") }}
        />
      </Screen>
    );
  }
  if (business.isError && !business.data)
    return <Failed error={business.error} retry={() => void business.refetch()} />;
  if (!me.data || !membership || !business.data) return <Loading />;

  const items = businessNav({
    slug,
    role: membership.role,
    sitesEnabled: !!business.data.sitesEnabled,
    vocabulary: business.data.vocabulary,
  });
  return (
    <BusinessContextProvider value={{ business: business.data, role: membership.role, me: me.data }}>
      <VocabularyProvider vocabulary={business.data.vocabulary}>
        {/* Bo's side panel sits beside the sections on large screens (src/features/assistant/AssistantDock), where
            the deployment offers Bo. */}
        <View style={styles.row}>
          <View style={styles.fill}>
            <AdaptiveTabs
              items={items}
              sidebarHeader={<BusinessSwitcher current={slug} />}
              sidebarFooter={
                <ListRow
                  icon={UserRound}
                  title="My bookings"
                  chevron={false}
                  onPress={() => router.navigate("/my/bookings")}
                />
              }
            >
              {Object.values(BUSINESS_ROUTES).map((name) => (
                <Tabs.Screen key={name} name={name} />
              ))}
            </AdaptiveTabs>
          </View>
          {business.data.assistantAvailable ? <AssistantDock /> : null}
        </View>
      </VocabularyProvider>
    </BusinessContextProvider>
  );
}

function Failed({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <Screen>
      <ErrorState error={error} onRetry={retry} />
    </Screen>
  );
}

function Loading() {
  return (
    <Screen testID="business-loading">
      <View
        style={styles.loading}
        accessible
        accessibilityLabel="Loading business"
        accessibilityRole="progressbar"
      >
        <Skeleton height={28} width="50%" />
        <Skeleton height={120} radius="2xl" />
        <Skeleton height={120} radius="2xl" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { padding: space[4], paddingTop: space[16], gap: space[3] },
  row: { flex: 1, flexDirection: "row" },
  fill: { flex: 1 },
});

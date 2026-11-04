/**
 * The business Bo works for, when Bo opens as a modal over the app (`/assistant?business=<slug>`, outside the business
 * shell): loads the membership and the business and provides the website's business context and vocabulary, as the
 * shell does. On iPad, Bo's side panel sits inside the shell and doesn't need this.
 */
import type { ReactNode } from "react";
import { Building2 } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { useBusiness, useBusinessBySlug } from "@shared/api/hooks/use-business";
import { BusinessContextProvider } from "@shared/business/business-context";
import { VocabularyProvider } from "@shared/vocabulary";
import { useSignedInMe } from "~/shell/session";
import { EmptyState, ErrorState, Screen, Skeleton } from "~/ui";
import { space } from "~/ui/tokens";

export function AssistantBusinessScope({
  slug,
  children,
}: {
  slug: string | undefined;
  children: ReactNode;
}) {
  const me = useSignedInMe();
  const bySlug = useBusinessBySlug(slug ?? "");
  const membership = me.data?.memberships.find((m) => m.slug === slug);
  const business = useBusiness(membership?.businessId ?? bySlug.data ?? "");

  if (me.isError && !me.data) {
    return (
      <Screen>
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </Screen>
    );
  }
  if (!slug || (me.data && !membership)) {
    return (
      <Screen testID="assistant-no-business">
        <EmptyState
          icon={Building2}
          title="Open a business first"
          description="Bo helps run a business you're a member of. Open it, then ask Bo."
        />
      </Screen>
    );
  }
  if (business.isError && !business.data) {
    return (
      <Screen>
        <ErrorState error={business.error} onRetry={() => void business.refetch()} />
      </Screen>
    );
  }
  if (!me.data || !membership || !business.data) {
    return (
      <Screen testID="assistant-loading">
        <View
          style={styles.loading}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading Bo"
        >
          <Skeleton height={28} width="40%" />
          <Skeleton height={96} radius="2xl" />
          <Skeleton height={96} radius="2xl" />
        </View>
      </Screen>
    );
  }
  return (
    <BusinessContextProvider value={{ business: business.data, role: membership.role, me: me.data }}>
      <VocabularyProvider vocabulary={business.data.vocabulary}>{children}</VocabularyProvider>
    </BusinessContextProvider>
  );
}

const styles = StyleSheet.create({ loading: { padding: space[4], gap: space[3] } });

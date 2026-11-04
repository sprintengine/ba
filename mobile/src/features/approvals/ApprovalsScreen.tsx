import { FlashList } from "@shopify/flash-list";
import { router, Stack } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { Bot, Plug } from "lucide-react-native";
import { useMyAgentRequests } from "@shared/api/hooks/use-notifications";
import type { CustomerAgentRequest } from "@shared/api/types";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import { Button, EmptyState, ErrorState, Screen, Skeleton, Text, useLayout } from "~/ui";
import { layout, space } from "~/ui/tokens";
import { RequestCard } from "./RequestCard";

type Row = { kind: "heading"; title: string } | { kind: "request"; request: CustomerAgentRequest };

/** Waiting ones first, then the rest of the week, each under its heading. */
export function approvalRows(items: CustomerAgentRequest[]): Row[] {
  const waiting = items.filter((r) => r.action.status === "pending");
  const decided = items.filter((r) => r.action.status !== "pending");
  const rows: Row[] = [];
  if (waiting.length > 0) {
    rows.push({ kind: "heading", title: "Waiting for you" });
    rows.push(...waiting.map((request) => ({ kind: "request" as const, request })));
  }
  if (decided.length > 0) {
    rows.push({ kind: "heading", title: "This week" });
    rows.push(...decided.map((request) => ({ kind: "request" as const, request })));
  }
  return rows;
}

/**
 * `/my/approvals`: what the customer's AI apps asked to book, move or cancel in the last week, waiting ones first,
 * each with Approve / Decline (architecture §20.9). Refreshed whenever the tab comes back into view.
 */
export function ApprovalsScreen() {
  const { isWide } = useLayout();
  const requests = useMyAgentRequests();
  const refetch = requests.refetch;
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  useRefetchOnFocus(refetch);

  const renderItem = useCallback(
    ({ item }: { item: Row }) =>
      item.kind === "heading" ? (
        <Text variant="headline" accessibilityRole="header" style={styles.heading}>
          {item.title}
        </Text>
      ) : (
        <View style={styles.item}>
          <RequestCard request={item.request} />
        </View>
      ),
    [],
  );

  const header = (
    <View style={styles.header}>
      <Text variant="callout" tone="muted">
        What your AI assistants asked to book, move or cancel for you, and whether it went ahead.
      </Text>
      <Button
        variant="ghost"
        size="sm"
        icon={Plug}
        label="Connected apps"
        onPress={() => router.push("/my/connected-apps")}
      />
    </View>
  );

  const empty = requests.isError ? (
    <ErrorState error={requests.error} onRetry={() => void refetch()} />
  ) : requests.isPending ? (
    <View
      style={styles.loading}
      accessible
      accessibilityLabel="Loading requests"
      accessibilityRole="progressbar"
    >
      <Skeleton height={200} radius="2xl" />
      <Skeleton height={160} radius="2xl" />
    </View>
  ) : (
    <EmptyState
      testID="approvals-empty"
      icon={Bot}
      title="Nothing to approve"
      description="When your AI assistant (Claude, ChatGPT and others) prepares a booking, a move or a cancellation for you, it appears here for you to approve."
      action={{
        label: "Use bookanything in your AI assistant",
        onPress: () => router.push({ pathname: "/connect-ai", params: { server: "customer" } }),
      }}
    />
  );

  return (
    <Screen testID="approvals">
      <Stack.Screen options={{ title: "Approvals", headerLargeTitle: !isWide }} />
      <FlashList
        testID="approvals-list"
        data={requests.data && !requests.isError ? approvalRows(requests.data) : []}
        keyExtractor={(row) => (row.kind === "heading" ? row.title : row.request.action.id)}
        getItemType={(row) => row.kind}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space[4] },
  header: { gap: space[2], paddingBottom: space[2], maxWidth: layout.maxContentWidth },
  heading: { paddingTop: space[4], paddingBottom: space[3], maxWidth: layout.maxContentWidth },
  item: { paddingBottom: space[5], maxWidth: layout.maxContentWidth },
  loading: { gap: space[3] },
});

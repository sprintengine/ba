import { router, Stack, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useMyAgentRequest } from "@shared/api/hooks/use-notifications";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import { Button, ErrorState, Screen, ScreenScroll, Skeleton, Text } from "~/ui";
import { space } from "~/ui/tokens";
import { RequestCard } from "./RequestCard";

/**
 * `/my/approvals/[id]`: where a customer's AI app sends them to approve one request (its approval link, a
 * notification). Opening it prepares the request again on the server (prices, refunds), so it's read fresh each time
 * the screen is shown.
 */
export function ApprovalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const request = useMyAgentRequest(id, { staleTime: 0, meta: { persist: false } });
  const refetch = request.refetch;
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  useRefetchOnFocus(refetch);
  const app = request.data?.app ?? "Your AI assistant";
  const where = request.data ? ` with ${request.data.business.name}` : "";
  return (
    <Screen testID="approval">
      <Stack.Screen options={{ title: "Approve a request" }} />
      <ScreenScroll refreshing={refreshing} onRefresh={() => void onRefresh()}>
        <Text variant="body" tone="muted">
          {request.data?.needsApproval === false
            ? `${app} wants to do this${where}.`
            : `${app} wants to do this${where}. Nothing happens until you approve it.`}
        </Text>
        {request.isError && !request.data ? (
          <View>
            <ErrorState error={request.error} onRetry={() => void refetch()} />
            <View style={styles.back}>
              <Button
                variant="ghost"
                label="All approvals"
                onPress={() => router.navigate("/my/approvals")}
              />
            </View>
          </View>
        ) : request.data ? (
          <RequestCard request={request.data} />
        ) : (
          <View accessible accessibilityLabel="Loading request" accessibilityRole="progressbar">
            <Skeleton height={224} radius="2xl" />
          </View>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({ back: { alignItems: "center", marginTop: space[2] } });

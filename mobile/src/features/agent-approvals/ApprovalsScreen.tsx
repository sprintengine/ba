/**
 * Approvals (architecture §20.8): changes the member's own AI apps (Claude, ChatGPT…) prepared at this business, for
 * them to approve or decline here, signed in. The website's `components/assistant/agent-requests.tsx`.
 */
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Linking, StyleSheet, View } from "react-native";
import { Bot, CircleCheck, Unplug } from "lucide-react-native";
import {
  useAgentRequest,
  useAgentRequests,
  useApproveAgentRequest,
  useDeclineAgentRequest,
} from "@shared/api/hooks/use-assistant";
import { qk } from "@shared/api/query-keys";
import type { AgentRequest } from "@shared/api/types";
import { useCurrentBusiness } from "@shared/business/business-context";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import { EmptyState, ErrorState, Icon, ScreenScroll, Skeleton, Text, useLayout, useToast } from "~/ui";
import { layout, space } from "~/ui/tokens";
import { openWebsite } from "~/lib/links";
import { logError } from "~/lib/logger";
import { useFmt } from "~/features/bookings/fmt";
import { haptics } from "~/features/bookings/haptics";
import { SectionTitle } from "~/features/bookings/parts";
import { dashboardHref } from "~/features/overview/cards";
import { ProposalView } from "./ProposalView";

/**
 * The website's guide to connecting an AI agent to a business (`BUSINESS_AI_HELP_PATH` in
 * `@shared/oauth/app-url`, which can't be imported here: it reads the browser's `window`).
 */
const AI_AGENTS_HELP_PATH = "/help/ai-agents-for-business";

/** Opens a proposal's result link: a page of this business's dashboard (`calendar?date=…`), or a full URL. */
function useOpenResultLink() {
  const { slug } = useCurrentBusiness();
  return (path: string) => {
    if (/^https?:\/\//.test(path)) {
      Linking.openURL(path).catch((e: unknown) => logError(e, { link: "agent-request-result" }));
    } else {
      router.navigate(dashboardHref(slug, path));
    }
  };
}

/** One of the member's AI apps' proposals: from which app and when, what it would change, Approve and Decline. */
export function AgentRequestCard({ request }: { request: AgentRequest }) {
  const business = useCurrentBusiness();
  const fmt = useFmt();
  const toast = useToast();
  const qc = useQueryClient();
  const openLink = useOpenResultLink();
  // Refused because it changed since it was prepared (or can't go ahead): show it as it is now.
  const reload = () => void qc.invalidateQueries({ queryKey: qk.business(business.id).agentRequests() });
  const approve = useApproveAgentRequest(business.id, { onError: reload });
  const decline = useDeclineAgentRequest(business.id);
  const { action, app } = request;
  const pending = action.status === "pending";

  return (
    <View style={styles.request} testID={`agent-request-${action.id}`}>
      <View style={styles.from} accessible>
        <Icon icon={Bot} size={14} color="mutedForeground" />
        <Text variant="footnote" tone="muted" style={styles.flex}>
          {`From ${app} · ${fmt.dateTime(action.createdAt)}`}
        </Text>
      </View>
      <ProposalView
        action={action}
        confirm={approve}
        reject={decline}
        canDecide={!request.appDisconnected}
        retryHint={`Ask ${app} to try again.`}
        formatTime={fmt.time}
        onLink={openLink}
        onDecided={(outcome) => {
          if (outcome === "approved") haptics.success();
          toast.show(
            outcome === "approved" ? "Approved" : "Declined",
            outcome === "approved" ? "success" : "info",
          );
        }}
      />
      {pending && request.appDisconnected ? (
        <Note icon={Unplug} testID="app-disconnected">
          {`${app} was disconnected, so this can't go ahead.`}
        </Note>
      ) : null}
      {pending && !request.needsApproval && !request.appDisconnected ? (
        <Text variant="footnote" tone="muted">
          {`Your business lets agents make this kind of change, so ${app} can also go ahead once you say yes there.`}
        </Text>
      ) : null}
      {action.status === "confirmed" ? (
        <Note icon={CircleCheck}>{`You can go back to ${app}: it can see that this went ahead.`}</Note>
      ) : null}
    </View>
  );
}

function Note({ icon, children, testID }: { icon: typeof Bot; children: string; testID?: string }) {
  return (
    <View style={styles.from} testID={testID}>
      <Icon icon={icon} size={16} color="mutedForeground" />
      <Text variant="footnote" tone="muted" style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

/** `/dashboard/[slug]/approvals`: every change the member's AI agents asked to make here in the last week. */
export function ApprovalsScreen() {
  const business = useCurrentBusiness();
  const { isWide } = useLayout();
  const requests = useAgentRequests(business.id);
  const { refreshing, onRefresh } = usePullToRefresh(requests.refetch);
  useRefetchOnFocus(requests.refetch);
  const items = requests.data ?? [];
  const waiting = items.filter((r) => r.action.status === "pending");
  const decided = items.filter((r) => r.action.status !== "pending");

  return (
    <ScreenScroll
      testID="approvals"
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      contentContainerStyle={styles.content}
    >
      <Stack.Screen options={{ title: "Approvals", headerLargeTitle: !isWide }} />
      <Text tone="muted">
        {`Changes your AI agents asked to make at ${business.name}, and whether they went ahead.`}
      </Text>
      {requests.isError && !requests.data ? (
        <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
      ) : requests.isPending ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState
          testID="approvals-empty"
          icon={Bot}
          title="Nothing to approve"
          description="When your AI agent (Claude, ChatGPT and others) prepares a change here, it appears for you to approve."
          action={{
            label: "Connect your agent",
            variant: "secondary",
            onPress: () => void openWebsite(AI_AGENTS_HELP_PATH),
          }}
        />
      ) : (
        <>
          {waiting.length > 0 ? (
            <View style={styles.section} testID="approvals-waiting">
              <SectionTitle title="Waiting for you" />
              {waiting.map((r) => (
                <AgentRequestCard key={r.action.id} request={r} />
              ))}
            </View>
          ) : null}
          {decided.length > 0 ? (
            <View style={styles.section} testID="approvals-decided">
              <SectionTitle title="This week" />
              {decided.map((r) => (
                <AgentRequestCard key={r.action.id} request={r} />
              ))}
            </View>
          ) : null}
        </>
      )}
    </ScreenScroll>
  );
}

/** `/dashboard/[slug]/approvals/[id]`: where an AI app (or a notification) sends the member to approve one change. */
export function ApprovalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const business = useCurrentBusiness();
  const request = useAgentRequest(business.id, id);
  const { refreshing, onRefresh } = usePullToRefresh(request.refetch);
  const app = request.data?.app ?? "Your AI agent";

  return (
    <ScreenScroll
      testID="approval"
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      contentContainerStyle={styles.content}
    >
      <Stack.Screen options={{ title: "Approve a change" }} />
      <Text tone="muted">
        {request.data?.needsApproval === false
          ? `${app} wants to make this change at ${business.name}.`
          : `${app} wants to make this change at ${business.name}. Nothing happens until you approve it.`}
      </Text>
      {request.data ? (
        <AgentRequestCard request={request.data} />
      ) : request.isError ? (
        <ErrorState error={request.error} onRetry={() => void request.refetch()} />
      ) : (
        <Loading count={1} />
      )}
    </ScreenScroll>
  );
}

function Loading({ count = 2 }: { count?: number }) {
  return (
    <View style={styles.section} accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={200} radius="2xl" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: layout.maxContentWidth },
  section: { gap: space[4] },
  request: { gap: space[2] },
  from: { flexDirection: "row", alignItems: "center", gap: space[1.5] },
  flex: { flex: 1 },
});

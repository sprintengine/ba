/** Bo's home: a greeting, anything that needs attention (nudges), quick actions and recent conversations. */
import { ScrollView, StyleSheet, View } from "react-native";
import { ArrowUpRight, MessageSquare, Sparkles, X } from "lucide-react-native";
import { errorMessage } from "@shared/api/client";
import { useDismissNudge } from "@shared/api/hooks/use-assistant";
import type { Nudge } from "@shared/api/types";
import { ASSISTANT_NAME } from "@shared/assistant/constants";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { dashboardHref } from "@shared/dashboard/nav";
import { formatRelativeDay, formatTime, greetingAt } from "@shared/format";
import { Button, ErrorState, IconButton, ListRow, Skeleton, Text, useTheme, useToast } from "~/ui";
import { radius, space } from "~/ui/tokens";
import { useAssistantControls, useChat } from "./assistant-context";
import { CreditsNotice, NotConfigured } from "./CreditsNotice";
import { QuickActions } from "./QuickActions";

function NudgeCard({ nudge }: { nudge: Nudge }) {
  const { colors } = useTheme();
  const { business } = useBusinessContext();
  const { manageAssistant } = usePermissions();
  const { ask, navigate, state } = useAssistantControls();
  const toast = useToast();
  const dismiss = useDismissNudge(business.id, { onError: (err) => toast.show(errorMessage(err), "danger") });
  const canAsk = !!state?.configured && !state.credits.limitReached;
  const warning = nudge.severity === "warning";
  return (
    <View
      testID={`nudge-${nudge.id}`}
      style={[
        styles.nudge,
        { backgroundColor: colors.surface, borderColor: warning ? colors.warning : colors.border },
      ]}
    >
      <View style={styles.nudgeHead}>
        <View style={[styles.dot, { backgroundColor: warning ? colors.warning : colors.brand }]} />
        <View style={styles.flex}>
          <Text variant="callout" weight="semibold">
            {nudge.title}
          </Text>
          <Text variant="callout" tone="muted">
            {nudge.body}
          </Text>
        </View>
        {manageAssistant ? (
          <IconButton
            icon={X}
            size={18}
            accessibilityLabel={`Dismiss: ${nudge.title}`}
            disabled={dismiss.isPending}
            onPress={() => dismiss.mutate(nudge.id)}
          />
        ) : null}
      </View>
      <View style={styles.nudgeActions}>
        {canAsk ? (
          <Button
            size="sm"
            variant="secondary"
            icon={Sparkles}
            label={`Ask ${ASSISTANT_NAME}`}
            accessibilityHint={nudge.prompt}
            onPress={() => ask(nudge.prompt)}
          />
        ) : null}
        {nudge.action ? (
          <Button
            size="sm"
            variant="ghost"
            icon={ArrowUpRight}
            label={nudge.action.label}
            onPress={() => navigate(dashboardHref(business.slug, nudge.action!.path))}
          />
        ) : null}
      </View>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="caption" tone="subtle" accessibilityRole="header">
      {children.toUpperCase()}
    </Text>
  );
}

export function AssistantHome() {
  const { business, me } = useBusinessContext();
  const { state, stateError, stateLoading, retryState, openThread, navigate } = useAssistantControls();
  const chat = useChat();
  const first = me.user.name?.split(" ")[0];
  const nudges = state?.nudges ?? [];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      testID="assistant-home"
    >
      <View>
        <Text variant="title3">
          {greetingAt(new Date(), business.timezone)}
          {first ? `, ${first}` : ""}.
        </Text>
        <Text variant="callout" tone="muted">
          {nudges.length > 0
            ? `${nudges.length === 1 ? "One thing needs" : `${nudges.length} things need`} a look.`
            : "All quiet. What can I do for you?"}
        </Text>
      </View>

      {stateError && !state ? <ErrorState error={stateError} onRetry={retryState} /> : null}
      {stateLoading ? <Skeleton height={88} radius="xl" /> : null}
      {state && !state.configured ? <NotConfigured /> : null}
      {state?.configured ? (
        <CreditsNotice credits={chat.state.credits ?? state.credits} onNavigate={navigate} />
      ) : null}

      {nudges.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle>Needs attention</SectionTitle>
          {nudges.map((n) => (
            <NudgeCard key={n.id} nudge={n} />
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionTitle>Quick actions</SectionTitle>
        <QuickActions />
      </View>

      {state?.threads.length ? (
        <View style={styles.section}>
          <SectionTitle>Recent conversations</SectionTitle>
          <View>
            {state.threads.slice(0, 6).map((t) => (
              <ListRow
                key={t.id}
                icon={MessageSquare}
                title={t.title || "New conversation"}
                subtitle={`${formatRelativeDay(t.updatedAt, business.timezone)} ${formatTime(t.updatedAt, business.timezone, business.locale)}`}
                onPress={() => openThread(t.id)}
                testID={`thread-${t.id}`}
              />
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space[4], gap: space[6] },
  section: { gap: space[2.5] },
  nudge: { borderWidth: 1, borderRadius: radius.xl, padding: space[3], gap: space[2] },
  nudgeHead: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  dot: { width: 8, height: 8, borderRadius: radius.full, marginTop: space[2] },
  flex: { flex: 1 },
  nudgeActions: { flexDirection: "row", flexWrap: "wrap", gap: space[2], paddingLeft: space[4] },
});

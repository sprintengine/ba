import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { CircleAlert, Scissors, ShieldAlert } from "lucide-react-native";
import type { AssistantAction, AssistantNotice, ChatMessage } from "@shared/api/types";
import { ASSISTANT_NAME } from "@shared/assistant/constants";
import { Icon, Text, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";
import { plainText } from "./plain-text";
import { ProposalCard } from "./ProposalCard";
import { RichText } from "./RichText";
import { ToolActivityList } from "./ToolActivityList";

const NOTICE_ICON = { refusal: ShieldAlert, truncated: Scissors, error: CircleAlert } as const;

function Notice({ notice }: { notice: AssistantNotice }) {
  const { colors } = useTheme();
  const refusal = notice.kind === "refusal";
  return (
    <View
      style={[styles.notice, { backgroundColor: refusal ? colors.muted : colors.warningSoft }]}
      testID={`notice-${notice.kind}`}
    >
      <Icon
        icon={NOTICE_ICON[notice.kind]}
        size={16}
        color={refusal ? "mutedForeground" : "warningSoftForeground"}
      />
      <Text variant="callout" tone={refusal ? "muted" : "warning"} style={styles.flex}>
        {notice.message}
      </Text>
    </View>
  );
}

export type MessageRowProps = {
  message: ChatMessage;
  /** The reply still streaming in. */
  live: boolean;
  onActionUpdated: (action: AssistantAction) => void;
  onNavigate: (href: string) => void;
};

/**
 * One message: the person's in a bubble on the trailing side; Bo's as text with what it did (tools), its proposals
 * and any notice. Memoised: while a reply streams, only the live row re-renders.
 */
export const MessageRow = memo(function MessageRow({
  message,
  live,
  onActionUpdated,
  onNavigate,
}: MessageRowProps) {
  const { colors } = useTheme();
  if (message.role === "user") {
    return (
      <View style={styles.userRow} testID={`message-${message.id}`}>
        <View
          style={[styles.bubble, { backgroundColor: colors.primary }]}
          accessible
          accessibilityLabel={`You said: ${message.text}`}
        >
          <Text style={{ color: colors.primaryForeground }} selectable>
            {message.text}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View
      style={styles.assistant}
      testID={live ? "message-live" : `message-${message.id}`}
      accessibilityState={{ busy: live }}
    >
      <ToolActivityList tools={message.tools} />
      {message.text ? (
        <View accessible accessibilityLabel={`${ASSISTANT_NAME} said: ${plainText(message.text)}`}>
          <RichText text={message.text} />
        </View>
      ) : null}
      {message.actions.map((a) => (
        <ProposalCard key={a.id} action={a} onUpdated={onActionUpdated} onNavigate={onNavigate} />
      ))}
      {message.notice ? <Notice notice={message.notice} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  userRow: { flexDirection: "row", justifyContent: "flex-end" },
  bubble: {
    maxWidth: "85%",
    borderRadius: radius["2xl"],
    borderBottomRightRadius: radius.xs,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  assistant: { gap: space[2.5] },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[2],
    borderRadius: radius.lg,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  flex: { flex: 1 },
});

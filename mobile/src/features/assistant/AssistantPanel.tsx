/**
 * Bo's panel, wherever it is shown (the modal on phones, the side panel on iPad): who Bo is and the credits left, the
 * views (Home, Chat, Memory), the content, and the composer with dictation.
 */
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SquarePen, Volume2, VolumeX, X } from "lucide-react-native";
import { formatCredits } from "@shared/ai/credits";
import { ASSISTANT_NAME } from "@shared/assistant/constants";
import { useCurrentBusiness } from "@shared/business/business-context";
import { IconButton, SegmentedControl, Text, useTheme } from "~/ui";
import { space } from "~/ui/tokens";
import { useAssistantControls, useChat, type AssistantView } from "./assistant-context";
import { AssistantHome } from "./AssistantHome";
import { BoAvatar } from "./BoAvatar";
import { ChatLog } from "./ChatLog";
import { Composer } from "./Composer";
import type { Recognizer } from "./dictation/recognizer";
import { MemoryView } from "./MemoryView";
import { useReadAloud, type ReadAloud } from "./read-aloud";

const VIEWS: { value: AssistantView; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "chat", label: "Chat" },
  { value: "memory", label: "Memory" },
];

export type AssistantPanelProps = {
  /** Show a close button (the iPad panel; the modal has its own header). */
  closable?: boolean;
  /** Tests: a fake speech recogniser. */
  recognizer?: Recognizer;
};

export function AssistantPanel({ closable = false, recognizer }: AssistantPanelProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const business = useCurrentBusiness();
  const { view, setView, mood, state, openThread, close } = useAssistantControls();
  const voice = useReadAloud(business.locale);
  const configured = state?.configured ?? false;
  const credits = state?.credits;

  return (
    <KeyboardAvoidingView
      style={[styles.fill, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? space[16] : 0}
      testID="assistant-panel"
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.identity}>
          <BoAvatar mood={mood} size={36} labelled />
          <View style={styles.flex}>
            <Text variant="headline">{ASSISTANT_NAME}</Text>
            <Text variant="footnote" tone="muted" testID="assistant-subtitle">
              {!state
                ? "Your assistant"
                : !configured
                  ? "AI not connected"
                  : credits
                    ? `${formatCredits(credits.remaining, business.locale)} AI credits left`
                    : "Your assistant"}
            </Text>
          </View>
          <IconButton
            icon={voice.handsFree ? Volume2 : VolumeX}
            accessibilityLabel={voice.handsFree ? "Stop reading replies aloud" : "Read replies aloud"}
            accessibilityState={{ selected: voice.handsFree }}
            color={voice.handsFree ? "brand" : "mutedForeground"}
            onPress={() => voice.setHandsFree(!voice.handsFree)}
            testID="assistant-hands-free"
          />
          <IconButton
            icon={SquarePen}
            accessibilityLabel="New chat"
            disabled={!configured}
            onPress={() => openThread(null)}
            testID="assistant-new-chat"
          />
          {closable ? (
            <IconButton
              icon={X}
              accessibilityLabel={`Close ${ASSISTANT_NAME}`}
              onPress={close}
              testID="assistant-close"
            />
          ) : null}
        </View>
        <SegmentedControl
          segments={VIEWS}
          value={view}
          onChange={setView}
          accessibilityLabel={`${ASSISTANT_NAME} views`}
        />
      </View>

      <View style={styles.fill}>
        {view === "home" ? <AssistantHome /> : null}
        {view === "memory" ? <MemoryView /> : null}
        {view === "chat" ? <ChatLog onTurnEnd={voice.handsFree ? voice.speak : undefined} /> : null}
      </View>

      {view === "memory" ? null : (
        <View
          style={[
            styles.composer,
            { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, space[3]) },
          ]}
        >
          <PanelComposer voice={voice} recognizer={recognizer} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/** The composer, wired to the conversation (only this and the log re-render while a reply streams). */
function PanelComposer({ voice, recognizer }: { voice: ReadAloud; recognizer?: Recognizer }) {
  const business = useCurrentBusiness();
  const chat = useChat();
  const { view, ask, setTyping, state } = useAssistantControls();
  const configured = state?.configured ?? false;
  const credits = chat.state.credits ?? state?.credits;
  const canSend = configured && !!credits && !credits.limitReached;
  return (
    <Composer
      lang={business.locale}
      disabled={!canSend}
      busy={chat.busy}
      placeholder={
        !state
          ? undefined
          : !configured
            ? "AI isn't configured"
            : credits?.limitReached
              ? "Out of AI credits this month"
              : undefined
      }
      onTyping={setTyping}
      onListen={voice.stop}
      unsent={chat.state.unsent}
      recognizer={recognizer}
      onSend={(text) => {
        voice.stop();
        if (view === "chat") chat.send(text);
        else ask(text);
      }}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: space[4],
    paddingTop: space[2],
    paddingBottom: space[3],
    gap: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  identity: { flexDirection: "row", alignItems: "center", gap: space[2] },
  composer: { paddingHorizontal: space[4], paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth },
});

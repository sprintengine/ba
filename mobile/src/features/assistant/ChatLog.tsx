/**
 * The conversation: a recycling list (long threads stay smooth), newest at the bottom and kept in view while a reply
 * streams unless the person scrolled up to read. Bo's thinking indicator and errors sit under the last message.
 *
 * Screen readers: the reply streaming in is marked busy and isn't read word by word; when the turn ends, the finished
 * reply (or what went wrong) is announced once.
 */
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useCallback, useDeferredValue, useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import type { ChatMessage } from "@shared/api/types";
import type { ChatError } from "@shared/assistant/chat-state";
import { ASSISTANT_NAME } from "@shared/assistant/constants";
import { useCurrentBusiness, usePermissions } from "@shared/business/business-context";
import { dashboardHref } from "@shared/dashboard/nav";
import { Button, Skeleton, Text, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";
import { useAssistantControls, useChat } from "./assistant-context";
import { BoAvatar } from "./BoAvatar";
import { CreditsNotice, NotConfigured } from "./CreditsNotice";
import { MessageRow } from "./MessageRow";
import { plainText } from "./plain-text";
import { QuickActions } from "./QuickActions";

/** Within this many points of the end, new words keep the list scrolled to the bottom. */
const STICK_TO_END = 80;

/** Copy for a turn refused before it started (or stopped without a notice), with the way out. */
export function turnErrorTitle(error: ChatError): string {
  if (error.code === "AI_LIMIT_REACHED") return "Out of AI credits for this month";
  if (error.code === "AI_NOT_CONFIGURED") return "AI isn't set up yet";
  return "That didn't go through";
}

function TurnError({ error }: { error: ChatError }) {
  const { colors } = useTheme();
  const business = useCurrentBusiness();
  const { manageBilling } = usePermissions();
  const { navigate } = useAssistantControls();
  return (
    <View
      accessibilityRole="alert"
      testID="turn-error"
      style={[styles.error, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}
    >
      <Text variant="callout" weight="semibold" tone="warning">
        {turnErrorTitle(error)}
      </Text>
      <Text variant="callout" tone="warning">
        {error.message}
      </Text>
      {error.code === "AI_LIMIT_REACHED" && manageBilling ? (
        <Button
          size="sm"
          variant="ghost"
          label="See usage and plans"
          onPress={() => navigate(dashboardHref(business.slug, "settings/billing"))}
        />
      ) : null}
    </View>
  );
}

/** The error to show under the log: a request refused before it started, or a turn that failed without a notice. */
function shownError(messages: ChatMessage[], error: ChatError | null, idle: boolean): ChatError | null {
  if (!error) return null;
  return error.during === "request" || (idle && !messages.at(-1)?.notice) ? error : null;
}

export function ChatLog({ onTurnEnd }: { onTurnEnd?: (reply: string) => void }) {
  const chat = useChat();
  const { mood, state, navigate } = useAssistantControls();
  const { messages: liveMessages, state: chatState } = chat;
  // Streamed words arrive many times a second; React may skip intermediate frames under load.
  const messages = useDeferredValue(liveMessages);
  const list = useRef<FlashListRef<ChatMessage>>(null);
  const atEnd = useRef(true);
  const idle = chatState.status === "idle";
  const error = shownError(messages, chatState.error, idle);
  const credits = chatState.credits ?? state?.credits;

  // A turn ended: announce the reply (or the failure) once, and hand it to read-aloud.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (!idle) {
      wasBusy.current = true;
      return;
    }
    if (!wasBusy.current) return;
    wasBusy.current = false;
    const last = liveMessages.at(-1);
    if (chatState.error) {
      AccessibilityInfo.announceForAccessibility(
        `${turnErrorTitle(chatState.error)}. ${chatState.error.message}`,
      );
    } else if (last?.role === "assistant" && last.text) {
      AccessibilityInfo.announceForAccessibility(`${ASSISTANT_NAME} said: ${plainText(last.text)}`);
      onTurnEnd?.(last.text);
    }
  }, [idle, liveMessages, chatState.error, onTurnEnd]);

  useEffect(() => {
    if (chatState.status === "sending")
      AccessibilityInfo.announceForAccessibility(`${ASSISTANT_NAME} is thinking`);
  }, [chatState.status]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    atEnd.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - STICK_TO_END;
  }, []);

  const onContentSizeChange = useCallback(() => {
    if (atEnd.current) list.current?.scrollToEnd({ animated: false });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <MessageRow
        message={item}
        live={item.id === "live-reply"}
        onActionUpdated={chat.actionUpdated}
        onNavigate={navigate}
      />
    ),
    [chat.actionUpdated, navigate],
  );

  if (chat.loading) {
    return (
      <View
        style={styles.loading}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading conversation"
      >
        <View style={styles.end}>
          <Skeleton height={40} width="66%" radius="2xl" />
        </View>
        <Skeleton height={88} width="85%" radius="xl" />
      </View>
    );
  }

  const configured = state?.configured ?? true;
  if (messages.length === 0 && !error) {
    return (
      <View style={styles.welcome} testID="chat-empty">
        {!configured ? <NotConfigured /> : null}
        <BoAvatar mood={mood} size={64} />
        <Text variant="headline" align="center">
          What can I help with?
        </Text>
        <Text variant="callout" tone="muted" align="center" style={styles.welcomeText}>
          Ask about your schedule, find a free slot, or tell me what to change. I&apos;ll show you every
          change before it happens.
        </Text>
        <QuickActions centred />
      </View>
    );
  }

  const waiting =
    chatState.status === "sending" ||
    (chatState.status === "streaming" &&
      !chatState.pending?.reply.text &&
      !chatState.pending?.reply.tools.length);

  return (
    <FlashList
      ref={list}
      data={messages}
      keyExtractor={(m) => m.id}
      renderItem={renderItem}
      getItemType={(m) => m.role}
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={Separator}
      onScroll={onScroll}
      scrollEventThrottle={64}
      onContentSizeChange={onContentSizeChange}
      maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      accessibilityLabel={`Conversation with ${ASSISTANT_NAME}`}
      testID="chat-log"
      ListHeaderComponent={!configured ? <NotConfigured /> : null}
      ListFooterComponent={
        <View style={styles.footer}>
          {waiting ? (
            <View style={styles.thinking} accessibilityRole="progressbar" testID="assistant-thinking">
              <BoAvatar mood="thinking" size={28} />
              <Text variant="callout" tone="muted">
                {ASSISTANT_NAME} is thinking…
              </Text>
            </View>
          ) : null}
          {error ? <TurnError error={error} /> : null}
          {configured && credits ? <CreditsNotice credits={credits} onNavigate={navigate} /> : null}
        </View>
      }
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  content: { padding: space[4] },
  separator: { height: space[5] },
  footer: { gap: space[3], paddingTop: space[4] },
  thinking: { flexDirection: "row", alignItems: "center", gap: space[2] },
  error: { borderWidth: 1, borderRadius: radius.xl, padding: space[3], gap: space[1] },
  loading: { padding: space[4], gap: space[4] },
  end: { alignItems: "flex-end" },
  welcome: { flex: 1, alignItems: "center", justifyContent: "center", gap: space[3], padding: space[6] },
  welcomeText: { maxWidth: 320 },
});

/**
 * The message box, with dictation. Return doesn't send (it adds a line, as in Messages); the Send button does.
 *
 * The microphone: tap to dictate until tapped again, or hold to talk and let go. Words appear in the box as they are
 * heard, after anything already typed; editing the text or pressing Send stops listening. Nothing is ever sent without
 * Send, so the person always sees what was heard.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ArrowUp, Mic, Square } from "lucide-react-native";
import { ASSISTANT_NAME } from "@shared/assistant/constants";
import { Button, Icon, MessageField, Text, useTheme } from "~/ui";
import { MIN_TOUCH, radius, space } from "~/ui/tokens";
import { HOLD_MS, dictatedDraft, joinDictation } from "./dictation/dictation-logic";
import type { Recognizer } from "./dictation/recognizer";
import { useDictation, type Dictation } from "./dictation/useDictation";

export const MAX_MESSAGE = 2000;

export type ComposerProps = {
  onSend: (text: string) => void;
  disabled: boolean;
  busy: boolean;
  placeholder?: string;
  /** The business's locale: what dictation listens for. */
  lang: string;
  onTyping?: (typing: boolean) => void;
  /** Dictation started (Bo stops reading aloud). */
  onListen?: () => void;
  /** A message refused before Bo saw it: its words come back into an empty box. */
  unsent?: { id: string; text: string } | null;
  /** Tests: a fake recogniser. */
  recognizer?: Recognizer;
};

export function Composer({
  onSend,
  disabled,
  busy,
  placeholder = `Ask ${ASSISTANT_NAME} anything…`,
  lang,
  onTyping,
  onListen,
  unsent = null,
  recognizer,
}: ComposerProps) {
  const { colors } = useTheme();
  const [text, setText] = useState("");
  const [restored, setRestored] = useState(unsent?.id);
  if (unsent && unsent.id !== restored) {
    setRestored(unsent.id);
    if (!text) setText(unsent.text);
  }
  const dictation = useDictation({
    lang,
    recognizer,
    onText: (words) => setText((typed) => joinDictation(typed, words)),
  });
  const listening = dictation.active;
  const shown = dictatedDraft(text, dictation.interim);

  useEffect(() => {
    onTyping?.(listening);
    if (listening) onListen?.();
  }, [listening, onTyping, onListen]);

  const canSend = !disabled && !busy && shown.trim().length > 0;
  const submit = () => {
    const value = shown.trim().slice(0, MAX_MESSAGE);
    if (!value || disabled || busy) return;
    dictation.cancel();
    onSend(value);
    setText("");
    onTyping?.(false);
  };

  return (
    <View style={styles.root} testID="assistant-composer">
      <View style={styles.field}>
        <View style={styles.flex}>
          <MessageField
            accessibilityLabel={`Message ${ASSISTANT_NAME}`}
            accessibilityHint={listening ? "Listening. Editing stops dictation." : undefined}
            value={shown}
            editable={!disabled}
            maxLength={MAX_MESSAGE}
            placeholder={
              listening
                ? dictation.state.status === "starting"
                  ? "Starting the microphone…"
                  : `Listening ${dictation.state.source ?? ""}…`
                : placeholder
            }
            onChangeText={(value) => {
              // Editing takes over from dictation: the words heard so far are already in the edited text.
              dictation.cancel();
              dictation.dismissError();
              setText(value);
              onTyping?.(value.length > 0);
            }}
            onBlur={() => {
              if (!listening) onTyping?.(false);
            }}
            testID="assistant-input"
          />
        </View>
        <DictationButton dictation={dictation} disabled={disabled} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend, busy }}
          disabled={!canSend}
          onPress={submit}
          testID="assistant-send"
          style={({ pressed }) => [
            styles.round,
            {
              backgroundColor: canSend ? (pressed ? colors.primaryPressed : colors.primary) : colors.muted,
            },
          ]}
        >
          <Icon icon={ArrowUp} size={20} color={canSend ? "primaryForeground" : "subtleForeground"} />
        </Pressable>
      </View>
      <DictationStatus dictation={dictation} />
    </View>
  );
}

/** The microphone: outlined at rest, filled while it listens. */
function DictationButton({ dictation, disabled }: { dictation: Dictation; disabled: boolean }) {
  const { colors } = useTheme();
  const live = dictation.active;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={live ? "Stop dictating" : "Dictate"}
      accessibilityHint={
        live ? "Stops listening and keeps what was heard." : "Speak instead of typing. Or hold to talk."
      }
      accessibilityState={{ disabled, busy: dictation.state.status === "starting", selected: live }}
      disabled={disabled}
      onPress={dictation.tap}
      onLongPress={dictation.hold}
      delayLongPress={HOLD_MS}
      onPressOut={dictation.release}
      testID="assistant-mic"
      style={({ pressed }) => [
        styles.round,
        {
          backgroundColor: live ? colors.brand : pressed ? colors.muted : colors.surface,
          borderColor: live ? colors.brand : colors.borderStrong,
          borderWidth: 1,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Icon
        icon={live ? Square : Mic}
        size={live ? 16 : 20}
        color={live ? "brandForeground" : "foreground"}
      />
    </Pressable>
  );
}

/** What dictation is doing, or why it stopped (announced). */
function DictationStatus({ dictation }: { dictation: Dictation }) {
  const { state } = dictation;
  if (state.error) {
    return (
      <View style={styles.status} accessibilityLiveRegion="polite">
        <Text
          variant="footnote"
          tone={state.error.tone === "quiet" ? "muted" : "danger"}
          style={styles.flex}
          testID="dictation-error"
        >
          {state.error.message}
        </Text>
        {state.error.settings ? (
          <Button size="sm" variant="ghost" label="Open Settings" onPress={dictation.openSettings} />
        ) : null}
      </View>
    );
  }
  if (state.status === "listening") {
    return (
      <View style={styles.status}>
        <Text variant="footnote" tone="muted" testID="dictation-status">
          {state.mode === "hold"
            ? "Listening while you hold the microphone."
            : "Listening. Tap the microphone to stop; nothing is sent until you press Send."}
        </Text>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  root: { gap: space[1] },
  field: { flexDirection: "row", alignItems: "flex-end", gap: space[2] },
  flex: { flex: 1 },
  round: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  status: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: MIN_TOUCH / 2 },
});

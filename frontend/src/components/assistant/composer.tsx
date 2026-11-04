"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { ASSISTANT_NAME } from "@/lib/assistant/constants";
import { heardText, joinText } from "@/lib/assistant/dictation";
import { useDictation, type Dictation } from "@/lib/assistant/use-dictation";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/icon-button";
import { Textarea } from "@/components/ui/textarea";
import { DictationButton, DictationStatus } from "./dictation";

/**
 * The message box: Enter sends, Shift+Enter adds a line. Typing (or dictating) makes Bo listen.
 *
 * Where the browser recognises speech, a microphone sits next to Send: the words appear in the box as they are heard,
 * after anything already typed. The microphone again, Escape, or editing the text stops listening; Send sends the box
 * as shown. Nothing is ever sent without Send, so the owner always checks what was heard.
 */
export function Composer({
  onSend,
  disabled,
  busy,
  placeholder = `Ask ${ASSISTANT_NAME} anything…`,
  onTyping,
  unsent = null,
  dictation: fixedDictation,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  busy: boolean;
  placeholder?: string;
  onTyping: (typing: boolean) => void;
  /** A sent message that was refused before Bo saw it: its words come back into an empty box. */
  unsent?: { id: string; text: string } | null;
  /** A fixed dictation state, for the /dev/ui/bo preview. Defaults to the browser's speech recognition. */
  dictation?: Dictation;
}) {
  const [text, setText] = useState("");
  const [restored, setRestored] = useState(unsent?.id);
  if (unsent && unsent.id !== restored) {
    setRestored(unsent.id);
    if (!text) setText(unsent.text);
  }
  const browserDictation = useDictation({ onEnd: (heard) => setText((typed) => joinText(typed, heard)) });
  const dictation = fixedDictation ?? browserDictation;
  const { listening, stop } = dictation;
  const shown = listening ? joinText(text, heardText(dictation.heard)) : text;
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => onTyping(listening), [listening, onTyping]);

  useEffect(() => {
    if (!listening) return;
    // Window capture runs before the panel's own Escape handling, so Escape stops listening without closing Bo.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      stop();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, stop]);

  useEffect(() => {
    // Keep the newest words in view once the box reaches its maximum height.
    if (listening && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [listening, shown]);

  const submit = () => {
    const value = shown.trim();
    if (!value || disabled || busy) return;
    dictation.cancel(); // what was heard is already in `value`
    onSend(value);
    setText("");
    onTyping(false);
  };

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="relative flex">
        <Textarea
          ref={box}
          aria-label={`Message ${ASSISTANT_NAME}`}
          rows={1}
          maxLength={2000}
          value={shown}
          disabled={disabled}
          placeholder={listening ? "Listening…" : placeholder}
          className={cn(
            "min-h-11 resize-none pr-12 pointer-coarse:min-h-13 pointer-coarse:pr-14",
            dictation.supported && "pr-21 pointer-coarse:pr-25",
          )}
          onChange={(e) => {
            // Editing takes over from dictation: the words heard so far are already in the edited text.
            dictation.cancel();
            dictation.clearError();
            setText(e.target.value);
            onTyping(e.target.value.length > 0);
          }}
          onBlur={() => {
            if (!listening) onTyping(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="absolute right-1.5 bottom-1.5 flex items-center gap-1 pointer-coarse:right-1 pointer-coarse:bottom-1">
          {dictation.supported && <DictationButton dictation={dictation} disabled={disabled} />}
          <IconButton
            type="submit"
            label="Send"
            tooltip={false}
            variant="primary"
            size="sm"
            className="pointer-coarse:size-11"
            disabled={disabled || busy || !shown.trim()}
            loading={busy}
          >
            <ArrowUp />
          </IconButton>
        </div>
      </div>
      {dictation.supported && <DictationStatus dictation={dictation} />}
    </form>
  );
}

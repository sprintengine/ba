"use client";

import { useState } from "react";
import { CircleAlert, Mic, Square } from "lucide-react";
import { DICTATION_ERROR_MESSAGE } from "@/lib/assistant/dictation";
import type { Dictation } from "@/lib/assistant/use-dictation";
import { IconButton } from "@/components/ui/icon-button";

/** The composer's microphone: a toggle (aria-pressed) that turns into a stop square while listening. */
export function DictationButton({ dictation, disabled }: { dictation: Dictation; disabled: boolean }) {
  const { listening } = dictation;
  return (
    <IconButton
      label="Dictate"
      aria-pressed={listening}
      size="sm"
      className="aria-pressed:bg-brand-soft aria-pressed:text-brand-soft-foreground pointer-coarse:size-11"
      // Never disabled mid-session: it is the way to stop.
      disabled={disabled && !listening}
      // Straight from the tap: Safari only starts recognition inside a user gesture.
      onClick={listening ? dictation.stop : dictation.start}
    >
      {listening ? <Square className="fill-current" /> : <Mic />}
    </IconButton>
  );
}

/** Seconds of delay per bar of the listening wave (`.bo-wave-bar` in globals.css: CSS, so no animation library). */
const BARS = [0, 0.18, 0.36, 0.18];

/**
 * Under the box while listening: a quiet wave (still under reduced motion) and a reminder that nothing goes to the
 * assistant until Send. Errors show here too; screen readers hear "listening" and "stopped" through a status region.
 */
export function DictationStatus({ dictation }: { dictation: Dictation }) {
  const { listening, error } = dictation;
  const [listened, setListened] = useState(false);
  if (listening && !listened) setListened(true);
  const announcement = listening ? "Listening. Speak now." : listened ? "Stopped listening." : "";

  return (
    <>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {listening && (
        <p aria-hidden className="mt-2 flex animate-fade-in items-center gap-2 text-xs text-muted-foreground">
          <span className="flex h-3 items-center gap-0.5">
            {BARS.map((delay, i) => (
              <span
                key={i}
                className="bo-wave-bar h-3 w-0.5 rounded-full bg-brand"
                style={{ animationDelay: `${delay}s` }}
              />
            ))}
          </span>
          Listening… nothing is sent until you press Send.
        </p>
      )}
      {error && !listening && (
        <p
          role="alert"
          className="mt-2 flex animate-fade-in items-start gap-1.5 text-xs leading-5 font-medium text-danger-soft-foreground"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{DICTATION_ERROR_MESSAGE[error]}</span>
        </p>
      )}
    </>
  );
}

"use client";

import { ASSISTANT_NAME } from "@/lib/assistant/constants";
import { NOTHING_HEARD } from "@/lib/assistant/dictation";
import { BO_MOODS, MOOD_LABEL } from "@/lib/assistant/mood";
import type { Dictation } from "@/lib/assistant/use-dictation";
import { BoCharacter } from "@/components/assistant/bo-character";
import { Composer } from "@/components/assistant/composer";

const noop = () => {};

const fixed = (state: Partial<Dictation>): Dictation => ({
  supported: true,
  listening: false,
  heard: NOTHING_HEARD,
  error: null,
  start: noop,
  stop: noop,
  cancel: noop,
  clearError: noop,
  ...state,
});

/** The composer's dictation states; "Live" uses the browser's own speech recognition (no microphone in Firefox). */
const DICTATION_STATES: { name: string; dictation?: Dictation }[] = [
  { name: "Ready", dictation: fixed({}) },
  {
    name: "Listening",
    dictation: fixed({
      listening: true,
      heard: { final: "Move Robin's appointment", interim: "to Friday at ten" },
    }),
  },
  { name: "Microphone blocked", dictation: fixed({ error: "not-allowed" }) },
  { name: "Live" },
];

/** Bo in every mood and the composer's dictation states, light and dark (dev only; design review and screenshots). */
export default function BoGallery() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{ASSISTANT_NAME}</h1>
      {(["light", "dark"] as const).map((mode) => (
        <section
          key={mode}
          data-mode={mode}
          className="flex flex-col gap-6 rounded-2xl border border-border bg-background p-4 text-foreground sm:p-6"
          aria-label={`${mode} mode`}
        >
          <ul className="grid grid-cols-3 gap-6 sm:grid-cols-6">
            {BO_MOODS.map((mood) => (
              <li
                key={mood}
                data-testid={`bo-${mode}-${mood}`}
                className="flex flex-col items-center gap-3 rounded-xl bg-surface p-4 shadow-xs ring-1 ring-border"
              >
                <BoCharacter mood={mood} size={88} labelled />
                <span className="text-sm font-medium capitalize">{mood}</span>
                <span className="text-xs text-muted-foreground">{MOOD_LABEL[mood]}</span>
              </li>
            ))}
          </ul>
          <ul className="grid gap-4 sm:grid-cols-2" aria-label={`Dictation, ${mode} mode`}>
            {DICTATION_STATES.map(({ name, dictation }) => (
              <li
                key={name}
                data-testid={`dictation-${mode}-${name.toLowerCase().replace(/ /g, "-")}`}
                className="flex flex-col gap-2 rounded-xl bg-surface-raised p-4 shadow-xs ring-1 ring-border"
              >
                <span className="text-sm font-medium">{name}</span>
                <Composer disabled={false} busy={false} onSend={noop} onTyping={noop} dictation={dictation} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

/**
 * Dictation for Bo's composer: the browser's Web Speech API, typed locally (TypeScript's DOM lib has the result and
 * event types but not the recogniser itself), and the pure helpers `useDictation` builds on.
 *
 * Privacy: we never record, upload or store audio. The browser does the recognition: Chrome and Edge send the audio
 * to their speech services (Google's in Chrome, Microsoft's in Edge), Safari to Apple's (on the device where the
 * hardware allows). We only see the text it hands back, which goes into the message box like typed text, and nothing
 * is sent to Bo until the owner presses Send.
 *
 * Support: Chrome and Edge (desktop and Android), Safari 14.5+ on macOS, iOS and iPadOS (needs Siri & Dictation
 * enabled on the device). Firefox has no recogniser, so the microphone button is not shown there.
 */
import { DEFAULT_LOCALE } from "@/lib/format";

export type RecognitionAlternative = { readonly transcript: string };

export type RecognitionResult = {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative | undefined;
};

export type RecognitionResultList = {
  readonly length: number;
  readonly [index: number]: RecognitionResult | undefined;
};

export type RecognitionResultEvent = {
  readonly resultIndex: number;
  readonly results: RecognitionResultList;
};

export type RecognitionErrorEvent = { readonly error: string; readonly message?: string };

/** The parts of `SpeechRecognition` we use. */
export type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type RecognitionConstructor = new () => Recognition;

type SpeechWindow = {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

/** The browser's recogniser (prefixed in Safari and Chrome), or null on the server and in Firefox. */
export function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** The language to listen for: the page's (`<html lang>`), else en-IE. */
export function dictationLanguage(): string {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  return document.documentElement.lang || DEFAULT_LOCALE;
}

/** What has been heard in one dictation session: settled words, and the words still being recognised. */
export type Heard = { final: string; interim: string };

export const NOTHING_HEARD: Heard = { final: "", interim: "" };

/** Joins two pieces of text with one space, unless either is empty or the first already ends in whitespace. */
export function joinText(before: string, after: string): string {
  if (!after) return before;
  if (!before.trim()) return after;
  return /\s$/.test(before) ? before + after : `${before} ${after}`;
}

/** Everything heard in a session, as it should appear in the box. */
export function heardText(heard: Heard): string {
  return joinText(heard.final, heard.interim);
}

/**
 * Rebuilds the session's text from the whole result list on every event rather than trusting `resultIndex`, which
 * Safari and Android Chrome report inconsistently. Some of those engines also repeat earlier final results inside a
 * later, longer one ("move" then "move Robin"); a final result that starts with everything settled so far replaces
 * it instead of being appended.
 */
export function readResults(results: RecognitionResultList): Heard {
  let final = "";
  let interim = "";
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const text = result?.[0]?.transcript.trim() ?? "";
    if (!result || !text) continue;
    if (!result.isFinal) interim = joinText(interim, text);
    else if (final && text.length > final.length && text.toLowerCase().startsWith(final.toLowerCase()))
      final = text;
    else final = joinText(final, text);
  }
  return { final, interim };
}

/** Why dictation stopped, as far as the owner needs to know. `aborted` (we or the system stopped it) is not one. */
export type DictationError =
  | "not-allowed"
  | "service-not-allowed"
  | "no-speech"
  | "audio-capture"
  | "network"
  | "language-not-supported"
  | "failed";

/** Maps a recogniser error code to ours; null for codes that need no message (`aborted`). */
export function toDictationError(code: string): DictationError | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
    case "no-speech":
    case "audio-capture":
    case "network":
    case "language-not-supported":
      return code;
    default:
      return "failed";
  }
}

export const DICTATION_ERROR_MESSAGE: Record<DictationError, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser settings to dictate.",
  "service-not-allowed": "Dictation is turned off on this device. Turn it on in your settings to use it.",
  "no-speech": "Didn't catch anything. Try the microphone again.",
  "audio-capture": "No microphone found. Check it's connected and not in use by another app.",
  network: "Dictation needs an internet connection. Check yours and try again.",
  "language-not-supported": "Dictation isn't available in this language.",
  failed: "Dictation stopped unexpectedly. Try again.",
};

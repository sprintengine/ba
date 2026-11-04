/**
 * Dictation into Bo's composer, as rules (pure: no React Native, no speech module), so tests run the same rules the
 * composer does. Adapted from multicode-mobile's `dictationLogic` (the transcript rules, which handle how iOS and
 * Android recognisers repeat and revise words), plus a state machine (`dictationReducer`) that turns the person's
 * gestures and the recogniser's events into the next state and the effects to run (start, stop, haptics…).
 *
 * The composer is a draft: nothing reaches Bo until the person presses Send, so the recogniser's revisions can land in
 * it safely, and the person always sees what was heard before it is sent.
 */

/** The draft with what was just said added: a new sentence when the draft ended one, else more of the same. */
export function joinDictation(draft: string, spoken: string): string {
  const said = spoken.trim();
  if (!said) return draft;
  if (!draft.trim()) return capitalise(said);
  const trailing = /\s$/u.test(draft) ? "" : " ";
  const sentenceEnded = /[.!?:]\s*$/u.test(draft) || /\n\s*$/u.test(draft);
  return `${draft}${trailing}${sentenceEnded ? capitalise(said) : said}`;
}

/** The composer's text while listening: the draft with the words heard so far already where they will land. */
export function dictatedDraft(draft: string, interim: string): string {
  return interim.trim() ? joinDictation(draft, interim) : draft;
}

/** The longest one tap of the mic listens: only a backstop for a microphone left on by mistake. */
export const DICTATION_LIMIT_MS = 5 * 60_000;

/** A run that ends sooner than this with nothing heard is a recogniser refusing to listen, not a pause. */
export const QUICK_END_MS = 1_000;

/** Android answers a start made straight after an end with "busy". */
export const RESTART_DELAY_MS = 250;

/** How long a press must last to be push-to-talk (listen while held) rather than a tap. */
export const HOLD_MS = 350;

/** A recogniser error that is only silence: it ends a run, not the dictation. */
export function isDictationSilence(code: string): boolean {
  return code === "no-speech" || code === "speech-timeout" || code === "nomatch";
}

/**
 * The words a run settled on. A final that is the start of the interim it replaces dropped words that were said, so
 * the longer reading stands; a final that revises the words is taken as it is.
 */
export function settledTranscript(interim: string, final: string): string {
  const heard = interim.trim();
  const settled = final.trim();
  if (!settled) return heard;
  return heard.length > settled.length && heard.startsWith(settled) ? heard : settled;
}

/**
 * What a result says that the run hasn't settled yet. Some recognisers (most iOS releases) repeat the whole run in
 * every result, including stretches already marked final; others (Android, iOS 18.0) start afresh after each pause.
 * Taken as they come, the first kind would put words in the draft twice, so a result that reads the settled words again
 * gives only what follows them, and one that only repeats their tail gives nothing.
 */
export function freshTranscript(run: string, transcript: string): string {
  const text = plainLineBreaks(transcript).trim();
  const settled = wordKeys(run);
  if (!text || !settled.length) return text;
  const words = text.split(/\s+/u);
  const keys = words.map(wordKey);
  const after = rereadEnd(settled, keys);
  if (after !== null) return words.slice(after).join(" ");
  if (
    keys.length <= settled.length &&
    keys.every((key, index) => key === settled[settled.length - keys.length + index])
  )
    return "";
  return text;
}

/** The run's settled words with another stretch after them. */
export function runWithSettled(run: string, words: string): string {
  const said = words.trim();
  if (!said) return run;
  return run ? `${run} ${said}` : said;
}

/**
 * Whether a run the recogniser ended on its own should be followed by another (phones end runs at pauses): not when the
 * person stopped it, the limit is up, or runs keep ending the moment they start (a recogniser that can't listen).
 */
export function shouldKeepDictating(session: {
  stopping: boolean;
  startedAt: number;
  now: number;
  quickEnds: number;
}): boolean {
  if (session.stopping) return false;
  if (session.now - session.startedAt >= DICTATION_LIMIT_MS) return false;
  return session.quickEnds < 3;
}

/** Where the audio goes, said in the composer while it listens: on the phone, or Apple's or Google's service. */
export function dictationSourceLabel(onDevice: boolean, platform: string): string {
  if (onDevice) return "on this device";
  return platform === "ios" ? "with Apple" : "with Google";
}

/** A silence is said quietly; anything else is an error. */
export function dictationErrorTone(code: string): "quiet" | "error" {
  return code === "no-speech" || code === "speech-timeout" ? "quiet" : "error";
}

/** What to tell the person when dictation stops without words, or null (they stopped it themselves). */
export function dictationErrorMessage(code: string, platform: string): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "no-speech":
    case "speech-timeout":
    case "nomatch":
      return "Didn't catch that. Tap the microphone and speak.";
    case "not-allowed":
      return platform === "ios"
        ? "To dictate, allow the microphone and speech recognition for bookanything in Settings."
        : "To dictate, allow the microphone for bookanything in Settings.";
    case "service-not-allowed":
    case "language-not-supported":
      return platform === "ios"
        ? "Dictation is off on this device. Turn it on in Settings › General › Keyboard."
        : "This device has no speech recogniser. Install or update the Google app to dictate.";
    case "network":
      return "Dictation needs a connection on this device. Try again when it has one.";
    case "audio-capture":
      return "The microphone is in use by something else.";
    case "busy":
      return "Dictation is still finishing. Try again in a moment.";
    default:
      return "Dictation stopped. Try again.";
  }
}

/** Whether the person can fix an error in Settings (shown with an "Open Settings" action). */
export function needsSettings(code: string): boolean {
  return code === "not-allowed" || code === "service-not-allowed";
}

// --- The state machine ---

export type DictationStatus = "idle" | "starting" | "listening";

/** `tap`: listens until tapped again. `hold`: push-to-talk, listens while the button is held. */
export type DictationMode = "tap" | "hold";

export type DictationSession = {
  startedAt: number;
  runStartedAt: number;
  heardInRun: boolean;
  quickEnds: number;
  /** The person asked it to stop: the next end finishes the dictation. */
  stopping: boolean;
};

export type DictationState = {
  status: DictationStatus;
  mode: DictationMode;
  /** What the recogniser thinks it has heard since the last settled stretch (still being revised). */
  interim: string;
  /** What this run has settled already, which a result may read again. */
  runSettled: string;
  session: DictationSession | null;
  /** Between a run's end and the next run's start. */
  restarting: boolean;
  /** What the dictation started the recogniser with (each run after a pause starts the same way). */
  options: RecognitionOptions | null;
  /** "on this device", "with Apple"… while listening. */
  source: string | null;
  error: { code: string; message: string; tone: "quiet" | "error"; settings: boolean } | null;
};

export const initialDictation: DictationState = {
  status: "idle",
  mode: "tap",
  interim: "",
  runSettled: "",
  session: null,
  restarting: false,
  options: null,
  source: null,
  error: null,
};

export type RecognitionOptions = {
  lang: string;
  interimResults: true;
  continuous: true;
  addsPunctuation: true;
  requiresOnDeviceRecognition: boolean;
};

export type DictationEvent =
  /** The mic tapped: start, or stop. */
  | { type: "tap" }
  /** The mic held down past HOLD_MS: push-to-talk starts (or carries on). */
  | { type: "hold" }
  /** The mic released after a hold: stop, keeping the words. */
  | { type: "release" }
  /** The answer to the permission request (and what the device can do). */
  | {
      type: "ready";
      granted: boolean;
      available: boolean;
      onDevice: boolean;
      platform: string;
      lang: string;
      now: number;
    }
  | { type: "started" }
  | { type: "result"; transcript: string; isFinal: boolean }
  | { type: "error"; code: string; platform: string }
  | { type: "end"; now: number }
  /** The restart delay is over: the next run starts. */
  | { type: "restart"; now: number }
  /** The person edited or sent the text: what was heard so far is kept and the microphone goes off at once. */
  | { type: "cancel" }
  /** The screen went away: drop everything, microphone off. */
  | { type: "unmount" }
  | { type: "dismiss-error" };

export type DictationEffect =
  | { type: "request-permission" }
  | { type: "start"; options: RecognitionOptions }
  | { type: "stop" }
  | { type: "abort" }
  /** Settled words for the composer to add to its draft. */
  | { type: "deliver"; text: string }
  | { type: "schedule-restart" }
  | { type: "cancel-restart" }
  | { type: "haptic"; kind: "start" | "stop" | "error" }
  /** Read out by the screen reader (VoiceOver / TalkBack). */
  | { type: "announce"; text: string };

export type Transition = { state: DictationState; effects: DictationEffect[] };

const stay = (state: DictationState): Transition => ({ state, effects: [] });

/** Settles whatever was still being heard (a run can end without a final result; those words were said). */
function settleInterim(state: DictationState): { state: DictationState; effects: DictationEffect[] } {
  const words = state.interim.trim();
  return {
    state: { ...state, interim: "" },
    effects: words ? [{ type: "deliver", text: words }] : [],
  };
}

/** Back to rest, keeping the words heard. */
function finish(state: DictationState, extra: DictationEffect[] = []): Transition {
  const settled = settleInterim(state);
  return {
    state: {
      ...settled.state,
      status: "idle",
      session: null,
      restarting: false,
      runSettled: "",
      options: null,
      source: null,
    },
    effects: [...settled.effects, ...extra],
  };
}

function begin(state: DictationState, mode: DictationMode): Transition {
  return {
    state: { ...initialDictation, status: "starting", mode },
    effects: [{ type: "request-permission" }, { type: "haptic", kind: "start" }],
  };
}

/** Asks the recogniser to stop: its final result and end follow, and finish the dictation. */
function requestStop(state: DictationState): Transition {
  if (state.status === "starting" && !state.session) return finish(state);
  if (!state.session) return stay(state);
  if (state.restarting) return finish(state, [{ type: "cancel-restart" }, { type: "haptic", kind: "stop" }]);
  return {
    state: { ...state, session: { ...state.session, stopping: true } },
    effects: [{ type: "stop" }, { type: "haptic", kind: "stop" }],
  };
}

function fail(state: DictationState, code: string, platform: string): Transition {
  const message = dictationErrorMessage(code, platform);
  const done = finish(state, [{ type: "abort" }]);
  if (!message) return done;
  return {
    state: {
      ...done.state,
      error: { code, message, tone: dictationErrorTone(code), settings: needsSettings(code) },
    },
    effects: [...done.effects, { type: "haptic", kind: "error" }, { type: "announce", text: message }],
  };
}

export function dictationReducer(state: DictationState, event: DictationEvent): Transition {
  switch (event.type) {
    case "tap":
      if (state.status === "idle") return begin({ ...state, error: null }, "tap");
      return requestStop(state);
    case "hold":
      // A hold while already listening (from a tap) makes the release stop it.
      if (state.status === "idle") return begin({ ...state, error: null }, "hold");
      return stay({ ...state, mode: "hold" });
    case "release":
      if (state.status === "idle" || state.mode !== "hold") return stay(state);
      return requestStop(state);
    case "ready": {
      if (state.status !== "starting" || state.session) return stay(state);
      if (!event.granted) return fail(state, "not-allowed", event.platform);
      if (!event.available) return fail(state, "service-not-allowed", event.platform);
      const options: RecognitionOptions = {
        lang: event.lang,
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        requiresOnDeviceRecognition: event.onDevice,
      };
      return {
        state: {
          ...state,
          session: {
            startedAt: event.now,
            runStartedAt: event.now,
            heardInRun: false,
            quickEnds: 0,
            stopping: false,
          },
          runSettled: "",
          options,
          source: dictationSourceLabel(event.onDevice, event.platform),
        },
        effects: [{ type: "start", options }],
      };
    }
    case "started":
      if (state.status === "idle" || !state.session) return stay(state);
      if (state.status === "listening") return stay(state);
      return {
        state: { ...state, status: "listening" },
        effects: [{ type: "announce", text: `Listening ${state.source ?? ""}`.trim() }],
      };
    case "result": {
      const session = state.session;
      if (!session) return stay(state);
      const heardInRun = session.heardInRun || event.transcript.trim().length > 0;
      const transcript = freshTranscript(state.runSettled, event.transcript);
      const next = { ...state, session: { ...session, heardInRun } };
      if (!event.isFinal) return stay({ ...next, interim: transcript });
      const words = settledTranscript(state.interim, transcript);
      return {
        state: { ...next, interim: "", runSettled: runWithSettled(state.runSettled, words) },
        effects: words ? [{ type: "deliver", text: words }] : [],
      };
    }
    case "error": {
      if (state.status === "idle") return stay(state);
      const session = state.session;
      // A pause the recogniser gave up on ends this run; "end" follows and the next run starts.
      if (isDictationSilence(event.code) && session && !session.stopping) return stay(state);
      if (event.code === "aborted" || (isDictationSilence(event.code) && session?.stopping))
        return stay(state);
      return fail(state, event.code, event.platform);
    }
    case "end": {
      if (state.status === "idle") return stay(state);
      const session = state.session;
      if (!session) return finish(state);
      const settled = settleInterim(state);
      const quick = !session.heardInRun && event.now - session.runStartedAt < QUICK_END_MS;
      const quickEnds = quick ? session.quickEnds + 1 : 0;
      if (!shouldKeepDictating({ ...session, quickEnds, now: event.now })) {
        const done = finish(settled.state, session.stopping ? [] : [{ type: "haptic", kind: "stop" }]);
        return { state: done.state, effects: [...settled.effects, ...done.effects] };
      }
      return {
        state: { ...settled.state, restarting: true, session: { ...session, quickEnds } },
        effects: [...settled.effects, { type: "schedule-restart" }],
      };
    }
    case "restart": {
      const session = state.session;
      if (!state.restarting || !session || session.stopping || !state.options) return stay(state);
      return {
        state: {
          ...state,
          restarting: false,
          runSettled: "",
          session: { ...session, runStartedAt: event.now, heardInRun: false },
        },
        effects: [{ type: "start", options: state.options }],
      };
    }
    case "cancel":
      if (state.status === "idle") return stay(state);
      return finish(state, [{ type: "abort" }, { type: "cancel-restart" }]);
    case "unmount":
      if (state.status === "idle") return stay(state);
      return {
        state: initialDictation,
        effects: [{ type: "abort" }, { type: "cancel-restart" }],
      };
    case "dismiss-error":
      return stay({ ...state, error: null });
  }
}

// --- Words ---

function capitalise(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

function plainLineBreaks(text: string): string {
  return text.replace(/[\r\n\u2028\u2029]+/gu, " ");
}

function wordKey(word: string): string {
  return word.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function wordKeys(text: string): string[] {
  return plainLineBreaks(text)
    .split(/\s+/u)
    .filter((word) => word.length > 0)
    .map(wordKey);
}

/**
 * Where a result that reads the settled words again ends them: the index of its first word past them, or null when it
 * doesn't start with them (to within a word in four, as an edit distance over words, case and punctuation aside).
 */
function rereadEnd(settled: readonly string[], keys: readonly string[]): number | null {
  const allowed = settled.length < 4 ? 0 : Math.floor(settled.length / 4);
  const widest = Math.min(keys.length, settled.length + allowed);
  if (widest < settled.length - allowed) return null;
  let row = Array.from({ length: widest + 1 }, (_, j) => j);
  for (let i = 1; i <= settled.length; i++) {
    const next = [i];
    for (let j = 1; j <= widest; j++) {
      const same = settled[i - 1] === keys[j - 1] ? 0 : 1;
      next.push(Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + same));
    }
    row = next;
  }
  let best: number | null = null;
  for (let j = 0; j <= widest; j++) {
    if (row[j]! > allowed) continue;
    if (
      best === null ||
      row[j]! < row[best]! ||
      (row[j] === row[best] && Math.abs(j - settled.length) < Math.abs(best - settled.length))
    )
      best = j;
  }
  return best;
}

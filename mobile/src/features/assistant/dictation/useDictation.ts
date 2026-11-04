/**
 * Dictation into a composer: the state machine (`dictation-logic.ts`) driven by the person's gestures and a
 * recogniser's events, with its effects run by a small controller (the recogniser, haptics, screen reader
 * announcements, timers).
 *
 * Tap the microphone to listen until it is tapped again (through the pauses in a message); hold it to talk and let go
 * to stop. Settled words go to `onText` for the composer to add to its draft; `interim` is what is still being heard.
 * Nothing is ever sent: the person presses Send.
 */
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AccessibilityInfo, Linking, Platform } from "react-native";
import {
  DICTATION_LIMIT_MS,
  RESTART_DELAY_MS,
  dictationReducer,
  initialDictation,
  type DictationEffect,
  type DictationEvent,
  type DictationState,
} from "./dictation-logic";
import { deviceRecognizer, type Recognizer } from "./recognizer";

/** How long a line about the last attempt stays (like a toast), unless the mic is tapped again first. */
export const ERROR_MS = 6_000;

type Timer = ReturnType<typeof setTimeout>;

// One recogniser per device: the composer that started it owns it until it ends. Another composer that starts takes it
// over, and the previous one goes back to rest keeping what it heard.
let owner: DictationController | null = null;

export class DictationController {
  private state: DictationState = initialDictation;
  private readonly listeners = new Set<() => void>();
  private recognizer: Recognizer | null;
  private unsubscribe: (() => void) | null = null;
  private restartTimer: Timer | null = null;
  private limitTimer: Timer | null = null;
  private errorTimer: Timer | null = null;
  private lang: string;
  private onText: (text: string) => void;

  constructor(options: { lang: string; onText: (text: string) => void; recognizer?: Recognizer }) {
    this.lang = options.lang;
    this.onText = options.onText;
    this.recognizer = options.recognizer ?? null;
  }

  /** The latest language and draft callback (they change as the composer re-renders). */
  configure(options: { lang: string; onText: (text: string) => void }) {
    this.lang = options.lang;
    this.onText = options.onText;
  }

  getState = (): DictationState => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  dispatch = (event: DictationEvent) => {
    const before = this.state;
    const { state, effects } = dictationReducer(before, event);
    this.state = state;
    if (state !== before) this.listeners.forEach((l) => l());
    if (state.status === "idle") this.release();
    if (state.session?.startedAt !== before.session?.startedAt) this.armLimit();
    if (state.error !== before.error) this.armErrorTimer();
    effects.forEach((effect) => this.run(effect));
  };

  /** The screen went away: the microphone goes off and nothing more reaches the draft. */
  dispose() {
    this.dispatch({ type: "unmount" });
    this.release();
    this.clear("restartTimer");
    this.clear("limitTimer");
    this.clear("errorTimer");
  }

  private device(): Recognizer {
    return (this.recognizer ??= deviceRecognizer());
  }

  private run(effect: DictationEffect) {
    switch (effect.type) {
      case "request-permission":
        this.claim();
        this.device()
          .requestPermissions()
          .then(({ granted }) => {
            const r = this.device();
            this.dispatch({
              type: "ready",
              granted,
              available: granted && r.isAvailable(),
              onDevice: granted && r.supportsOnDevice(),
              platform: Platform.OS,
              lang: this.lang,
              now: Date.now(),
            });
          })
          .catch(() => this.dispatch({ type: "error", code: "unknown", platform: Platform.OS }));
        return;
      case "start":
        try {
          this.device().start(effect.options);
        } catch {
          this.dispatch({ type: "error", code: "unknown", platform: Platform.OS });
        }
        return;
      case "stop":
        this.device().stop();
        return;
      case "abort":
        this.recognizer?.abort();
        return;
      case "deliver":
        this.onText(effect.text);
        return;
      case "schedule-restart":
        this.clear("restartTimer");
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null;
          this.dispatch({ type: "restart", now: Date.now() });
        }, RESTART_DELAY_MS);
        return;
      case "cancel-restart":
        this.clear("restartTimer");
        return;
      case "haptic":
        void (
          effect.kind === "error"
            ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
            : Haptics.impactAsync(
                effect.kind === "start"
                  ? Haptics.ImpactFeedbackStyle.Medium
                  : Haptics.ImpactFeedbackStyle.Light,
              )
        ).catch(() => undefined);
        return;
      case "announce":
        AccessibilityInfo.announceForAccessibility(effect.text);
        return;
    }
  }

  /** Takes the recogniser and listens to it (until this dictation ends). */
  private claim() {
    if (owner && owner !== this) owner.dispatch({ type: "cancel" });
    owner = this;
    if (this.unsubscribe) return;
    const r = this.device();
    const offs = [
      r.on("start", () => this.dispatch({ type: "started" })),
      r.on("result", (e) => this.dispatch({ type: "result", ...e })),
      r.on("error", (e) => this.dispatch({ type: "error", code: e.code, platform: Platform.OS })),
      r.on("end", () => this.dispatch({ type: "end", now: Date.now() })),
    ];
    this.unsubscribe = () => offs.forEach((off) => off());
  }

  private release() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.clear("limitTimer");
    if (owner === this) owner = null;
  }

  /** The backstop for a microphone left on by mistake. */
  private armLimit() {
    this.clear("limitTimer");
    if (!this.state.session) return;
    this.limitTimer = setTimeout(() => this.dispatch({ type: "tap" }), DICTATION_LIMIT_MS);
  }

  private armErrorTimer() {
    this.clear("errorTimer");
    if (!this.state.error) return;
    this.errorTimer = setTimeout(() => this.dispatch({ type: "dismiss-error" }), ERROR_MS);
  }

  private clear(timer: "restartTimer" | "limitTimer" | "errorTimer") {
    const t = this[timer];
    if (t) clearTimeout(t);
    this[timer] = null;
  }
}

export type DictationOptions = {
  /** BCP 47 language to recognise (the business's locale). */
  lang: string;
  /** Settled words, for the composer's draft. */
  onText: (text: string) => void;
  /** Tests pass a fake; the app uses the device's recogniser. */
  recognizer?: Recognizer;
};

export type Dictation = {
  state: DictationState;
  /** Listening, or starting to. */
  active: boolean;
  /** Words still being heard (not yet in the draft). */
  interim: string;
  tap: () => void;
  hold: () => void;
  release: () => void;
  /** Keep what was heard and stop at once (the text was edited or sent). */
  cancel: () => void;
  dismissError: () => void;
  openSettings: () => void;
};

export function useDictation({ lang, onText, recognizer }: DictationOptions): Dictation {
  const [controller] = useState(() => new DictationController({ lang, onText, recognizer }));
  useEffect(() => {
    controller.configure({ lang, onText });
  });
  // Leaving the screen mid-sentence turns the microphone off rather than leaving it open behind it.
  useEffect(() => () => controller.dispose(), [controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const { dispatch } = controller;
  return useMemo(
    () => ({
      state,
      active: state.status !== "idle",
      interim: state.interim,
      tap: () => dispatch({ type: "tap" }),
      hold: () => dispatch({ type: "hold" }),
      release: () => dispatch({ type: "release" }),
      cancel: () => dispatch({ type: "cancel" }),
      dismissError: () => dispatch({ type: "dismiss-error" }),
      openSettings: () => void Linking.openSettings(),
    }),
    [state, dispatch],
  );
}

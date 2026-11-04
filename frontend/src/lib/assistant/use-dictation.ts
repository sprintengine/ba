"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  dictationLanguage,
  heardText,
  NOTHING_HEARD,
  readResults,
  recognitionConstructor,
  toDictationError,
  type DictationError,
  type Heard,
  type Recognition,
} from "./dictation";

export type Dictation = {
  /** The browser can recognise speech. False on the server, during hydration and in Firefox. */
  supported: boolean;
  listening: boolean;
  /** This session's words so far (empty when not listening). */
  heard: Heard;
  error: DictationError | null;
  /** Starts listening. Call it straight from a click or tap: Safari only starts from a user gesture. */
  start: () => void;
  /** Stops listening and hands everything heard, as shown, to `onEnd`. */
  stop: () => void;
  /** Stops listening and drops what was heard (the text already went elsewhere, e.g. it was sent or edited). */
  cancel: () => void;
  clearError: () => void;
};

type Session = { recognition: Recognition; heard: Heard; closed: boolean; end: (keep: boolean) => void };

/** One recogniser at a time across the page (Safari allows only one; two would fight over the microphone). */
let activeSession: Session | null = null;

const subscribe = () => () => {};
const isSupported = () => recognitionConstructor() !== null;
const notOnServer = () => false;

/**
 * Speech to text with the browser's Web Speech API (see `dictation.ts` for support and privacy). Listens continuously
 * with interim results until stopped, until the recogniser ends on its own (Safari stops after a pause) or on an
 * error; each way, `onEnd` receives what was heard. Stopping keeps exactly the words on screen rather than waiting
 * for the engine's final pass, so the text never changes after the owner stops.
 */
export function useDictation({
  onEnd,
  lang,
}: {
  /** Called once per session with everything heard, unless the session was cancelled. */
  onEnd?: (text: string) => void;
  /** BCP 47 language; defaults to the page's. */
  lang?: string;
} = {}): Dictation {
  const supported = useSyncExternalStore(subscribe, isSupported, notOnServer);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<Heard>(NOTHING_HEARD);
  const [error, setError] = useState<DictationError | null>(null);
  const session = useRef<Session | null>(null);
  const onEndRef = useRef(onEnd);
  useLayoutEffect(() => {
    onEndRef.current = onEnd;
  });

  const start = useCallback(() => {
    const Recogniser = recognitionConstructor();
    if (!Recogniser || session.current) return;
    activeSession?.end(true);

    const recognition = new Recogniser();
    recognition.lang = lang ?? dictationLanguage();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    const current: Session = {
      recognition,
      heard: NOTHING_HEARD,
      closed: false,
      end: (keep) => {
        if (current.closed) return;
        current.closed = true;
        if (activeSession === current) activeSession = null;
        if (session.current === current) session.current = null;
        try {
          recognition.abort();
        } catch {
          // Already ended; nothing to release.
        }
        setListening(false);
        setHeard(NOTHING_HEARD);
        const text = heardText(current.heard);
        if (keep && text) onEndRef.current?.(text);
      },
    };
    recognition.onresult = (event) => {
      if (current.closed) return;
      current.heard = readResults(event.results);
      setHeard(current.heard);
    };
    recognition.onerror = (event) => {
      if (current.closed) return;
      const problem = toDictationError(event.error);
      if (problem) setError(problem);
      current.end(true);
    };
    recognition.onend = () => current.end(true);

    session.current = current;
    activeSession = current;
    setError(null);
    setHeard(NOTHING_HEARD);
    setListening(true);
    try {
      recognition.start();
    } catch {
      // InvalidStateError (already started elsewhere) or a browser refusing outside a user gesture.
      current.end(false);
      setError("failed");
    }
  }, [lang]);

  const stop = useCallback(() => session.current?.end(true), []);
  const cancel = useCallback(() => session.current?.end(false), []);
  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    if (!listening) return;
    // Leaving the tab (or locking the iPad) ends the session; Safari would cut it off anyway.
    const onHidden = () => {
      if (document.visibilityState === "hidden") session.current?.end(true);
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [listening]);

  // Unmounting (the panel closing, a route change) releases the microphone.
  useEffect(() => {
    const live = session;
    return () => live.current?.end(false);
  }, []);

  return { supported, listening, heard, error, start, stop, cancel, clearError };
}

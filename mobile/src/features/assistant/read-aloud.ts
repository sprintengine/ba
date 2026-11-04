/**
 * Hands-free: Bo reads its replies aloud (`expo-speech`, the device's own voices, in the business's language). Off by
 * default; the choice is kept on the device. Speech stops when the person starts dictating, leaves Bo, or turns it
 * off, and VoiceOver users keep their screen reader (Bo isn't read twice).
 */
import * as Speech from "expo-speech";
import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { prefs } from "~/lib/storage";
import { plainText } from "./plain-text";

const PREF_HANDS_FREE = "assistant.handsFree";

export function handsFreePreference(): boolean {
  return prefs().getBoolean(PREF_HANDS_FREE) ?? false;
}

export function setHandsFreePreference(on: boolean) {
  prefs().set(PREF_HANDS_FREE, on);
}

export type ReadAloud = {
  handsFree: boolean;
  setHandsFree: (on: boolean) => void;
  speaking: boolean;
  speak: (text: string) => void;
  stop: () => void;
};

export function useReadAloud(lang: string): ReadAloud {
  const [handsFree, setHandsFreeState] = useState(handsFreePreference);
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    void Speech.stop();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      const words = plainText(text);
      if (!words) return;
      void AccessibilityInfo.isScreenReaderEnabled().then((screenReader) => {
        // The screen reader already reads the reply (the log announces it); two voices at once help nobody.
        if (screenReader) return;
        void Speech.stop();
        setSpeaking(true);
        Speech.speak(words, {
          language: lang,
          onDone: () => setSpeaking(false),
          onStopped: () => setSpeaking(false),
          onError: () => setSpeaking(false),
        });
      });
    },
    [lang],
  );

  const setHandsFree = useCallback(
    (on: boolean) => {
      setHandsFreePreference(on);
      setHandsFreeState(on);
      if (!on) stop();
    },
    [stop],
  );

  // Leaving Bo stops the voice.
  useEffect(() => () => void Speech.stop(), []);

  return { handsFree, setHandsFree, speaking, speak, stop };
}

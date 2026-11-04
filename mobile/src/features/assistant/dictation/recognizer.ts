/**
 * The speech recogniser behind dictation, as a small seam: the device's own (`expo-speech-recognition`: Apple's
 * SFSpeechRecognizer on iOS, Google's on Android) in the app, a fake in tests (`fake-recognizer.ts`).
 *
 * Privacy: audio is never recorded, uploaded or stored by bookanything. Recognition runs on the device where it can
 * (`requiresOnDeviceRecognition` when the device supports it); otherwise Apple's or Google's service does it, and the
 * composer says which while it listens.
 */
import type { RecognitionOptions } from "./dictation-logic";

export type RecognizerEvents = {
  start: () => void;
  result: (event: { transcript: string; isFinal: boolean }) => void;
  error: (event: { code: string }) => void;
  end: () => void;
};

export type Recognizer = {
  /** Asks for the microphone and speech recognition (iOS asks once; later answers come from Settings). */
  requestPermissions: () => Promise<{ granted: boolean }>;
  isAvailable: () => boolean;
  supportsOnDevice: () => boolean;
  start: (options: RecognitionOptions) => void;
  /** Stops listening and asks for a final result. */
  stop: () => void;
  /** Stops at once, without a final result. */
  abort: () => void;
  on: <K extends keyof RecognizerEvents>(event: K, listener: RecognizerEvents[K]) => () => void;
};

/** The device's recogniser. Loaded on first use, so screens without dictation never load the native module. */
export function deviceRecognizer(): Recognizer {
  type Module = typeof import("expo-speech-recognition");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ExpoSpeechRecognitionModule: m } = require("expo-speech-recognition") as Module;
  return {
    requestPermissions: () => m.requestPermissionsAsync(),
    isAvailable: () => m.isRecognitionAvailable(),
    supportsOnDevice: () => m.supportsOnDeviceRecognition(),
    start: (options) => m.start({ ...options, iosTaskHint: "dictation" }),
    stop: () => m.stop(),
    abort: () => m.abort(),
    on: (event, listener) => {
      const subscription =
        event === "result"
          ? m.addListener("result", (e) =>
              (listener as RecognizerEvents["result"])({
                transcript: e.results[0]?.transcript ?? "",
                isFinal: e.isFinal,
              }),
            )
          : event === "error"
            ? m.addListener("error", (e) => (listener as RecognizerEvents["error"])({ code: e.error }))
            : m.addListener(event, () => (listener as () => void)());
      return () => subscription.remove();
    },
  };
}

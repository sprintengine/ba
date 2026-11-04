/**
 * A scripted recogniser for tests: records what dictation asked of it and lets a test play the device's events
 * (`emit("result", { transcript, isFinal })`, `emit("end")`).
 */
import type { RecognitionOptions } from "./dictation-logic";
import type { Recognizer, RecognizerEvents } from "./recognizer";

export type FakeRecognizer = Recognizer & {
  calls: string[];
  started: RecognitionOptions[];
  emit: <K extends keyof RecognizerEvents>(event: K, ...args: Parameters<RecognizerEvents[K]>) => void;
  listeners: () => number;
};

export function fakeRecognizer({
  granted = true,
  available = true,
  onDevice = true,
}: { granted?: boolean; available?: boolean; onDevice?: boolean } = {}): FakeRecognizer {
  const listeners = new Map<keyof RecognizerEvents, Set<(...args: never[]) => void>>();
  const calls: string[] = [];
  const started: RecognitionOptions[] = [];
  return {
    calls,
    started,
    requestPermissions: () => {
      calls.push("requestPermissions");
      return Promise.resolve({ granted });
    },
    isAvailable: () => available,
    supportsOnDevice: () => onDevice,
    start: (options) => {
      calls.push("start");
      started.push(options);
    },
    stop: () => {
      calls.push("stop");
    },
    abort: () => {
      calls.push("abort");
    },
    on: (event, listener) => {
      const set = listeners.get(event) ?? new Set();
      set.add(listener as (...args: never[]) => void);
      listeners.set(event, set);
      return () => set.delete(listener as (...args: never[]) => void);
    },
    emit: (event, ...args) => {
      listeners.get(event)?.forEach((l) => (l as (...a: unknown[]) => void)(...args));
    },
    listeners: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
  };
}

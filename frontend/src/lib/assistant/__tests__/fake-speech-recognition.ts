/**
 * A scriptable stand-in for the browser's SpeechRecognition. Install it as `window.webkitSpeechRecognition` (Safari,
 * Chrome) or `window.SpeechRecognition`, then drive the latest recogniser: `hear`, `error`, `end`.
 */
import { act } from "@testing-library/react";
import type {
  Recognition,
  RecognitionErrorEvent,
  RecognitionResult,
  RecognitionResultEvent,
} from "../dictation";

export class FakeRecognition implements Recognition {
  static instances: FakeRecognition[] = [];
  /** Makes the next `start()` throw, as Safari does outside a user gesture. */
  static refuseNextStart = false;

  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((event: RecognitionResultEvent) => void) | null = null;
  onerror: ((event: RecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;
  private results: RecognitionResult[] = [];

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start() {
    if (FakeRecognition.refuseNextStart) {
      FakeRecognition.refuseNextStart = false;
      throw new DOMException("Not allowed outside a user gesture", "InvalidStateError");
    }
    this.started = true;
  }

  stop() {
    this.stopped = true;
  }

  /** Like the real thing: an `aborted` error, then `end` (which the hook must ignore). */
  abort() {
    this.aborted = true;
    this.onerror?.({ error: "aborted" });
    this.onend?.();
  }

  /**
   * Replaces the pending (interim) results with [interim] and appends [final] results, then fires `result` with the
   * whole list, as engines do. Pass `{ final: [...] }` to settle words, `{ interim: "..." }` for words in progress.
   */
  hear({ final = [], interim }: { final?: string[]; interim?: string }) {
    this.results = this.results.filter((r) => r.isFinal);
    for (const text of final) this.results.push(result(text, true));
    if (interim) this.results.push(result(interim, false));
    const results = [...this.results];
    act(() => this.onresult?.({ resultIndex: 0, results }));
  }

  error(code: string) {
    act(() => {
      this.onerror?.({ error: code });
      this.onend?.();
    });
  }

  /** The engine stopping on its own (Safari after a pause). */
  end() {
    act(() => this.onend?.());
  }
}

function result(transcript: string, isFinal: boolean): RecognitionResult {
  return { isFinal, length: 1, 0: { transcript } };
}

type Slot = "SpeechRecognition" | "webkitSpeechRecognition";

/** Installs the fake on window; returns the latest recogniser and an uninstaller. */
export function installFakeSpeechRecognition(slot: Slot = "webkitSpeechRecognition") {
  FakeRecognition.instances = [];
  FakeRecognition.refuseNextStart = false;
  Object.defineProperty(window, slot, { value: FakeRecognition, configurable: true, writable: true });
  return {
    latest: () => FakeRecognition.instances.at(-1)!,
    uninstall: () => {
      Reflect.deleteProperty(window, slot);
    },
  };
}

export function uninstallSpeechRecognition() {
  Reflect.deleteProperty(window, "SpeechRecognition");
  Reflect.deleteProperty(window, "webkitSpeechRecognition");
}

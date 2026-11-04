import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DICTATION_ERROR_MESSAGE, joinText, readResults, toDictationError } from "./dictation";
import { useDictation } from "./use-dictation";
import {
  FakeRecognition,
  installFakeSpeechRecognition,
  uninstallSpeechRecognition,
} from "./__tests__/fake-speech-recognition";

afterEach(() => {
  uninstallSpeechRecognition();
  document.documentElement.lang = "";
});

describe("useDictation without a recogniser (Firefox)", () => {
  it("is unsupported and start does nothing", () => {
    const { result } = renderHook(() => useDictation());
    expect(result.current.supported).toBe(false);
    act(() => result.current.start());
    expect(result.current.listening).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe("useDictation", () => {
  let fake: ReturnType<typeof installFakeSpeechRecognition>;
  beforeEach(() => {
    fake = installFakeSpeechRecognition();
  });

  function setup(lang?: string) {
    const onEnd = vi.fn();
    const hook = renderHook(() => useDictation({ onEnd, lang }));
    return { ...hook, onEnd, start: () => act(() => hook.result.current.start()) };
  }

  it("is supported with the prefixed (Safari, Chrome) or the standard constructor", () => {
    expect(renderHook(() => useDictation()).result.current.supported).toBe(true);
    fake.uninstall();
    installFakeSpeechRecognition("SpeechRecognition");
    expect(renderHook(() => useDictation()).result.current.supported).toBe(true);
  });

  it("listens continuously with interim results in the page's language, falling back to en-IE", () => {
    const { start, result } = setup();
    start();
    expect(result.current.listening).toBe(true);
    expect(fake.latest()).toMatchObject({
      started: true,
      continuous: true,
      interimResults: true,
      lang: "en-IE",
    });

    act(() => result.current.cancel());
    document.documentElement.lang = "ga-IE";
    start();
    expect(fake.latest().lang).toBe("ga-IE");

    act(() => result.current.cancel());
    const explicit = setup("en-GB");
    explicit.start();
    expect(fake.latest().lang).toBe("en-GB");
  });

  it("streams interim words, settles final ones, and hands everything heard to onEnd on stop", () => {
    const { start, result, onEnd } = setup();
    start();
    fake.latest().hear({ interim: "move" });
    expect(result.current.heard).toEqual({ final: "", interim: "move" });
    fake.latest().hear({ final: ["Move Robin"], interim: "to" });
    expect(result.current.heard).toEqual({ final: "Move Robin", interim: "to" });
    fake.latest().hear({ interim: "to Friday" });
    expect(result.current.heard).toEqual({ final: "Move Robin", interim: "to Friday" });

    act(() => result.current.stop());
    expect(onEnd).toHaveBeenCalledExactlyOnceWith("Move Robin to Friday");
    expect(result.current.listening).toBe(false);
    expect(result.current.heard).toEqual({ final: "", interim: "" });
    expect(fake.latest().aborted).toBe(true); // the abort's own error and end events are ignored
    expect(result.current.error).toBeNull();
  });

  it("stops cleanly when the engine ends on its own after a pause (Safari)", () => {
    const { start, result, onEnd } = setup();
    start();
    fake.latest().hear({ final: ["Cancel my 3pm"] });
    fake.latest().end();
    expect(result.current.listening).toBe(false);
    expect(onEnd).toHaveBeenCalledExactlyOnceWith("Cancel my 3pm");
    expect(result.current.error).toBeNull();
  });

  it("drops what was heard on cancel", () => {
    const { start, result, onEnd } = setup();
    start();
    fake.latest().hear({ interim: "hello" });
    act(() => result.current.cancel());
    expect(result.current.listening).toBe(false);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it.each([
    ["not-allowed", "not-allowed"],
    ["service-not-allowed", "service-not-allowed"],
    ["no-speech", "no-speech"],
    ["audio-capture", "audio-capture"],
    ["network", "network"],
    ["bad-grammar", "failed"],
  ] as const)("reports %s and stops, keeping the words heard", (code, expected) => {
    const { start, result, onEnd } = setup();
    start();
    fake.latest().hear({ interim: "Book Alex" });
    fake.latest().error(code);
    expect(result.current.listening).toBe(false);
    expect(result.current.error).toBe(expected);
    expect(onEnd).toHaveBeenCalledExactlyOnceWith("Book Alex");

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it("says nothing when the system aborts, and clears an old error on the next start", () => {
    const { start, result } = setup();
    start();
    fake.latest().error("no-speech");
    expect(result.current.error).toBe("no-speech");
    start();
    expect(result.current.error).toBeNull();
    fake.latest().error("aborted");
    expect(result.current.error).toBeNull();
    expect(result.current.listening).toBe(false);
  });

  it("reports a start the browser refuses", () => {
    const { start, result } = setup();
    FakeRecognition.refuseNextStart = true;
    start();
    expect(result.current.listening).toBe(false);
    expect(result.current.error).toBe("failed");
  });

  it("runs one recogniser at a time: starting another stops the first, keeping its words", () => {
    const first = setup();
    const second = setup();
    first.start();
    const firstRecognition = fake.latest();
    firstRecognition.hear({ interim: "first" });
    second.start();
    expect(firstRecognition.aborted).toBe(true);
    expect(first.result.current.listening).toBe(false);
    expect(first.onEnd).toHaveBeenCalledWith("first");
    expect(second.result.current.listening).toBe(true);
    expect(FakeRecognition.instances).toHaveLength(2);

    second.start(); // already listening: no second recogniser
    expect(FakeRecognition.instances).toHaveLength(2);
  });

  it("stops when the page is hidden and releases the microphone on unmount", () => {
    const { start, result, onEnd, unmount } = setup();
    start();
    fake.latest().hear({ final: ["Hi"] });
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    visibility.mockRestore();
    expect(result.current.listening).toBe(false);
    expect(onEnd).toHaveBeenCalledWith("Hi");

    start();
    const recognition = fake.latest();
    unmount();
    expect(recognition.aborted).toBe(true);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe("dictation helpers", () => {
  it("joins text with one space", () => {
    expect(joinText("", "hi")).toBe("hi");
    expect(joinText("  ", "hi")).toBe("hi");
    expect(joinText("Move", "")).toBe("Move");
    expect(joinText("Move", "Robin")).toBe("Move Robin");
    expect(joinText("Move\n", "Robin")).toBe("Move\nRobin");
  });

  it("rebuilds the transcript from every result, trimming engine spacing and skipping empties", () => {
    const r = (transcript: string, isFinal: boolean) => ({ isFinal, length: 1, 0: { transcript } });
    expect(readResults({ length: 3, 0: r("Move", true), 1: r(" Robin", true), 2: r(" to", false) })).toEqual({
      final: "Move Robin",
      interim: "to",
    });
    expect(readResults({ length: 2, 0: r(" ", true), 1: { isFinal: false, length: 0 } })).toEqual({
      final: "",
      interim: "",
    });
  });

  it("does not repeat words when an engine resends earlier results inside a longer one", () => {
    const r = (transcript: string) => ({ isFinal: true, length: 1, 0: { transcript } });
    expect(readResults({ length: 2, 0: r("move"), 1: r("move Robin to Friday") }).final).toBe(
      "move Robin to Friday",
    );
    expect(readResults({ length: 2, 0: r("no"), 1: r("no") }).final).toBe("no no");
  });

  it("has a message for every error and none for aborted", () => {
    expect(toDictationError("aborted")).toBeNull();
    expect(toDictationError("language-not-supported")).toBe("language-not-supported");
    expect(toDictationError("phrases-not-supported")).toBe("failed");
    for (const message of Object.values(DICTATION_ERROR_MESSAGE)) expect(message).toMatch(/\.$/);
  });
});

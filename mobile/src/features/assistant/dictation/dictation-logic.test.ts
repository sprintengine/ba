import {
  DICTATION_LIMIT_MS,
  dictatedDraft,
  dictationErrorMessage,
  dictationReducer,
  freshTranscript,
  initialDictation,
  joinDictation,
  settledTranscript,
  shouldKeepDictating,
  type DictationEvent,
  type DictationEffect,
  type DictationState,
} from "./dictation-logic";

/** Plays events through the machine, collecting every effect. */
function play(events: DictationEvent[], from: DictationState = initialDictation) {
  let state = from;
  const effects: DictationEffect[] = [];
  for (const event of events) {
    const t = dictationReducer(state, event);
    state = t.state;
    effects.push(...t.effects);
  }
  return { state, effects, delivered: effects.flatMap((e) => (e.type === "deliver" ? [e.text] : [])) };
}

const ready: DictationEvent = {
  type: "ready",
  granted: true,
  available: true,
  onDevice: true,
  platform: "ios",
  lang: "en-IE",
  now: 0,
};

const listening = play([{ type: "tap" }, ready, { type: "started" }]).state;

describe("words", () => {
  it("joins what was said to the draft as a sentence or more of one", () => {
    expect(joinDictation("", "move my two o'clock")).toBe("Move my two o'clock");
    expect(joinDictation("Hi Bo.", "what's on today")).toBe("Hi Bo. What's on today");
    expect(joinDictation("Book Ann", "for tomorrow")).toBe("Book Ann for tomorrow");
    expect(joinDictation("Book Ann ", "  ")).toBe("Book Ann ");
    expect(dictatedDraft("Book Ann", "")).toBe("Book Ann");
    expect(dictatedDraft("Book Ann", "at three")).toBe("Book Ann at three");
  });

  it("keeps the longer reading when a final drops words it had shown", () => {
    expect(settledTranscript("book ann at three", "book ann")).toBe("book ann at three");
    expect(settledTranscript("book ann", "Book Anne.")).toBe("Book Anne.");
    expect(settledTranscript("still hearing", "")).toBe("still hearing");
  });

  it("gives only the new words of a result that reads the run again (iOS)", () => {
    expect(freshTranscript("Let's test this.", "Let's test this. And then more")).toBe("And then more");
    expect(freshTranscript("Let's test this.", "test this")).toBe("");
    expect(freshTranscript("", "fresh words")).toBe("fresh words");
    expect(freshTranscript("one two", "three four")).toBe("three four");
    // A small revision of the settled words is still the run read again.
    expect(freshTranscript("move the booking to Friday", "Move the bookings to Friday at noon")).toBe(
      "at noon",
    );
  });

  it("says what went wrong, by platform", () => {
    expect(dictationErrorMessage("aborted", "ios")).toBeNull();
    expect(dictationErrorMessage("not-allowed", "ios")).toMatch(/speech recognition/);
    expect(dictationErrorMessage("not-allowed", "android")).toMatch(/microphone/);
    expect(dictationErrorMessage("service-not-allowed", "android")).toMatch(/Google app/);
    expect(dictationErrorMessage("network", "ios")).toMatch(/connection/);
    expect(dictationErrorMessage("audio-capture", "ios")).toMatch(/in use/);
    expect(dictationErrorMessage("busy", "ios")).toMatch(/finishing/);
    expect(dictationErrorMessage("whatever", "ios")).toMatch(/stopped/);
  });

  it("keeps dictating through pauses until stopped, the limit, or a recogniser that can't listen", () => {
    const s = { stopping: false, startedAt: 0, now: 1_000, quickEnds: 0 };
    expect(shouldKeepDictating(s)).toBe(true);
    expect(shouldKeepDictating({ ...s, stopping: true })).toBe(false);
    expect(shouldKeepDictating({ ...s, now: DICTATION_LIMIT_MS })).toBe(false);
    expect(shouldKeepDictating({ ...s, quickEnds: 3 })).toBe(false);
  });
});

describe("dictationReducer", () => {
  it("tap: asks permission, starts on the device in the business's language, listens", () => {
    const { state, effects } = play([{ type: "tap" }, ready, { type: "started" }]);
    expect(effects).toEqual([
      { type: "request-permission" },
      { type: "haptic", kind: "start" },
      {
        type: "start",
        options: {
          lang: "en-IE",
          interimResults: true,
          continuous: true,
          addsPunctuation: true,
          requiresOnDeviceRecognition: true,
        },
      },
      { type: "announce", text: "Listening on this device" },
    ]);
    expect(state.status).toBe("listening");
    expect(state.source).toBe("on this device");
  });

  it("shows interim words, delivers settled ones, and keeps the rest when tapped off", () => {
    const { state, delivered, effects } = play(
      [
        { type: "result", transcript: "what's on", isFinal: false },
        { type: "result", transcript: "What's on today?", isFinal: true },
        { type: "result", transcript: "and tomor", isFinal: false },
        { type: "tap" },
        { type: "end", now: 5_000 },
      ],
      listening,
    );
    expect(delivered).toEqual(["What's on today?", "and tomor"]);
    expect(effects).toContainEqual({ type: "stop" });
    expect(state).toMatchObject({ status: "idle", interim: "", session: null });
  });

  it("restarts after a pause the recogniser ended, and drops words a result repeats", () => {
    const paused = play(
      [
        { type: "result", transcript: "Book Ann.", isFinal: true },
        { type: "error", code: "no-speech", platform: "ios" },
        { type: "end", now: 4_000 },
      ],
      listening,
    );
    expect(paused.state.restarting).toBe(true);
    expect(paused.effects).toContainEqual({ type: "schedule-restart" });
    expect(paused.state.error).toBeNull();
    const resumed = play(
      [
        { type: "restart", now: 4_250 },
        { type: "result", transcript: "For Friday", isFinal: true },
      ],
      paused.state,
    );
    expect(resumed.effects[0]).toMatchObject({ type: "start" });
    expect(resumed.delivered).toEqual(["For Friday"]);
    // Within one run, iOS reads the settled words again: only the new ones count.
    const reread = play(
      [
        { type: "result", transcript: "Book Ann. At three", isFinal: false },
        { type: "result", transcript: "Book Ann. At three.", isFinal: true },
      ],
      play([{ type: "result", transcript: "Book Ann.", isFinal: true }], listening).state,
    );
    expect(reread.delivered).toEqual(["At three."]);
  });

  it("gives up on a recogniser that ends every run at once", () => {
    let state = listening;
    for (let i = 0; i < 3; i++) {
      state = play([{ type: "end", now: 100 }], state).state;
      if (state.restarting) state = play([{ type: "restart", now: 100 }], state).state;
    }
    expect(state.status).toBe("idle");
  });

  it("push-to-talk: listens while held, stops on release; a release without a hold does nothing", () => {
    const held = play([{ type: "hold" }, ready, { type: "started" }]);
    expect(held.state).toMatchObject({ status: "listening", mode: "hold" });
    const released = play([{ type: "release" }], held.state);
    expect(released.effects).toContainEqual({ type: "stop" });
    expect(play([{ type: "release" }], listening).effects).toEqual([]);
    // Holding while a tap is listening makes the release stop it.
    expect(play([{ type: "hold" }, { type: "release" }], listening).effects).toContainEqual({
      type: "stop",
    });
  });

  it("says why it can't listen: no permission (with Settings), no recogniser", () => {
    const denied = play([{ type: "tap" }, { ...ready, granted: false }]);
    expect(denied.state.status).toBe("idle");
    expect(denied.state.error).toMatchObject({ code: "not-allowed", settings: true, tone: "error" });
    expect(denied.effects).toContainEqual({ type: "haptic", kind: "error" });
    expect(denied.effects).toContainEqual({ type: "announce", text: expect.stringMatching(/Settings/) });
    const unavailable = play([{ type: "tap" }, { ...ready, available: false }]);
    expect(unavailable.state.error?.code).toBe("service-not-allowed");
    expect(play([{ type: "dismiss-error" }], denied.state).state.error).toBeNull();
    // Tapping again clears the old line.
    expect(play([{ type: "tap" }], denied.state).state.error).toBeNull();
  });

  it("an error mid-sentence keeps the words heard", () => {
    const failed = play(
      [
        { type: "result", transcript: "cancel the", isFinal: false },
        { type: "error", code: "network", platform: "ios" },
      ],
      listening,
    );
    expect(failed.delivered).toEqual(["cancel the"]);
    expect(failed.state.error?.code).toBe("network");
    // The person stopping it, or silence after a stop, is not an error.
    const stopping = play([{ type: "tap" }], listening).state;
    expect(play([{ type: "error", code: "no-speech", platform: "ios" }], stopping).state.error).toBeNull();
    expect(play([{ type: "error", code: "aborted", platform: "ios" }], listening).state.error).toBeNull();
  });

  it("stopping before permission is answered starts nothing", () => {
    const { state } = play([{ type: "tap" }, { type: "tap" }, ready]);
    expect(state.status).toBe("idle");
  });

  it("stopping between runs ends at once", () => {
    const between = play([{ type: "end", now: 4_000 }], {
      ...listening,
      session: { ...listening.session!, heardInRun: true },
    }).state;
    const stopped = play([{ type: "tap" }], between);
    expect(stopped.state.status).toBe("idle");
    expect(stopped.effects).toContainEqual({ type: "cancel-restart" });
  });

  it("editing or sending keeps the words and turns the microphone off; leaving drops everything", () => {
    const hearing = play([{ type: "result", transcript: "and Friday", isFinal: false }], listening).state;
    const cancelled = play([{ type: "cancel" }], hearing);
    expect(cancelled.delivered).toEqual(["and Friday"]);
    expect(cancelled.effects).toContainEqual({ type: "abort" });
    const left = play([{ type: "unmount" }], hearing);
    expect(left.delivered).toEqual([]);
    expect(left.state).toEqual(initialDictation);
    expect(play([{ type: "cancel" }]).effects).toEqual([]);
  });

  it("ignores the recogniser while at rest", () => {
    for (const event of [
      { type: "started" },
      { type: "result", transcript: "x", isFinal: true },
      { type: "error", code: "network", platform: "ios" },
      { type: "end", now: 1 },
      { type: "restart", now: 1 },
      ready,
    ] as DictationEvent[]) {
      expect(dictationReducer(initialDictation, event)).toEqual({ state: initialDictation, effects: [] });
    }
  });
});

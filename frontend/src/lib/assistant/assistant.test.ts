import { describe, expect, it } from "vitest";
import type { AssistantAction, ChatMessage, TurnEvent } from "@/lib/api/types";
import { chatReducer, initialChat, UNFINISHED, visibleMessages, type ChatState } from "./chat-state";
import { boMood } from "./mood";
import { quickActions } from "./quick-actions";
import { richText } from "./rich-text";

const credits = {
  limit: 100,
  used: 2,
  remaining: 98,
  runningLow: false,
  limitReached: false,
  resetsOn: "2026-11-01",
  overage: false,
};
const action = (status: AssistantAction["status"] = "pending"): AssistantAction => ({
  id: "a1",
  tool: "create_booking",
  status,
  error: null,
  result: null,
  expiresAt: "",
  createdAt: "",
  decidedAt: null,
  proposal: {
    title: "New booking",
    summary: "Consult",
    changes: [],
    items: [],
    warnings: [],
    confirmLabel: "Book it",
    destructive: false,
  },
});
const stored = (id: string, role: ChatMessage["role"], text: string): ChatMessage => ({
  id,
  role,
  text,
  tools: [],
  actions: [],
  notice: null,
  createdAt: "t",
});
const run = (events: TurnEvent[], from: ChatState = initialChat) =>
  events.reduce(
    (s, event) => chatReducer(s, { type: "event", event }),
    chatReducer(from, { type: "send", text: "Book Robin", at: "t0" }),
  );

describe("chat state", () => {
  it("streams a reply, with tools and a proposal, then settles on the stored messages", () => {
    const mid = run([
      { type: "user_message", message: stored("u1", "user", "Book Robin") },
      {
        type: "tool",
        tool: { id: "t1", name: "check_availability", label: "Checking availability", status: "running" },
      },
      { type: "text", delta: "Found " },
      { type: "text", delta: "a slot." },
      {
        type: "tool",
        tool: {
          id: "t1",
          name: "check_availability",
          label: "Checking availability",
          status: "done",
          summary: "Found 3 free times",
        },
      },
      { type: "proposal", action: action() },
      { type: "text", delta: "Ready." },
    ]);
    expect(mid.status).toBe("streaming");
    const live = visibleMessages(mid);
    expect(live.map((m) => m.id)).toEqual(["u1", "live-reply"]);
    expect(live[1]).toMatchObject({
      text: "Found a slot.\n\nReady.",
      tools: [{ status: "done", summary: "Found 3 free times" }],
      actions: [{ id: "a1" }],
    });

    const done = chatReducer(mid, {
      type: "event",
      event: {
        type: "done",
        message: { ...stored("r1", "assistant", "Found a slot."), actions: [action()] },
        credits,
      },
    });
    expect(done).toMatchObject({ status: "idle", pending: null, outcome: "success", credits });
    expect(done.messages.map((m) => m.id)).toEqual(["u1", "r1"]);
    const confirmed = chatReducer(done, { type: "action-updated", action: action("confirmed") });
    expect(confirmed.messages[1]?.actions[0]?.status).toBe("confirmed");
    expect(chatReducer(confirmed, { type: "settle" }).outcome).toBeNull();
  });

  it("keeps errors and notices, and drops a message refused before the stream", () => {
    const limited = run([
      { type: "error", code: "AI_LIMIT_REACHED", message: "Used up." },
      { type: "notice", notice: { kind: "error", message: "Used up." } },
      { type: "done", message: null, credits },
    ]);
    expect(limited.error).toEqual({ code: "AI_LIMIT_REACHED", message: "Used up.", during: "turn" });
    expect(limited.outcome).toBe("error");
    expect(limited.messages[1]).toMatchObject({ role: "assistant", notice: { kind: "error" } });

    const refused = chatReducer(chatReducer(initialChat, { type: "send", text: "Hi", at: "t" }), {
      type: "failed",
      error: { code: "AI_NOT_CONFIGURED", message: "No." },
    });
    expect(refused).toMatchObject({
      messages: [],
      pending: null,
      status: "idle",
      outcome: "error",
      error: { during: "request" },
      unsent: { id: "local-t", text: "Hi" },
    });
    // A stream that closes without `done` settles the turn: what was said stays, and the turn failed.
    const cut = chatReducer(
      run([
        { type: "user_message", message: stored("u1", "user", "Book Robin") },
        { type: "text", delta: "Let me check" },
      ]),
      { type: "ended" },
    );
    expect(cut).toMatchObject({
      status: "idle",
      pending: null,
      outcome: "error",
      error: { ...UNFINISHED, during: "turn" },
    });
    expect(cut.messages.map((m) => [m.role, m.text])).toEqual([
      ["user", "Book Robin"],
      ["assistant", "Let me check"],
    ]);
    // The server's own error is kept; after `done` the end of the stream changes nothing.
    const failed = chatReducer(run([{ type: "error", code: "INTERNAL_SERVER_ERROR", message: "Oops." }]), {
      type: "ended",
    });
    expect(failed.error).toEqual({ code: "INTERNAL_SERVER_ERROR", message: "Oops.", during: "turn" });
    expect(failed.messages.map((m) => m.role)).toEqual(["user"]);
    expect(chatReducer(limited, { type: "ended" })).toBe(limited);

    // Loading a thread never replaces a turn in flight.
    const sending = chatReducer(initialChat, { type: "send", text: "Hi", at: "t" });
    expect(chatReducer(sending, { type: "load", messages: [stored("x", "user", "old")] }).messages).toEqual(
      [],
    );
  });
});

describe("Bo's mood", () => {
  const chat = { status: "idle" as const, outcome: null };
  it("follows the conversation", () => {
    expect(boMood({ open: false, typing: false, chat, nudges: 0 })).toBe("idle");
    expect(boMood({ open: false, typing: false, chat, nudges: 2 })).toBe("attention");
    expect(boMood({ open: true, typing: false, chat, nudges: 2 })).toBe("idle");
    expect(boMood({ open: true, typing: true, chat, nudges: 0 })).toBe("listening");
    expect(boMood({ open: true, typing: true, chat: { status: "sending", outcome: null }, nudges: 0 })).toBe(
      "thinking",
    );
    expect(
      boMood({ open: true, typing: false, chat: { status: "idle", outcome: "success" }, nudges: 0 }),
    ).toBe("success");
    expect(boMood({ open: true, typing: false, chat: { status: "idle", outcome: "error" }, nudges: 0 })).toBe(
      "error",
    );
  });
});

describe("quick actions", () => {
  it("speak the business's language and fit the role", () => {
    const words = { booking: "Appointment", bookings: "Appointments", customer: "Patient" };
    const staff = quickActions("staff", words);
    expect(staff.map((a) => a.label)).toEqual([
      "What's on today?",
      "Find a free slot",
      "Block time off",
      "New appointment",
    ]);
    expect(staff[0]).toMatchObject({
      kind: "ask",
      prompt: "What's on today? Give me a quick rundown of the appointments.",
    });
    expect(quickActions("owner", words).map((a) => a.id)).toContain("week");
  });
});

describe("rich text", () => {
  it("renders paragraphs, lists and bold, never HTML", () => {
    expect(richText("Hi **Avery**.\n\n- one\n- **two**\n1. first")).toEqual([
      {
        kind: "paragraph",
        inlines: [
          { text: "Hi ", bold: false },
          { text: "Avery", bold: true },
          { text: ".", bold: false },
        ],
      },
      {
        kind: "list",
        ordered: false,
        items: [[{ text: "one", bold: false }], [{ text: "two", bold: true }]],
      },
      { kind: "list", ordered: true, items: [[{ text: "first", bold: false }]] },
    ]);
    expect(richText("<b>x</b>")).toEqual([
      { kind: "paragraph", inlines: [{ text: "<b>x</b>", bold: false }] },
    ]);
  });
});

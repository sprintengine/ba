/**
 * The chat panel's state machine (pure): settled messages plus the reply that is streaming in, driven by the
 * server-sent events of a turn.
 */
import type {
  AiCredits,
  AssistantAction,
  AssistantNotice,
  ChatMessage,
  ToolActivity,
  TurnEvent,
} from "@/lib/api/types";

export type ChatStatus = "idle" | "sending" | "streaming";

/** The reply being streamed (not yet stored). */
export type DraftReply = {
  text: string;
  tools: ToolActivity[];
  actions: AssistantAction[];
  notice: AssistantNotice | null;
  /** Text after a tool call starts a new paragraph (each model step is its own block of words). */
  breakBeforeText: boolean;
};

/** Why a turn failed: refused before it started (`request`), or stopped part-way (`turn`, also shown as a notice). */
export type ChatError = { code: string; message: string; during: "request" | "turn" };

export type ChatState = {
  messages: ChatMessage[];
  /** The user's message and Bo's reply while a turn runs. */
  pending: { user: ChatMessage; reply: DraftReply } | null;
  status: ChatStatus;
  error: ChatError | null;
  credits: AiCredits | null;
  /** How the last finished turn went (drives Bo's face). */
  outcome: "success" | "error" | null;
  /** A message refused before its turn started, for the composer to put back (each refusal has its own id). */
  unsent: { id: string; text: string } | null;
};

export type ChatAction =
  | { type: "load"; messages: ChatMessage[] }
  | { type: "send"; text: string; at: string }
  | { type: "event"; event: TurnEvent }
  | { type: "failed"; error: Omit<ChatError, "during"> }
  /** The stream closed: settles a turn that ended without `done` (the connection or the server gave up). */
  | { type: "ended" }
  | { type: "action-updated"; action: AssistantAction }
  | { type: "settle" }
  | { type: "reset" };

export const initialChat: ChatState = {
  messages: [],
  pending: null,
  status: "idle",
  error: null,
  credits: null,
  outcome: null,
  unsent: null,
};

/** Shown when a turn's stream closes before Bo has finished and the server sent no error of its own. */
export const UNFINISHED: Omit<ChatError, "during"> = {
  code: "TURN_UNFINISHED",
  message: "Bo stopped before finishing that answer. Please try again.",
};

const emptyReply = (): DraftReply => ({
  text: "",
  tools: [],
  actions: [],
  notice: null,
  breakBeforeText: false,
});

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [...list, item];
}

/** The draft reply as a message (when the stream ended without a stored reply). */
function draftMessage(reply: DraftReply, id: string, at: string): ChatMessage | null {
  if (!reply.text && reply.tools.length === 0 && !reply.notice) return null;
  return {
    id,
    role: "assistant",
    text: reply.text,
    tools: reply.tools,
    actions: reply.actions,
    notice: reply.notice,
    createdAt: at,
  };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "load":
      return state.pending ? state : { ...state, messages: action.messages };
    case "send": {
      const user: ChatMessage = {
        id: `local-${action.at}`,
        role: "user",
        text: action.text,
        tools: [],
        actions: [],
        notice: null,
        createdAt: action.at,
      };
      return {
        ...state,
        pending: { user, reply: emptyReply() },
        status: "sending",
        error: null,
        outcome: null,
        unsent: null,
      };
    }
    case "failed": {
      // Nothing was stored (the request was refused before the stream): keep the words out of the log, and hand them
      // back to the composer.
      return {
        ...state,
        pending: null,
        status: "idle",
        error: { ...action.error, during: "request" },
        outcome: "error",
        unsent: state.pending && { id: state.pending.user.id, text: state.pending.user.text },
      };
    }
    case "ended": {
      // The stream closed without `done`: keep what was said so far, and say the turn stopped.
      const pending = state.pending;
      if (!pending) return state;
      const answer = draftMessage(pending.reply, `local-reply-${pending.user.id}`, pending.user.createdAt);
      return {
        ...state,
        messages: [...state.messages, pending.user, ...(answer ? [answer] : [])],
        pending: null,
        status: "idle",
        error: state.error ?? { ...UNFINISHED, during: "turn" },
        outcome: "error",
      };
    }
    case "action-updated":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.actions.some((a) => a.id === action.action.id)
            ? { ...m, actions: upsert(m.actions, action.action) }
            : m,
        ),
        pending: state.pending && {
          ...state.pending,
          reply: {
            ...state.pending.reply,
            actions: state.pending.reply.actions.map((a) => (a.id === action.action.id ? action.action : a)),
          },
        },
      };
    case "settle":
      return { ...state, outcome: null };
    case "reset":
      return initialChat;
    case "event":
      return applyEvent(state, action.event);
  }
}

function applyEvent(state: ChatState, event: TurnEvent): ChatState {
  const pending = state.pending;
  if (!pending) return state;
  const reply = pending.reply;
  switch (event.type) {
    case "user_message":
      return { ...state, pending: { ...pending, user: event.message } };
    case "text": {
      const gap = reply.breakBeforeText && reply.text ? "\n\n" : "";
      return {
        ...state,
        status: "streaming",
        pending: {
          ...pending,
          reply: { ...reply, text: reply.text + gap + event.delta, breakBeforeText: false },
        },
      };
    }
    case "tool":
      return {
        ...state,
        pending: {
          ...pending,
          reply: { ...reply, tools: upsert(reply.tools, event.tool), breakBeforeText: true },
        },
      };
    case "proposal":
      return {
        ...state,
        pending: { ...pending, reply: { ...reply, actions: upsert(reply.actions, event.action) } },
      };
    case "notice":
      return { ...state, pending: { ...pending, reply: { ...reply, notice: event.notice } } };
    case "error":
      return { ...state, error: { code: event.code, message: event.message, during: "turn" } };
    case "done": {
      const answer =
        event.message ?? draftMessage(reply, `local-reply-${pending.user.id}`, pending.user.createdAt);
      const failed = state.error !== null || answer?.notice != null;
      return {
        ...state,
        messages: [...state.messages, pending.user, ...(answer ? [answer] : [])],
        pending: null,
        status: "idle",
        credits: event.credits,
        outcome: failed ? "error" : "success",
      };
    }
  }
}

/** Everything to show: settled messages then the live turn. */
export function visibleMessages(state: ChatState): ChatMessage[] {
  if (!state.pending) return state.messages;
  const live = draftMessage(state.pending.reply, "live-reply", state.pending.user.createdAt);
  return [...state.messages, state.pending.user, ...(live ? [live] : [])];
}

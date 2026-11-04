"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { assistantApi } from "@/lib/api/assistant";
import { errorMessage, isApiError, isAbortError } from "@/lib/api/client";
import { useAssistantThread, useCreateThread } from "@/lib/api/hooks";
import { qk } from "@/lib/api/query-keys";
import type { AssistantAction } from "@/lib/api/types";
import { chatReducer, initialChat, visibleMessages } from "./chat-state";
import { SUCCESS_MS } from "./constants";

/**
 * One conversation with Bo: opens or starts a thread, sends messages and folds the streamed events into the chat
 * state. Leaving (a new chat, another thread, unmount) stops listening; the server still stores the reply.
 */
export function useAssistantChat(businessId: string) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [state, dispatch] = useReducer(chatReducer, initialChat);
  const thread = useAssistantThread(businessId, threadId);
  const createThread = useCreateThread(businessId);
  const queryClient = useQueryClient();
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (thread.data) dispatch({ type: "load", messages: thread.data.messages });
  }, [thread.data]);

  useEffect(() => {
    if (state.outcome !== "success") return;
    const t = setTimeout(() => dispatch({ type: "settle" }), SUCCESS_MS);
    return () => clearTimeout(t);
  }, [state.outcome]);

  useEffect(() => () => abort.current?.abort(), []);

  const busy = state.status !== "idle";

  /** Sends [text] in [thread] (a new thread when null). */
  const run = useCallback(
    async (text: string, thread: string | null) => {
      dispatch({ type: "send", text, at: new Date().toISOString() });
      const controller = new AbortController();
      abort.current = controller;
      /** This turn was left (another thread, a new chat, unmount): it no longer drives the panel. */
      const left = () => controller.signal.aborted;
      try {
        const id = thread ?? (await createThread.mutateAsync()).id;
        if (left()) return;
        if (!thread) setThreadId(id);
        for await (const event of assistantApi.send(businessId, id, text, controller.signal)) {
          dispatch({ type: "event", event });
        }
        // A stream that closes without `done` (the server gave up, a proxy cut it) must not leave Bo thinking.
        if (!left()) dispatch({ type: "ended" });
      } catch (err) {
        if (isAbortError(err) || left()) return;
        dispatch({
          type: "failed",
          error: { code: isApiError(err) ? err.code : "NETWORK_ERROR", message: errorMessage(err) },
        });
      } finally {
        // Titles, recent threads and credits changed; the stored thread replaces any snapshot fetched mid-turn.
        void queryClient.invalidateQueries({ queryKey: qk.business(businessId).assistant(), exact: true });
        void queryClient.invalidateQueries({ queryKey: qk.business(businessId).assistantThreads() });
      }
    },
    [businessId, createThread, queryClient],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (text && !busy) void run(text, threadId);
    },
    [busy, run, threadId],
  );

  /** Starts a new conversation with [raw] (a nudge or quick action), leaving any current one. */
  const startChat = useCallback(
    (raw: string) => {
      abort.current?.abort();
      dispatch({ type: "reset" });
      setThreadId(null);
      void run(raw.trim(), null);
    },
    [run],
  );

  const openThread = useCallback((id: string | null) => {
    abort.current?.abort();
    dispatch({ type: "reset" });
    setThreadId(id);
  }, []);

  const actionUpdated = useCallback(
    (action: AssistantAction) => dispatch({ type: "action-updated", action }),
    [],
  );

  return {
    threadId,
    state,
    messages: visibleMessages(state),
    busy,
    loading: !!threadId && thread.isPending,
    send,
    startChat,
    openThread,
    actionUpdated,
  };
}

export type AssistantChat = ReturnType<typeof useAssistantChat>;

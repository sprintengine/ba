"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAssistantState } from "@/lib/api/hooks";
import type { AssistantState } from "@/lib/api/types";
import { ASSISTANT_SHORTCUT } from "@/lib/assistant/constants";
import { boMood, type BoMood } from "@/lib/assistant/mood";
import { useAssistantChat, type AssistantChat } from "@/lib/assistant/use-assistant-chat";
import { useCurrentBusiness } from "@/lib/business/business-context";

export type AssistantView = "home" | "chat" | "memory";

/** What changes rarely: the panel, the view, Bo's mood and state. Stable while a turn streams. */
export type AssistantControls = {
  open: boolean;
  setOpen: (open: boolean) => void;
  view: AssistantView;
  setView: (view: AssistantView) => void;
  /** Opens Bo on a new conversation that starts with [prompt] (⌘K "Ask Bo…", nudges, quick actions). */
  ask: (prompt: string) => void;
  mood: BoMood;
  setTyping: (typing: boolean) => void;
  state: AssistantState | undefined;
  stateError: unknown;
};

type AssistantContextValue = AssistantControls & { chat: AssistantChat };

const AssistantControlsContext = createContext<AssistantControls | null>(null);
const AssistantChatContext = createContext<AssistantChat | null>(null);

/**
 * Bo's controls without the conversation, for the dashboard chrome (the launcher, ⌘K): a component using this
 * does not re-render for every streamed event, only when the panel, view, mood or state changes.
 */
export function useAssistantControls(): AssistantControls {
  const ctx = useContext(AssistantControlsContext);
  if (!ctx) throw new Error("useAssistant must be used inside <AssistantProvider>");
  return ctx;
}

/** Controls plus the conversation, for the panel's parts; re-renders with every streamed event. */
export function useAssistant(): AssistantContextValue {
  const controls = useAssistantControls();
  const chat = useContext(AssistantChatContext);
  if (!chat) throw new Error("useAssistant must be used inside <AssistantProvider>");
  return useMemo(() => ({ ...controls, chat }), [controls, chat]);
}

/** Bo's state for the dashboard: panel open/closed, current view, the conversation and Bo's mood. ⌘J toggles. */
export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const business = useCurrentBusiness();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AssistantView>("home");
  const [typing, setTyping] = useState(false);
  const chat = useAssistantChat(business.id);
  const assistant = useAssistantState(business.id);
  const nudges = assistant.data?.nudges.length ?? 0;
  const mood = boMood({ open, typing, chat: chat.state, nudges });
  const { startChat } = chat;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === ASSISTANT_SHORTCUT.key
      ) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // startChat changes identity as the turn streams; `ask` reads the latest through a ref so it, and the
  // controls with it, stay stable.
  const latest = useRef({ startChat, configured: !!assistant.data?.configured });
  useEffect(() => {
    latest.current = { startChat, configured: !!assistant.data?.configured };
  });
  const ask = useCallback((prompt: string) => {
    setOpen(true);
    setView("chat");
    if (prompt.trim() && latest.current.configured) latest.current.startChat(prompt);
  }, []);

  const controls = useMemo<AssistantControls>(
    () => ({
      open,
      setOpen,
      view,
      setView,
      ask,
      mood,
      setTyping,
      state: assistant.data,
      stateError: assistant.error,
    }),
    [open, view, ask, mood, assistant.data, assistant.error],
  );
  return (
    <AssistantControlsContext.Provider value={controls}>
      <AssistantChatContext.Provider value={chat}>{children}</AssistantChatContext.Provider>
    </AssistantControlsContext.Provider>
  );
}

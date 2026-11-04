/**
 * Bo's state for one business (the website's `AssistantProvider`, without the keyboard shortcut and the floating
 * launcher): the view (home, chat, memory), the conversation (`useAssistantChat`, shared with the website), Bo's mood
 * and the assistant's state (credits, nudges, recent threads).
 *
 * Two contexts, so the chrome (header, home, memory) doesn't re-render for every streamed word: only the chat log and
 * the composer read the conversation.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAssistantState } from "@shared/api/hooks/use-assistant";
import type { AssistantState } from "@shared/api/types";
import { boMood, type BoMood } from "@shared/assistant/mood";
import { useAssistantChat, type AssistantChat } from "@shared/assistant/use-assistant-chat";
import { useCurrentBusiness } from "@shared/business/business-context";

export type AssistantView = "home" | "chat" | "memory";

export type AssistantControls = {
  view: AssistantView;
  setView: (view: AssistantView) => void;
  /** Starts a new conversation with [prompt] (a nudge, a quick action). */
  ask: (prompt: string) => void;
  /** Opens a past conversation, or a new one (null). */
  openThread: (id: string | null) => void;
  mood: BoMood;
  setTyping: (typing: boolean) => void;
  state: AssistantState | undefined;
  stateError: unknown;
  stateLoading: boolean;
  retryState: () => void;
  /** Leaves Bo for an app page (a result link, a nudge): the modal closes first; the iPad panel stays. */
  navigate: (href: string) => void;
  /** Closes Bo (the modal, or the iPad panel). */
  close: () => void;
};

const ControlsContext = createContext<AssistantControls | null>(null);
const ChatContext = createContext<AssistantChat | null>(null);

export function useAssistantControls(): AssistantControls {
  const ctx = useContext(ControlsContext);
  if (!ctx) throw new Error("useAssistantControls must be used inside <AssistantProvider>");
  return ctx;
}

/** The conversation; re-renders with every streamed event. */
export function useChat(): AssistantChat {
  const chat = useContext(ChatContext);
  if (!chat) throw new Error("useChat must be used inside <AssistantProvider>");
  return chat;
}

export function AssistantProvider({
  children,
  onClose,
  onNavigate,
  initialPrompt,
}: {
  children: ReactNode;
  onClose: () => void;
  onNavigate: (href: string) => void;
  /** A conversation to start straight away (a deep link with `?ask=`). */
  initialPrompt?: string;
}) {
  const business = useCurrentBusiness();
  const [view, setView] = useState<AssistantView>("home");
  const [typing, setTyping] = useState(false);
  const chat = useAssistantChat(business.id);
  const assistant = useAssistantState(business.id);
  const mood = boMood({ open: true, typing, chat: chat.state, nudges: assistant.data?.nudges.length ?? 0 });
  const configured = !!assistant.data?.configured;

  // `startChat` changes identity as a turn streams; the controls read the latest through a ref so they stay stable.
  const latest = useRef({ startChat: chat.startChat, openThread: chat.openThread, configured });
  useEffect(() => {
    latest.current = { startChat: chat.startChat, openThread: chat.openThread, configured };
  });

  const ask = useCallback((prompt: string) => {
    setView("chat");
    if (prompt.trim() && latest.current.configured) latest.current.startChat(prompt);
  }, []);

  const openThread = useCallback((id: string | null) => {
    latest.current.openThread(id);
    setView("chat");
  }, []);

  const asked = useRef(false);
  useEffect(() => {
    if (initialPrompt && configured && !asked.current) {
      asked.current = true;
      ask(initialPrompt);
    }
  }, [initialPrompt, configured, ask]);

  const { refetch } = assistant;
  const controls = useMemo<AssistantControls>(
    () => ({
      view,
      setView,
      ask,
      openThread,
      mood,
      setTyping,
      state: assistant.data,
      stateError: assistant.error,
      stateLoading: assistant.isPending,
      retryState: () => void refetch(),
      navigate: onNavigate,
      close: onClose,
    }),
    [
      view,
      ask,
      openThread,
      mood,
      assistant.data,
      assistant.error,
      assistant.isPending,
      refetch,
      onClose,
      onNavigate,
    ],
  );
  return (
    <ControlsContext.Provider value={controls}>
      <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>
    </ControlsContext.Provider>
  );
}

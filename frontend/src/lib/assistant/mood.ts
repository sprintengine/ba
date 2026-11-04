/** Bo's expression, derived from what is going on (pure). */
import type { ChatState } from "./chat-state";

export type BoMood = "idle" | "listening" | "thinking" | "success" | "error" | "attention";

export const BO_MOODS: readonly BoMood[] = ["idle", "listening", "thinking", "success", "error", "attention"];

export function boMood(input: {
  open: boolean;
  typing: boolean;
  chat: Pick<ChatState, "status" | "outcome">;
  nudges: number;
}): BoMood {
  const { open, typing, chat, nudges } = input;
  if (chat.status !== "idle") return "thinking";
  if (chat.outcome === "error") return "error";
  if (chat.outcome === "success") return "success";
  if (open && typing) return "listening";
  if (!open && nudges > 0) return "attention";
  return "idle";
}

/** A short description of the mood for screen readers. */
export const MOOD_LABEL: Record<BoMood, string> = {
  idle: "ready",
  listening: "listening",
  thinking: "thinking",
  success: "happy",
  error: "concerned",
  attention: "has something to show you",
};

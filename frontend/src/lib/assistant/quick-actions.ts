/** Starting points shown before a conversation (pure). Prompts are phrased in the business's own words. */
import type { MemberRole } from "@/lib/api/types";
import { permissionsFor } from "@/lib/business/permissions";

export type QuickAction =
  | { kind: "ask"; id: string; label: string; prompt: string }
  | { kind: "link"; id: string; label: string; path: string };

type Words = { booking: string; bookings: string; customer: string };

export function quickActions(role: MemberRole, words: Words): QuickAction[] {
  const b = words.bookings.toLowerCase();
  const actions: QuickAction[] = [
    {
      kind: "ask",
      id: "today",
      label: "What's on today?",
      prompt: `What's on today? Give me a quick rundown of the ${b}.`,
    },
    { kind: "ask", id: "free", label: "Find a free slot", prompt: "When is the next free slot tomorrow?" },
    {
      kind: "ask",
      id: "time-off",
      label: "Block time off",
      prompt: "I need to block out some time. Can you help?",
    },
  ];
  if (permissionsFor(role).viewReports) {
    actions.push({
      kind: "ask",
      id: "week",
      label: "How was last week?",
      prompt: `How did last week go? ${words.bookings}, cancellations and no-shows.`,
    });
  }
  actions.push({
    kind: "link",
    id: "new",
    label: `New ${words.booking.toLowerCase()}`,
    path: "bookings?new=1",
  });
  return actions;
}

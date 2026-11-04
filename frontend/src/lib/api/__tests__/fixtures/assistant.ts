/** Bo (§17) fixtures: the panel's state, a thread with a proposal, and memory. */
import type {
  AssistantAction,
  AssistantState,
  AssistantThread,
  ChatMessage,
  MemoryEntry,
} from "@/lib/api/types";
import { aiCredits } from "./site";

export const assistantAction = {
  id: "00000000-0000-4000-8000-0000000000a0",
  tool: "cancel_booking",
  status: "confirmed",
  proposal: {
    title: "Cancel Rowan's appointment",
    summary: "Tuesday 6 October, 13:00",
    changes: [{ label: "Status", before: "Confirmed", after: "Cancelled" }],
    items: [{ title: "Refund", detail: "€15 back to the card" }],
    warnings: ["Rowan is told by email."],
    confirmLabel: "Cancel appointment",
    destructive: true,
  },
  result: { message: "Cancelled.", links: [{ label: "Open booking", path: "/bookings?booking=1" }] },
  error: null,
  expiresAt: "2026-10-01T10:15:00Z",
  createdAt: "2026-10-01T10:00:00Z",
  decidedAt: "2026-10-01T10:01:00Z",
} satisfies AssistantAction;

export const assistantActionSparse = {
  ...assistantAction,
  status: "pending",
  proposal: {
    ...assistantAction.proposal,
    changes: [{ label: "Status", before: null, after: null }],
    items: [{ title: "Refund", detail: null }],
  },
  result: null,
  decidedAt: null,
} satisfies AssistantAction;

const assistantMessage = {
  id: "00000000-0000-4000-8000-0000000000a1",
  role: "assistant",
  text: "I can cancel that for you.",
  tools: [
    { id: "t1", name: "find_bookings", label: "Looking up bookings", status: "done", summary: "1 booking" },
  ],
  actions: [assistantAction],
  notice: { kind: "truncated", message: "I stopped early." },
  createdAt: "2026-10-01T10:00:00Z",
} satisfies ChatMessage;

export const assistantThread = {
  id: "00000000-0000-4000-8000-0000000000a2",
  title: "Cancel Rowan",
  createdAt: "2026-10-01T09:59:00Z",
  updatedAt: "2026-10-01T10:01:00Z",
  messages: [
    {
      id: "00000000-0000-4000-8000-0000000000a3",
      role: "user",
      text: "Cancel Rowan's appointment",
      tools: [],
      actions: [],
      notice: null,
      createdAt: "2026-10-01T09:59:00Z",
    },
    assistantMessage,
  ],
} satisfies AssistantThread;

export const assistantState = {
  configured: true,
  credits: aiCredits,
  nudges: [
    {
      id: "00000000-0000-4000-8000-0000000000a4",
      kind: "pending_approvals",
      severity: "warning",
      title: "2 appointments need approval",
      body: "Rowan and Sam are waiting.",
      prompt: "Show me the pending appointments",
      action: { label: "Review", path: "/bookings?status=pending_approval" },
      createdAt: "2026-10-01T08:00:00Z",
    },
  ],
  threads: [{ id: assistantThread.id, title: assistantThread.title, updatedAt: assistantThread.updatedAt }],
  canEditMemory: true,
} satisfies AssistantState;

export const memoryEntry = {
  id: "00000000-0000-4000-8000-0000000000a5",
  text: "We close early on the first Friday of the month.",
  createdBy: "Avery Morgan",
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-02T10:00:00Z",
} satisfies MemoryEntry;

export const memoryEntrySparse = { ...memoryEntry, createdBy: null } satisfies MemoryEntry;

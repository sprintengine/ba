/**
 * Bo, the business assistant (architecture §17): the wire format as Zod schemas, so the streamed events are
 * validated at the boundary and the TypeScript types are derived from one source.
 */
import * as z from "zod";

export const aiCreditsSchema = z.object({
  limit: z.number(),
  used: z.number(),
  remaining: z.number(),
  runningLow: z.boolean(),
  limitReached: z.boolean(),
  resetsOn: z.string(),
  overage: z.boolean(),
});

export const proposalSchema = z.object({
  title: z.string(),
  summary: z.string(),
  changes: z.array(
    z.object({ label: z.string(), before: z.string().nullable(), after: z.string().nullable() }),
  ),
  items: z.array(z.object({ title: z.string(), detail: z.string().nullable() })),
  warnings: z.array(z.string()),
  confirmLabel: z.string(),
  destructive: z.boolean(),
});

export const actionLinkSchema = z.object({ label: z.string(), path: z.string() });

export const actionStatusSchema = z.enum(["pending", "confirmed", "rejected", "expired", "failed"]);

export const assistantActionSchema = z.object({
  id: z.string(),
  tool: z.string(),
  status: actionStatusSchema,
  proposal: proposalSchema,
  result: z.object({ message: z.string(), links: z.array(actionLinkSchema) }).nullable(),
  error: z.string().nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
});

export const toolActivitySchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  status: z.enum(["running", "done", "error"]),
  summary: z.string().nullable().optional(),
});

export const noticeSchema = z.object({
  kind: z.enum(["refusal", "truncated", "error"]),
  message: z.string(),
});

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  tools: z.array(toolActivitySchema),
  actions: z.array(assistantActionSchema),
  notice: noticeSchema.nullable(),
  createdAt: z.string(),
});

export const nudgeSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "pending_approvals",
    "no_show_streak",
    "quiet_tomorrow",
    "payments_not_set_up",
    "site_not_published",
    "ai_credits_low",
  ]),
  severity: z.enum(["info", "warning"]),
  title: z.string(),
  body: z.string(),
  prompt: z.string(),
  action: actionLinkSchema.nullable(),
  createdAt: z.string(),
});

export const threadSummarySchema = z.object({ id: z.string(), title: z.string(), updatedAt: z.string() });

/** One server-sent event of a turn (`POST …/assistant/threads/{id}/messages`). */
export const turnEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user_message"), message: chatMessageSchema }),
  z.object({ type: z.literal("text"), delta: z.string() }),
  z.object({ type: z.literal("tool"), tool: toolActivitySchema }),
  z.object({ type: z.literal("proposal"), action: assistantActionSchema }),
  z.object({ type: z.literal("notice"), notice: noticeSchema }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
  z.object({ type: z.literal("done"), message: chatMessageSchema.nullable(), credits: aiCreditsSchema }),
]);

export type AssistantProposal = z.infer<typeof proposalSchema>;
export type AssistantActionLink = z.infer<typeof actionLinkSchema>;
export type AssistantActionStatus = z.infer<typeof actionStatusSchema>;
export type AssistantAction = z.infer<typeof assistantActionSchema>;

/** One of the member's own AI apps' proposals (`/agent-requests`, §20.8), for them to approve or decline. */
export type AgentRequest = {
  action: AssistantAction;
  /** The app's name as it registered, e.g. "Claude". */
  app: string;
  /** Only the member can carry it out, here; false when the app may confirm it itself. */
  needsApproval: boolean;
  /** The app was disconnected since: it can't go ahead. */
  appDisconnected: boolean;
};
export type ToolActivity = z.infer<typeof toolActivitySchema>;
export type AssistantNotice = z.infer<typeof noticeSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type Nudge = z.infer<typeof nudgeSchema>;
export type ThreadSummary = z.infer<typeof threadSummarySchema>;
export type TurnEvent = z.infer<typeof turnEventSchema>;

/** `GET /assistant` */
export type AssistantState = {
  /** A model is connected; otherwise Bo shows nudges and quick actions but cannot chat. */
  configured: boolean;
  credits: z.infer<typeof aiCreditsSchema>;
  /** Owners and admins only (empty for staff). */
  nudges: Nudge[];
  threads: ThreadSummary[];
  canEditMemory: boolean;
};

/** `GET /assistant/threads/{id}` */
export type AssistantThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

/** Business memory entry (`/assistant/memory`). */
export type MemoryEntry = {
  id: string;
  text: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

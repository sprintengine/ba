import { api, apiStream } from "./client";
import { businessPath, seg } from "./paths";
import type {
  AgentRequest,
  AssistantAction,
  AssistantState,
  AssistantThread,
  MemoryEntry,
  ThreadSummary,
  TurnEvent,
} from "./types";

const base = (businessId: string, path = "") => businessPath(businessId, `/assistant${path}`);

/** Bo, the business assistant (§17). Every member; nudges and memory edits for owners and admins. */
export const assistantApi = {
  state: (businessId: string): Promise<AssistantState> => api.get<AssistantState>(base(businessId)),

  threads: (businessId: string): Promise<ThreadSummary[]> =>
    api.get<ThreadSummary[]>(base(businessId, "/threads")),

  createThread: (businessId: string): Promise<AssistantThread> =>
    api.post<AssistantThread>(base(businessId, "/threads")),

  thread: (businessId: string, threadId: string): Promise<AssistantThread> =>
    api.get<AssistantThread>(base(businessId, `/threads/${seg(threadId)}`)),

  deleteThread: (businessId: string, threadId: string): Promise<void> =>
    api.delete(base(businessId, `/threads/${seg(threadId)}`)),

  /**
   * Sends a message and yields the turn's events as they stream in (validated; unknown events are skipped).
   * Throws `ApiError` before the stream starts (e.g. `AI_LIMIT_REACHED`, `AI_NOT_CONFIGURED`).
   */
  send: async function* (
    businessId: string,
    threadId: string,
    text: string,
    signal?: AbortSignal,
  ): AsyncGenerator<TurnEvent> {
    // The schemas (and zod) load with the first message sent, not with every page that imports the API hooks.
    const { turnEventSchema } = await import("./assistant-schema");
    for await (const message of apiStream(
      base(businessId, `/threads/${seg(threadId)}/messages`),
      { text },
      { signal },
    )) {
      let json: unknown;
      try {
        json = JSON.parse(message.data);
      } catch {
        continue;
      }
      const event = turnEventSchema.safeParse(json);
      if (event.success) yield event.data;
    }
  },

  confirm: (businessId: string, actionId: string): Promise<AssistantAction> =>
    api.post<AssistantAction>(base(businessId, `/actions/${seg(actionId)}/confirm`)),

  reject: (businessId: string, actionId: string): Promise<AssistantAction> =>
    api.post<AssistantAction>(base(businessId, `/actions/${seg(actionId)}/reject`)),

  /** The member's own AI apps' proposals here from the last week, newest first (§20.8). */
  agentRequests: (businessId: string): Promise<AgentRequest[]> =>
    api.get<{ items: AgentRequest[] }>(businessPath(businessId, "/agent-requests")).then((r) => r.items),

  agentRequest: (businessId: string, id: string): Promise<AgentRequest> =>
    api.get<AgentRequest>(businessPath(businessId, `/agent-requests/${seg(id)}`)),

  /** Approves and carries out an AI app's proposal (only the member, signed in, can). */
  approveAgentRequest: (businessId: string, id: string): Promise<AgentRequest> =>
    api.post<AgentRequest>(businessPath(businessId, `/agent-requests/${seg(id)}/approve`)),

  declineAgentRequest: (businessId: string, id: string): Promise<AgentRequest> =>
    api.post<AgentRequest>(businessPath(businessId, `/agent-requests/${seg(id)}/decline`)),

  dismissNudge: (businessId: string, nudgeId: string): Promise<void> =>
    api.post<undefined>(base(businessId, `/nudges/${seg(nudgeId)}/dismiss`)),

  memory: (businessId: string): Promise<MemoryEntry[]> => api.get<MemoryEntry[]>(base(businessId, "/memory")),

  addMemory: (businessId: string, text: string): Promise<MemoryEntry> =>
    api.post<MemoryEntry>(base(businessId, "/memory"), { text }),

  updateMemory: (businessId: string, id: string, text: string): Promise<MemoryEntry> =>
    api.patch<MemoryEntry>(base(businessId, `/memory/${seg(id)}`), { text }),

  deleteMemory: (businessId: string, id: string): Promise<void> =>
    api.delete(base(businessId, `/memory/${seg(id)}`)),
};

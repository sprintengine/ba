/** A stateful fake of Bo's API for component tests, with turns streamed as real server-sent events. */
import type {
  AiCredits,
  AssistantAction,
  AssistantState,
  ChatMessage,
  MemoryEntry,
  Nudge,
  TurnEvent,
} from "@/lib/api/types";
import { json, mockApi } from "@/components/dashboard/test/render";

export const credits = (patch: Partial<AiCredits> = {}): AiCredits => ({
  limit: 1000,
  used: 12.5,
  remaining: 987.5,
  runningLow: false,
  limitReached: false,
  resetsOn: "2026-11-01",
  overage: false,
  ...patch,
});

export const nudge = (patch: Partial<Nudge> = {}): Nudge => ({
  id: "n1",
  kind: "pending_approvals",
  severity: "warning",
  title: "2 appointments waiting for approval",
  body: "Accept or decline them so the times aren't held for nothing.",
  prompt: "Show me the appointments waiting for my approval.",
  action: { label: "Review", path: "bookings?status=pending_approval" },
  createdAt: "2026-10-05T09:00:00+01:00",
  ...patch,
});

export const proposal = (patch: Partial<AssistantAction> = {}): AssistantAction => ({
  id: "act1",
  tool: "create_booking",
  status: "pending",
  error: null,
  result: null,
  expiresAt: "2026-10-05T09:30:00+01:00",
  createdAt: "2026-10-05T09:00:00+01:00",
  decidedAt: null,
  proposal: {
    title: "New booking",
    summary: "Consult for Robin Example, Tue 6 Oct, 10:00–11:00 with Alex",
    changes: [
      { label: "When", before: null, after: "Tue 6 Oct, 10:00–11:00" },
      { label: "Price", before: "€40", after: "€45" },
    ],
    items: [{ title: "BA-7K3F9Q · Consult · Jordan Casey", detail: "Stays booked" }],
    warnings: ["A new customer record will be created for Robin Example."],
    confirmLabel: "Book it",
    destructive: false,
  },
  ...patch,
});

export const reply = (patch: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m2",
  role: "assistant",
  text: "",
  tools: [],
  actions: [],
  notice: null,
  createdAt: "2026-10-05T09:00:00+01:00",
  ...patch,
});

/** A turn's response: a stream the test pushes events into (or closes) at its own pace. */
export class Turn {
  private controller!: ReadableStreamDefaultController<Uint8Array>;
  readonly response: Response;
  constructor() {
    const stream = new ReadableStream<Uint8Array>({ start: (c) => void (this.controller = c) });
    this.response = new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }
  push(...events: TurnEvent[]) {
    for (const e of events)
      this.controller.enqueue(new TextEncoder().encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
  }
  end(...events: TurnEvent[]) {
    this.push(...events);
    this.controller.close();
  }
}

export function fakeAssistantApi(initial: Partial<AssistantState> = {}) {
  const api = {
    state: {
      configured: true,
      credits: credits(),
      nudges: [],
      threads: [],
      canEditMemory: true,
      ...initial,
    },
    memory: [] as MemoryEntry[],
    /** What the next POST …/assistant/memory answers instead of storing the entry (e.g. an error). */
    nextMemoryResponse: null as Response | null,
    /** What the next PATCH or DELETE …/assistant/memory/{id} answers instead of applying it (e.g. an error). */
    nextMemoryEditResponse: null as Response | null,
    /** What the next POST …/messages answers: a Turn, or a Response (e.g. an error). */
    next: null as Turn | Response | null,
    /** While set, POST …/assistant/threads waits for it before answering. */
    creating: null as Promise<void> | null,
    sent: [] as string[],
    calls: [] as { method: string; path: string; body: unknown }[],
    fetch: null as unknown as ReturnType<typeof mockApi>,
  };
  /** The memory endpoints: list, add, edit and forget. `undefined` for any other request. */
  function memoryRoute(method: string, path: string, body: unknown): unknown {
    if (path.endsWith("/assistant/memory") && method === "GET") return api.memory;
    if (path.endsWith("/assistant/memory") && method === "POST" && api.nextMemoryResponse) {
      const response = api.nextMemoryResponse;
      api.nextMemoryResponse = null;
      return response;
    }
    if (path.endsWith("/assistant/memory") && method === "POST") {
      const entry: MemoryEntry = {
        id: `mem${api.memory.length + 1}`,
        text: (body as { text: string }).text,
        createdBy: "Avery Morgan",
        createdAt: "",
        updatedAt: "",
      };
      api.memory.push(entry);
      return json(entry, 201);
    }
    const memoryId = path.match(/\/assistant\/memory\/([^/]+)$/)?.[1];
    if (memoryId && api.nextMemoryEditResponse) {
      const response = api.nextMemoryEditResponse;
      api.nextMemoryEditResponse = null;
      return response;
    }
    if (memoryId && method === "PATCH") {
      api.memory = api.memory.map((m) =>
        m.id === memoryId ? { ...m, text: (body as { text: string }).text } : m,
      );
      return api.memory.find((m) => m.id === memoryId);
    }
    if (memoryId && method === "DELETE") {
      api.memory = api.memory.filter((m) => m.id !== memoryId);
      return new Response(null, { status: 204 });
    }
    return undefined;
  }
  api.fetch = mockApi((method, path, body) => {
    api.calls.push({ method, path, body });
    if (path.endsWith("/assistant") && method === "GET") return api.state;
    if (path.endsWith("/assistant/threads") && method === "POST")
      return json({ id: "t1", title: "", createdAt: "", updatedAt: "", messages: [] }, 201);
    if (/\/assistant\/threads\/[^/]+$/.test(path))
      return { id: "t1", title: "", createdAt: "", updatedAt: "", messages: [] };
    if (path.endsWith("/messages")) {
      api.sent.push((body as { text: string }).text);
      const next = api.next;
      api.next = null;
      return next instanceof Turn
        ? next.response
        : (next ?? json({ error: { code: "INTERNAL_SERVER_ERROR", message: "No turn scripted" } }, 500));
    }
    const decided = path.match(/\/actions\/([^/]+)\/(confirm|reject)$/);
    if (decided) {
      return decided[2] === "confirm"
        ? proposal({
            status: "confirmed",
            result: {
              message: "Booked Consult for Robin Example (BA-NEW001).",
              links: [{ label: "Open calendar", path: "calendar?date=2026-10-06" }],
            },
          })
        : proposal({ status: "rejected" });
    }
    if (/\/nudges\/[^/]+\/dismiss$/.test(path)) return new Response(null, { status: 204 });
    const remembered = memoryRoute(method, path, body);
    if (remembered !== undefined) return remembered;
    return {};
  });
  const respond = api.fetch.getMockImplementation()!;
  api.fetch.mockImplementation(async (input, init) => {
    const creating = String(input).endsWith("/assistant/threads") && init?.method === "POST";
    if (creating && api.creating) await api.creating;
    return respond(input, init);
  });
  return api;
}

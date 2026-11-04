/** Test helpers for the OAuth screens: auth state, query client, tooltips and a routed fetch stub. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { ConnectedApp } from "@/lib/api/types";
import { AuthContext } from "@/lib/auth/context";
import type { AuthState } from "@/lib/auth/types";
import { TooltipProvider } from "@/components/ui/tooltip";

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

export const apiError = (status: number, code: string, message: string) =>
  json({ error: { code, message } }, status);

type Route = (method: string, path: string, body: unknown) => unknown;

/** Stub `fetch` with a router `(method, path, body) => body | Response`. Returns the mock. */
export function mockApi(route: Route) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const result = route(method, url.pathname.replace(/^\/api/, ""), body);
    if (result instanceof Response) return result;
    if (result === undefined) return new Response(null, { status: 204 });
    return json(result);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** `METHOD /path` for every call made to the stub. */
export const calls = (m: ReturnType<typeof vi.fn>) =>
  m.mock.calls.map(
    ([u, init]) =>
      `${(init as RequestInit | undefined)?.method ?? "GET"} ${new URL(String(u), "http://x").pathname.replace(/^\/api/, "")}`,
  );

export function authState(patch: Partial<AuthState> = {}): AuthState {
  return {
    isLoaded: true,
    isSignedIn: true,
    user: { id: "dev_customer", email: "rowan@example.test", name: "Rowan Example", imageUrl: null },
    getToken: async () => null,
    signOut: vi.fn(async () => {}),
    mode: "dev",
    ...patch,
  };
}

export function renderWithProviders(ui: React.ReactElement, auth: AuthState = authState()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <AuthContext.Provider value={auth}>
      <QueryClientProvider client={client}>
        <TooltipProvider>{ui}</TooltipProvider>
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
}

/** Replace `window.location` with spies for assign/replace. */
export function stubLocation() {
  const assign = vi.fn();
  const replace = vi.fn();
  vi.stubGlobal("location", { ...window.location, origin: window.location.origin, assign, replace });
  return { assign, replace };
}

export function connectedApp(patch: Partial<ConnectedApp> = {}): ConnectedApp {
  return {
    id: "grant-1",
    clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata",
    name: "Claude",
    clientUri: "https://claude.ai",
    kind: "metadata_document",
    redirectHost: "claude.ai",
    audience: "customer",
    scopes: [
      { key: "bookings:read", label: "See your bookings", description: "Upcoming and past bookings." },
      {
        key: "bookings:write",
        label: "Book, reschedule and cancel for you",
        description: "Paid bookings still need you to pay.",
      },
    ],
    connectedAt: "2026-09-20T10:00:00Z",
    lastUsedAt: null,
    ...patch,
  };
}

/**
 * Stub the API at the network edge, like the website's tests (frontend/src/components/oauth/__tests__/render.tsx):
 * a router `(method, path, body) => body | Response`. Real client, hooks and query keys run; only fetch is fake.
 *
 *   const api = mockApi((method, path) => (path === "/v1/me/bookings" ? myBookings : undefined));
 *   expect(calls(api)).toContain("GET /v1/me/bookings");
 */
import { configureApiClient } from "@shared/api/client";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The backend's error envelope. */
export const apiError = (status: number, code: string, message: string) =>
  json({ error: { code, message, fields: {} } }, status);

/** A fetch that never settles (a loading state). */
export const pending = () => new Promise<Response>(() => undefined);

export type ApiRoute = (method: string, path: string, body: unknown) => unknown;

export function mockApi(route: ApiRoute) {
  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    const result = await route(method, url.pathname, body);
    if (result instanceof Response) return result;
    if (result === undefined) return apiError(404, "NOT_FOUND", `No mock for ${method} ${url.pathname}`);
    return json(result);
  });
  configureApiClient({ fetch: fetchMock as unknown as typeof fetch });
  // The app's own client fetch (`expo/fetch`, mocked in jest.setup.ts to the global one) lands here too, in case the
  // root layout configures the client after this stub.
  jest.spyOn(globalThis, "fetch").mockImplementation(fetchMock);
  return fetchMock;
}

/** `METHOD /path` for every call made to the stub. */
export function calls(mock: jest.Mock) {
  return mock.mock.calls.map(([input, init]) => {
    const method = (init as RequestInit | undefined)?.method ?? "GET";
    return `${method} ${new URL(String(input)).pathname}`;
  });
}

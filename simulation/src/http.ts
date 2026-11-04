/**
 * Runs the website's own API client (`frontend/src/lib/api`, shared with the mobile app) for every bot, so the
 * simulation exercises the client too. The client is a module-level singleton; each action runs in an
 * AsyncLocalStorage context that says who is calling (their token) and which action the request belongs to, and the
 * instrumented fetch records every request: X-Request-Id, status, error code and latency.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { configureApiClient, isApiError } from "@shared/api/client";
import { endpointOf } from "./stats";

export type CallContext = {
  /** The actor's bearer token, or null for anonymous (guest) calls. */
  token: string | null;
  actor: string;
  /** The action's sequence number in the run. */
  seq: number;
  businessId?: string;
  /** The bookings the action works on (logged with its requests, so a violation's trail finds them). */
  bookingIds?: Set<string>;
  /** The last request made in this context (for violations found from its answer). */
  last?: RequestRecord;
  /** The action's own context when this one acts as someone else inside it (`Sim.as`): it sees their requests too. */
  parent?: CallContext;
};

export type RequestRecord = {
  method: string;
  path: string;
  endpoint: string;
  status: number;
  /** The backend's error code for a non-2xx answer. */
  code: string | null;
  requestId: string;
  ms: number;
  sentAt: number;
  receivedAt: number;
};

const context = new AsyncLocalStorage<CallContext>();

/** Runs [fn] as [ctx]'s actor: its requests carry its token and are logged under its action. */
export function runAs<T>(ctx: CallContext, fn: () => Promise<T>): Promise<T> {
  return context.run(ctx, fn);
}

export function currentCall(): CallContext | undefined {
  return context.getStore();
}

/**
 * Notes that the current action works on [businessId] (and [bookingId]), for the log: its later requests and its action
 * entry carry them. A nested context (`Sim.as`) passes them on to the action's own.
 */
export function focus(businessId: string | undefined, bookingId?: string) {
  for (let c = context.getStore(); c; c = c.parent) {
    if (businessId) c.businessId = businessId;
    if (bookingId) (c.bookingIds ??= new Set()).add(bookingId);
  }
}

/** The last request of the current action (null outside one or before its first request). */
export function lastRequest(): RequestRecord | null {
  return context.getStore()?.last ?? null;
}

export type RequestListener = (record: RequestRecord, ctx: CallContext | undefined) => void;

let counter = 0;

/**
 * Points the shared client at [baseUrl] with the instrumented fetch. [runTag] prefixes each X-Request-Id
 * (`sim-<run>-<n>`), so a request in the action log is easy to find in the backend's log.
 */
export function installClient(baseUrl: string, runTag: string, onRequest: RequestListener) {
  const tag = runTag.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 40) || "run";
  const instrumented: typeof fetch = async (input, init) => {
    const ctx = context.getStore();
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const requestId = `sim-${tag}-${++counter}`;
    const headers = new Headers(init?.headers);
    headers.set("X-Request-Id", requestId);
    const sentAt = Date.now();
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers });
    } catch (cause) {
      const record: RequestRecord = {
        method,
        path: pathOf(url),
        endpoint: endpointOf(method, url),
        status: 0,
        code: "NETWORK_ERROR",
        requestId,
        ms: Date.now() - sentAt,
        sentAt,
        receivedAt: Date.now(),
      };
      remember(ctx, record);
      onRequest(record, ctx);
      throw cause;
    }
    const receivedAt = Date.now();
    let code: string | null = null;
    if (!response.ok) {
      const text = await response.clone().text();
      try {
        code = (JSON.parse(text) as { error?: { code?: string } }).error?.code ?? null;
      } catch {
        code = null;
      }
    }
    const record: RequestRecord = {
      method,
      path: pathOf(url),
      endpoint: endpointOf(method, url),
      status: response.status,
      code,
      requestId: response.headers.get("X-Request-Id") ?? requestId,
      ms: receivedAt - sentAt,
      sentAt,
      receivedAt,
    };
    remember(ctx, record);
    onRequest(record, ctx);
    return response;
  };
  configureApiClient({ baseUrl, fetch: instrumented, getToken: () => context.getStore()?.token ?? null });
}

function remember(ctx: CallContext | undefined, record: RequestRecord) {
  for (let c = ctx; c; c = c.parent) c.last = record;
}

function pathOf(url: string): string {
  return url.replace(/^[a-z]+:\/\/[^/]+/i, "");
}

/** The outcome of a call: its value, or the API error code it failed with. */
export type Outcome<T> =
  { ok: true; value: T } | { ok: false; status: number; code: string; message: string };

/** Awaits [promise] and returns its value or API error as data (other errors are rethrown). */
export async function attempt<T>(promise: Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    if (isApiError(error))
      return { ok: false, status: error.status, code: error.code, message: error.message };
    throw error;
  }
}

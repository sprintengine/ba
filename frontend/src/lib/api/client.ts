/**
 * Typed fetch client for the bookanything API, shared by the website and the mobile app (`mobile/`), so it uses
 * no DOM or Next.js API.
 *
 * - Base URL is `/api` on the website (Next rewrites to the backend; see next.config.ts), so
 *   `apiFetch("/v1/me")` hits `${BACKEND_ORIGIN}/v1/me`. The mobile app talks to the API origin directly
 *   (`configureApiClient`).
 * - JSON in/out. Non-2xx responses throw `ApiError` with the backend's
 *   `{error:{code,message,fields}}` envelope.
 * - The bearer token comes from the auth layer via `setAuthTokenGetter`
 *   (registered by `AuthProvider`); components never deal with tokens.
 *
 * Components must not call this directly — use the endpoint modules
 * (`src/lib/api/*.ts`) through the TanStack Query hooks in `src/lib/api/hooks`.
 */

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SLOT_UNAVAILABLE"
  /** A public booking would no longer cost the `expectedTotalCents` the customer was shown: nothing was booked. */
  | "PRICE_CHANGED"
  | "RATE_LIMITED"
  | "PLAN_LIMIT_REACHED"
  | "PAYMENTS_NOT_CONFIGURED"
  | "POLICY_VIOLATION"
  | "SLUG_TAKEN"
  | "INVALID_TIMEZONE"
  | "DATABASE_UNAVAILABLE"
  | "INTERNAL_SERVER_ERROR"
  | "NETWORK_ERROR"
  /** 5xx without our error envelope: the backend is down or unreachable behind the /api rewrite. */
  | "SERVICE_UNAVAILABLE"
  /** The business's monthly AI credits are used up (§16). */
  | "AI_LIMIT_REACHED"
  /** No AI model is configured on the server: Bo can't chat (§17). */
  | "AI_NOT_CONFIGURED"
  /** No image storage configured on the server (§15.7). */
  | "UPLOADS_NOT_CONFIGURED"
  /** The request body is larger than the endpoint accepts (413). */
  | "PAYLOAD_TOO_LARGE"
  | (string & {});

/** The body of every non-2xx API response (`Error` in the OpenAPI spec). `fields` is empty unless a field is at fault. */
export type ApiErrorBody = {
  error: { code: ApiErrorCode; message: string; fields: Record<string, string> };
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields: Record<string, string>;

  constructor(status: number, code: ApiErrorCode, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  get isUnauthenticated() {
    return this.status === 401 || this.code === "UNAUTHENTICATED";
  }
  get isForbidden() {
    return this.status === 403 || this.code === "FORBIDDEN";
  }
  /** Network failure or backend down — show "can't reach" copy with a retry. */
  get isUnavailable() {
    return (
      this.code === "NETWORK_ERROR" ||
      this.code === "SERVICE_UNAVAILABLE" ||
      this.code === "DATABASE_UNAVAILABLE"
    );
  }
  get isNotFound() {
    return this.status === 404 || this.code === "NOT_FOUND";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** A user-presentable message for any thrown value. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  if (isApiError(error)) return error.message || fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export type TokenGetter = () => Promise<string | null> | string | null;
let tokenGetter: TokenGetter | null = null;

/** Called by the auth layer. Pass `null` to clear. */
export function setAuthTokenGetter(getter: TokenGetter | null) {
  tokenGetter = getter;
}

const DEFAULT_API_BASE = "/api";
let apiBase = DEFAULT_API_BASE;
/** null: the global `fetch`, looked up per request (tests stub it). */
let fetchImpl: typeof fetch | null = null;

export type ApiClientConfig = {
  /** Prefix of every path: `/api` on the website, the API origin (`https://api.bookanything.ie`) on mobile. */
  baseUrl?: string;
  /** Another fetch implementation, e.g. `expo/fetch` on mobile, whose responses can stream. null = the global one. */
  fetch?: typeof fetch | null;
  /** Same as `setAuthTokenGetter`. */
  getToken?: TokenGetter | null;
};

/**
 * Configures the client for a platform. The website never calls it (same-origin `/api`); the mobile app calls it
 * once at start-up. Omitted keys keep their current value; `baseUrl: undefined` and a trailing slash are ignored.
 */
export function configureApiClient(config: ApiClientConfig) {
  if (config.baseUrl !== undefined) apiBase = config.baseUrl.replace(/\/+$/, "");
  if (config.fetch !== undefined) fetchImpl = config.fetch;
  if (config.getToken !== undefined) tokenGetter = config.getToken;
}

/** The current API base (`/api` unless configured). */
export function apiBaseUrl(): string {
  return apiBase;
}

/** Tests only: back to the website's defaults (same-origin `/api`, global fetch, no token). */
export function resetApiClientForTests() {
  apiBase = DEFAULT_API_BASE;
  fetchImpl = null;
  tokenGetter = null;
}

export type Query = Record<string, string | number | boolean | null | undefined | string[]>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  /** Sent as `Idempotency-Key`. Use `newIdempotencyKey()` once per user intent. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /**
   * Give up after this long and throw a NETWORK_ERROR `ApiError`; null = never. Defaults to
   * `DEFAULT_READ_TIMEOUT_MS` for GETs and to none for writes, which may legitimately be slow (AI drafts,
   * uploads) and whose timeout couldn't tell whether they happened.
   */
  timeoutMs?: number | null;
  /** Skip the Authorization header even when signed in. */
  anonymous?: boolean;
}

/** How long a read may hang (a stalled connection, a backend stuck behind the rewrite) before we say so. */
export const DEFAULT_READ_TIMEOUT_MS = 15_000;

/** Build `?a=1&b=x,y` from a query object, dropping null/undefined/"" values; arrays are comma-joined. */
export function buildQuery(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    if (raw === undefined || raw === null || raw === "") continue;
    if (Array.isArray(raw)) {
      if (raw.length === 0) continue;
      params.set(key, raw.join(","));
    } else {
      params.set(key, String(raw));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** A fresh idempotency key (UUID v4). Generate once per submit intent and reuse on retry. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** The caller's signal, plus a timeout when one applies (AbortSignal.any where the browser has it). */
function requestSignal(signal: AbortSignal | undefined, timeoutMs: number | null): AbortSignal | undefined {
  if (timeoutMs === null || typeof AbortSignal.timeout !== "function") return signal;
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  return typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : signal;
}

/**
 * What to throw when fetching or reading a response fails: the caller's own abort as is (TanStack Query and
 * the assistant expect an AbortError), anything else, a timeout included, as a NETWORK_ERROR `ApiError`.
 */
function fetchFailure(cause: unknown, callerSignal: AbortSignal | undefined): unknown {
  if (callerSignal?.aborted || isAbortError(cause)) return cause;
  if (isTimeoutError(cause)) {
    return new ApiError(
      0,
      "NETWORK_ERROR",
      "bookanything is taking too long to answer. Check your connection and try again.",
    );
  }
  return new ApiError(
    0,
    "NETWORK_ERROR",
    "We couldn't reach bookanything. Check your connection and try again.",
  );
}

function isTimeoutError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "TimeoutError";
}

async function send(
  path: string,
  options: RequestOptions,
  accept: string,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const { method = "GET", query, body, headers = {}, idempotencyKey, anonymous } = options;
  const finalHeaders: Record<string, string> = { Accept: accept, ...headers };
  // FormData (uploads) sets its own multipart Content-Type with the boundary.
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isForm) finalHeaders["Content-Type"] = "application/json";
  if (idempotencyKey) finalHeaders["Idempotency-Key"] = idempotencyKey;
  if (!anonymous && tokenGetter) {
    const token = await tokenGetter();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }
  try {
    return await (fetchImpl ?? fetch)(`${apiBase}${path}${buildQuery(query)}`, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal,
      credentials: "same-origin",
    });
  } catch (cause) {
    throw fetchFailure(cause, options.signal);
  }
}

/** Whether [error] is the rejection of an aborted request (a DOMException named AbortError). */
export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The ApiError for a non-2xx response body (our `{error:{code,message,fields}}` envelope, or a generic one). */
function errorFor(status: number, data: unknown): ApiError {
  // Any body may arrive here (a proxy's HTML page, an empty 502), so every part of the envelope is optional.
  const envelope = (data as { error?: Partial<ApiErrorBody["error"]> } | undefined)?.error;
  if (!envelope && status >= 500) {
    return new ApiError(
      status,
      "SERVICE_UNAVAILABLE",
      "bookanything is temporarily unavailable. Please try again shortly.",
    );
  }
  return new ApiError(
    status,
    envelope?.code ?? defaultCodeFor(status),
    envelope?.message ?? defaultMessageFor(status),
    envelope?.fields ?? {},
  );
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", timeoutMs = method === "GET" ? DEFAULT_READ_TIMEOUT_MS : null } = options;
  const signal = requestSignal(options.signal, timeoutMs);
  const response = await send(path, options, "application/json", signal);
  if (response.status === 204) return undefined as T;
  let text: string;
  try {
    // The timeout covers the body too: a response can stall after its headers.
    text = await response.text();
  } catch (cause) {
    throw fetchFailure(cause, options.signal);
  }
  const data = parseJson(text);
  if (!response.ok) throw errorFor(response.status, data);
  return data as T;
}

/** One server-sent event. */
export type SseMessage = { event: string; data: string };

/**
 * Incremental SSE parser: feed it decoded text as it arrives; it returns the complete events so far. Comments
 * (`: …`) are skipped; multi-line `data:` fields are joined with newlines.
 */
function createSseParser() {
  let buffer = "";
  return (chunk: string): SseMessage[] => {
    buffer += chunk.replace(/\r\n/g, "\n");
    const out: SseMessage[] = [];
    let end = buffer.indexOf("\n\n");
    while (end >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith(":") || line === "") continue;
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
      }
      if (data.length) out.push({ event, data: data.join("\n") });
      end = buffer.indexOf("\n\n");
    }
    return out;
  };
}

/**
 * POST a JSON body and read the answer as server-sent events. Errors before the stream starts throw `ApiError`
 * exactly like `apiFetch`; abort with `signal`.
 */
export async function* apiStream(
  path: string,
  body: unknown,
  options: Pick<RequestOptions, "signal"> = {},
): AsyncGenerator<SseMessage> {
  // No timeout: a stream stays open for as long as the turn runs.
  const response = await send(
    path,
    { method: "POST", body, signal: options.signal },
    "text/event-stream",
    options.signal,
  );
  if (!response.ok) throw errorFor(response.status, parseJson(await response.text()));
  if (!response.body) return;
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const parse = createSseParser();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      yield* parse(value);
    }
  } finally {
    // Stops the download too when the consumer stops early (e.g. the panel closed).
    await reader.cancel().catch(() => undefined);
  }
}

function defaultCodeFor(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return "INVALID_REQUEST";
    case 401:
      return "UNAUTHENTICATED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMITED";
    case 503:
      return "DATABASE_UNAVAILABLE";
    default:
      return "INTERNAL_SERVER_ERROR";
  }
}

function defaultMessageFor(status: number): string {
  switch (status) {
    case 401:
      return "Please sign in to continue.";
    case 403:
      return "You don't have access to this.";
    case 404:
      return "We couldn't find that.";
    case 429:
      return "Too many requests. Please wait a moment and try again.";
    case 502:
    case 503:
    case 504:
      return "bookanything is temporarily unavailable. Please try again shortly.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/** Convenience verbs. */
export const api = {
  get: <T>(path: string, query?: Query, options?: Omit<RequestOptions, "method" | "query">) =>
    apiFetch<T>(path, { ...options, method: "GET", query }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "PATCH", body }),
  delete: <T = void>(path: string, options?: Omit<RequestOptions, "method">) =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
};

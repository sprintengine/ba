import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  api,
  apiFetch,
  apiBaseUrl,
  apiStream,
  buildQuery,
  configureApiClient,
  DEFAULT_READ_TIMEOUT_MS,
  errorMessage,
  isAbortError,
  isApiError,
  newIdempotencyKey,
  resetApiClientForTests,
  setAuthTokenGetter,
  type SseMessage,
} from "./client";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), init: init!, headers: init!.headers as Record<string, string> };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  setAuthTokenGetter(null);
  resetApiClientForTests();
  vi.unstubAllGlobals();
});

describe("buildQuery", () => {
  it("returns an empty string for no query", () => {
    expect(buildQuery()).toBe("");
    expect(buildQuery({})).toBe("");
  });

  it("comma-joins arrays and drops null, undefined, empty strings and empty arrays", () => {
    const query = buildQuery({
      serviceId: "s1",
      addonIds: ["a1", "a2"],
      status: [],
      optionId: null,
      groupId: undefined,
      q: "",
      limit: 50,
      includePrivate: true,
    });
    const params = new URLSearchParams(query.slice(1));
    expect(query.startsWith("?")).toBe(true);
    expect(Object.fromEntries(params)).toEqual({
      serviceId: "s1",
      addonIds: "a1,a2",
      limit: "50",
      includePrivate: "true",
    });
  });

  it("URL-encodes values", () => {
    expect(buildQuery({ q: "a&b c" })).toBe("?q=a%26b+c");
  });
});

describe("apiFetch", () => {
  it("prefixes /api, sends Accept and parses JSON", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "ok" }));
    await expect(apiFetch("/v1/health")).resolves.toEqual({ status: "ok" });
    const { url, init, headers } = lastCall();
    expect(url).toBe("/api/v1/health");
    expect(init.method).toBe("GET");
    expect(headers.Accept).toBe("application/json");
    expect(headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it("appends the query string", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await api.get("/v1/x", { ids: ["a", "b"], cursor: null });
    expect(lastCall().url).toBe("/api/v1/x?ids=a%2Cb");
  });

  it("injects the bearer token from the registered getter", async () => {
    setAuthTokenGetter(async () => "tok-123");
    fetchMock.mockResolvedValue(jsonResponse({}));
    await api.get("/v1/me");
    expect(lastCall().headers.Authorization).toBe("Bearer tok-123");
  });

  it("omits Authorization when the getter returns null, or when anonymous", async () => {
    setAuthTokenGetter(() => null);
    fetchMock.mockResolvedValue(jsonResponse({}));
    await api.get("/v1/me");
    expect(lastCall().headers.Authorization).toBeUndefined();

    setAuthTokenGetter(() => "tok");
    fetchMock.mockResolvedValue(jsonResponse({}));
    await apiFetch("/v1/public/templates", { anonymous: true });
    expect(lastCall().headers.Authorization).toBeUndefined();
  });

  it("serialises JSON bodies with Content-Type", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "1" }));
    await api.post("/v1/things", { name: "Bay 1", tags: ["x"] });
    const { init, headers } = lastCall();
    expect(init.method).toBe("POST");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Bay 1", tags: ["x"] });
  });

  it("sends the Idempotency-Key header", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 201));
    await api.post("/v1/things", {}, { idempotencyKey: "key-1" });
    expect(lastCall().headers["Idempotency-Key"]).toBe("key-1");
  });

  it("returns undefined for 204 No Content", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.delete("/v1/things/1")).resolves.toBeUndefined();
    expect(lastCall().init.method).toBe("DELETE");
  });

  it("maps the error envelope to ApiError", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "SLOT_UNAVAILABLE",
            message: "That time was just taken.",
            fields: { start: "taken" },
          },
        },
        409,
      ),
    );
    const error = await api.post("/v1/bookings", {}).catch((e: unknown) => e);
    expect(isApiError(error)).toBe(true);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(409);
    expect(apiError.code).toBe("SLOT_UNAVAILABLE");
    expect(apiError.message).toBe("That time was just taken.");
    expect(apiError.fields).toEqual({ start: "taken" });
    expect(errorMessage(apiError)).toBe("That time was just taken.");
  });

  it("falls back to status-based code and message for non-JSON error bodies", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 404 }));
    const error = (await api.get("/v1/nope").catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.isNotFound).toBe(true);
    expect(error.message).toBe("We couldn't find that.");
    expect(error.fields).toEqual({});
  });

  it("maps envelope-less 5xx (backend down behind the rewrite) to SERVICE_UNAVAILABLE", async () => {
    fetchMock.mockResolvedValue(new Response("Internal Server Error", { status: 500 }));
    const error = (await api.get("/v1/me").catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("SERVICE_UNAVAILABLE");
    expect(error.isUnavailable).toBe(true);
  });

  it("flags 401 as unauthenticated", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    const error = (await api.get("/v1/me").catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("UNAUTHENTICATED");
    expect(error.isUnauthenticated).toBe(true);
  });

  it("maps network failures to NETWORK_ERROR", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const error = (await api.get("/v1/me").catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.code).toBe("NETWORK_ERROR");
  });

  it("rethrows aborts untouched", async () => {
    const abort = new DOMException("Aborted", "AbortError");
    fetchMock.mockRejectedValue(abort);
    await expect(api.get("/v1/me")).rejects.toBe(abort);
  });
});

describe("configureApiClient (mobile)", () => {
  it("talks to the configured origin instead of /api, without a trailing slash", async () => {
    configureApiClient({ baseUrl: "http://192.168.0.10:8080/" });
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await apiFetch("/v1/me", { query: { a: 1 } });
    expect(lastCall().url).toBe("http://192.168.0.10:8080/v1/me?a=1");
    expect(apiBaseUrl()).toBe("http://192.168.0.10:8080");
  });

  it("uses the configured fetch and token getter, and keeps what a later call omits", async () => {
    const own = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
    configureApiClient({ baseUrl: "https://api.example.test", fetch: own, getToken: () => "tok" });
    configureApiClient({ baseUrl: undefined });
    await apiFetch("/v1/me");
    expect(fetchMock).not.toHaveBeenCalled();
    const [url, init] = own.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example.test/v1/me");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("goes back to the global fetch with fetch: null", async () => {
    configureApiClient({ fetch: vi.fn<typeof fetch>() });
    configureApiClient({ fetch: null });
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await apiFetch("/v1/me");
    expect(lastCall().url).toBe("/api/v1/me");
  });
});

describe("apiFetch error mapping", () => {
  const empty = (status: number) => new Response("", { status });
  const envelope = (status: number, error: object) => new Response(JSON.stringify({ error }), { status });
  const failure = async (response: Response) => {
    fetchMock.mockResolvedValue(response);
    return (await api.get("/v1/x").catch((e: unknown) => e)) as ApiError;
  };

  it.each([
    [400, "INVALID_REQUEST", "Something went wrong. Please try again."],
    [403, "FORBIDDEN", "You don't have access to this."],
    [409, "CONFLICT", "Something went wrong. Please try again."],
    [418, "INTERNAL_SERVER_ERROR", "Something went wrong. Please try again."],
    [429, "RATE_LIMITED", "Too many requests. Please wait a moment and try again."],
  ])("an empty %i body maps to %s", async (status, code, message) => {
    const error = await failure(empty(status));
    expect(error).toMatchObject({ status, code, message, fields: {} });
  });

  it.each([502, 503, 504])("an envelope-less %i means the backend is unreachable", async (status) => {
    const error = await failure(empty(status));
    expect(error.code).toBe("SERVICE_UNAVAILABLE");
    expect(error.message).toBe("bookanything is temporarily unavailable. Please try again shortly.");
    expect(error.isUnavailable).toBe(true);
  });

  it("a 503 envelope without code or message is the database being down", async () => {
    const error = await failure(envelope(503, {}));
    expect(error.code).toBe("DATABASE_UNAVAILABLE");
    expect(error.message).toBe("bookanything is temporarily unavailable. Please try again shortly.");
    expect(error.isUnavailable).toBe(true);
  });

  it("a 5xx envelope keeps the backend's code and message", async () => {
    const error = await failure(envelope(500, { code: "AI_NOT_CONFIGURED", message: "No model" }));
    expect(error).toMatchObject({ status: 500, code: "AI_NOT_CONFIGURED", message: "No model" });
    expect(error.isUnavailable).toBe(false);
  });

  it("a 502 envelope without a code gets the generic code and the unavailable message", async () => {
    const error = await failure(envelope(502, {}));
    expect(error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(error.message).toBe("bookanything is temporarily unavailable. Please try again shortly.");
  });

  it("an empty envelope message is kept, and errorMessage shows the fallback for it", async () => {
    const error = await failure(envelope(422, { code: "POLICY_VIOLATION", message: "" }));
    expect(error.message).toBe("");
    expect(errorMessage(error)).toBe("Something went wrong. Please try again.");
  });

  it("a malformed JSON error body falls back to the status", async () => {
    const error = await failure(new Response("{not json", { status: 404 }));
    expect(error.code).toBe("NOT_FOUND");
  });
});

describe("apiFetch success bodies and requests", () => {
  it("resolves undefined for an empty or non-JSON 2xx body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));
    await expect(api.post("/v1/x")).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(new Response("OK", { status: 200 }));
    await expect(api.get("/v1/x")).resolves.toBeUndefined();
  });

  it("sends PUT and PATCH bodies as JSON", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({}));
    await api.put("/v1/x", { a: 1 });
    expect(lastCall().init.method).toBe("PUT");
    expect(lastCall().init.body).toBe('{"a":1}');
    await api.patch("/v1/x", { b: 2 });
    expect(lastCall().init.method).toBe("PATCH");
    expect(lastCall().headers["Content-Type"]).toBe("application/json");
  });

  it("sends FormData as is, without a JSON Content-Type", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: "u" }));
    const form = new FormData();
    form.append("file", new Blob(["x"]), "x.png");
    await api.post("/v1/uploads", form);
    expect(lastCall().init.body).toBe(form);
    expect(lastCall().headers["Content-Type"]).toBeUndefined();
  });

  it("passes the abort signal, merges extra headers and sends same-origin credentials", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const controller = new AbortController();
    await apiFetch("/v1/x", { signal: controller.signal, headers: { "X-Test": "1" }, timeoutMs: null });
    expect(lastCall().init.signal).toBe(controller.signal);
    expect(lastCall().init.credentials).toBe("same-origin");
    expect(lastCall().headers["X-Test"]).toBe("1");
  });

  it("awaits an async token getter that has no token", async () => {
    setAuthTokenGetter(async () => null);
    fetchMock.mockResolvedValue(jsonResponse({}));
    await api.get("/v1/me");
    expect(lastCall().headers.Authorization).toBeUndefined();
  });
});

describe("apiFetch timeouts", () => {
  /** A fetch that never answers, and rejects with the signal's reason once it aborts (as browsers do). */
  function hangingFetch() {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener("abort", () => reject(signal.reason as Error));
        }),
    );
  }

  it("gives reads a default timeout and leaves writes and streams without one", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({})));
    await api.get("/v1/me");
    expect(timeout).toHaveBeenLastCalledWith(DEFAULT_READ_TIMEOUT_MS);
    expect(lastCall().init.signal).toBeInstanceOf(AbortSignal);
    timeout.mockClear();
    await api.post("/v1/site/generate", { prompt: "x" });
    await api.delete("/v1/x");
    expect(timeout).not.toHaveBeenCalled();
    expect(lastCall().init.signal).toBeUndefined();
    timeout.mockRestore();
  });

  it("maps a request that times out to a NETWORK_ERROR ApiError", async () => {
    hangingFetch();
    const error = (await api
      .get("/v1/me", undefined, { timeoutMs: 10 })
      .catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.isUnavailable).toBe(true);
    expect(error.message).toMatch(/taking too long/);
  });

  it("applies an explicit timeout to a write", async () => {
    hangingFetch();
    const error = (await api.post("/v1/x", {}, { timeoutMs: 10 }).catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("NETWORK_ERROR");
  });

  it("still rethrows the caller's own abort, with the timeout running alongside", async () => {
    hangingFetch();
    const controller = new AbortController();
    const pending = api.get("/v1/me", undefined, { signal: controller.signal }).catch((e: unknown) => e);
    controller.abort();
    const error = await pending;
    expect(isAbortError(error)).toBe(true);
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it("times out a body that stalls after the headers", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      text: () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")),
    } as unknown as Response);
    const error = (await api.get("/v1/me").catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("NETWORK_ERROR");
  });

  it("falls back to the caller's signal alone without AbortSignal.any", async () => {
    const any = Object.getOwnPropertyDescriptor(AbortSignal, "any")!;
    Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true });
    try {
      fetchMock.mockResolvedValue(jsonResponse({}));
      const controller = new AbortController();
      await api.get("/v1/me", undefined, { signal: controller.signal });
      expect(lastCall().init.signal).toBe(controller.signal);
    } finally {
      Object.defineProperty(AbortSignal, "any", any);
    }
  });
});

describe("apiStream", () => {
  /** A text/event-stream response delivering `chunks` in order; `open` leaves the stream unfinished. */
  function sse(chunks: string[], { open = false } = {}) {
    const cancel = vi.fn();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        if (!open) controller.close();
      },
      cancel,
    });
    return { response: new Response(body, { status: 200 }), cancel };
  }

  async function collect(stream: AsyncGenerator<SseMessage>) {
    const out: SseMessage[] = [];
    for await (const message of stream) out.push(message);
    return out;
  }

  it("POSTs the JSON body asking for an event stream, with the bearer token", async () => {
    setAuthTokenGetter(() => "tok");
    fetchMock.mockResolvedValue(sse([]).response);
    await collect(apiStream("/v1/stream", { text: "hi" }));
    const { url, init, headers } = lastCall();
    expect(url).toBe("/api/v1/stream");
    expect(init.method).toBe("POST");
    expect(headers.Accept).toBe("text/event-stream");
    expect(headers.Authorization).toBe("Bearer tok");
    expect(init.body).toBe('{"text":"hi"}');
  });

  it("parses events split across chunks, CRLF line ends, comments and multi-line data", async () => {
    fetchMock.mockResolvedValue(
      sse([
        ": keep-alive\n\n",
        'event: delta\ndata: {"t":',
        '"Hel"}\r\n\r\n',
        "data: line one\ndata:line two\n\n",
        "event: ping\n\n",
        "data\nid: 7\nevent: done\n\n",
      ]).response,
    );

    await expect(collect(apiStream("/v1/stream", {}))).resolves.toEqual([
      { event: "delta", data: '{"t":"Hel"}' },
      { event: "message", data: "line one\nline two" },
      { event: "done", data: "" },
    ]);
  });

  it("ignores an unfinished last frame", async () => {
    fetchMock.mockResolvedValue(sse(["data: complete\n\n", "data: cut off"]).response);
    await expect(collect(apiStream("/v1/stream", {}))).resolves.toEqual([
      { event: "message", data: "complete" },
    ]);
  });

  it("throws the ApiError before the stream starts", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "AI_LIMIT_REACHED", message: "Out of credits" } }), {
        status: 402,
      }),
    );
    await expect(collect(apiStream("/v1/stream", {}))).rejects.toMatchObject({
      code: "AI_LIMIT_REACHED",
      message: "Out of credits",
    });
  });

  it("maps a failed connection to NETWORK_ERROR", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(collect(apiStream("/v1/stream", {}))).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("yields nothing for a response without a body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await expect(collect(apiStream("/v1/stream", {}))).resolves.toEqual([]);
  });

  it("cancels the download when the consumer stops early", async () => {
    const { response, cancel } = sse(["data: one\n\n", "data: two\n\n"], { open: true });
    fetchMock.mockResolvedValue(response);

    for await (const message of apiStream("/v1/stream", {})) {
      expect(message.data).toBe("one");
      break;
    }

    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });
});

describe("ApiError", () => {
  it("flags by code as well as by status", () => {
    expect(new ApiError(0, "UNAUTHENTICATED", "").isUnauthenticated).toBe(true);
    expect(new ApiError(0, "FORBIDDEN", "").isForbidden).toBe(true);
    expect(new ApiError(0, "NOT_FOUND", "").isNotFound).toBe(true);
    expect(new ApiError(0, "NETWORK_ERROR", "").isUnavailable).toBe(true);
    const conflict = new ApiError(409, "CONFLICT", "Taken");
    expect(conflict).toMatchObject({
      name: "ApiError",
      isUnauthenticated: false,
      isForbidden: false,
      isNotFound: false,
      isUnavailable: false,
      fields: {},
    });
    expect(conflict).toBeInstanceOf(Error);
  });

  it("isApiError only accepts real ApiErrors", () => {
    expect(isApiError(new ApiError(400, "INVALID_REQUEST", "x"))).toBe(true);
    expect(isApiError(new Error("x"))).toBe(false);
    expect(isApiError({ status: 400, code: "INVALID_REQUEST", message: "x" })).toBe(false);
  });
});

describe("helpers", () => {
  it("newIdempotencyKey returns distinct keys", () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });

  it("newIdempotencyKey falls back without crypto.randomUUID", () => {
    vi.stubGlobal("crypto", {});
    const key = newIdempotencyKey();
    expect(key).toMatch(/^[0-9a-z]+-[0-9a-z]*-[0-9a-z]*$/);
    expect(newIdempotencyKey()).not.toBe(key);
  });

  it("errorMessage falls back for unknown values", () => {
    expect(errorMessage("nope", "fallback")).toBe("fallback");
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("errorMessage falls back for errors without a message", () => {
    expect(errorMessage(new ApiError(500, "INTERNAL_SERVER_ERROR", ""), "fallback")).toBe("fallback");
    expect(errorMessage(new Error(""))).toBe("Something went wrong. Please try again.");
    expect(errorMessage(null)).toBe("Something went wrong. Please try again.");
  });

  it("isAbortError recognises only AbortError-named objects", () => {
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("x"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
  });
});

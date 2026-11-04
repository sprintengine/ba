/** Server-side reads for metadata/SEO: URL, caching hints and how failures map to results. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws outside a React Server Components build; these modules are tested as plain functions.
vi.mock("server-only", () => ({}));
// Next's notFound/redirect throw to stop rendering; here they throw something the tests can read.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** A fresh import, so each test's BACKEND_ORIGIN and React `cache` start clean. */
async function load() {
  vi.resetModules();
  return import("./server");
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), init: init as RequestInit & { next?: { revalidate?: number } } };
}

describe("server reads", () => {
  it("GETs the public business from BACKEND_ORIGIN (trailing slash dropped), encoded, revalidated every 30s", async () => {
    vi.stubEnv("BACKEND_ORIGIN", "https://api.example.test/");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ slug: "my shop" }), { status: 200 }));
    const { getPublicBusiness } = await load();

    await expect(getPublicBusiness("my shop")).resolves.toEqual({ status: "ok", data: { slug: "my shop" } });

    const { url, init } = lastCall();
    expect(url).toBe("https://api.example.test/v1/public/businesses/my%20shop");
    expect(init.headers).toEqual({ Accept: "application/json" });
    expect(init.next).toEqual({ revalidate: 30 });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("defaults to the local backend", async () => {
    vi.stubEnv("BACKEND_ORIGIN", undefined);
    fetchMock.mockResolvedValue(new Response("[]", { status: 200 }));
    const { getPublicServices } = await load();

    await expect(getPublicServices("lumen")).resolves.toEqual({ status: "ok", data: [] });

    expect(lastCall().url).toBe("http://localhost:8080/v1/public/businesses/lumen/services");
    expect(lastCall().init.next).toEqual({ revalidate: 30 });
  });

  it("reads a business's deals, revalidated every 30s", async () => {
    vi.stubEnv("BACKEND_ORIGIN", undefined);
    fetchMock.mockResolvedValue(new Response("[]", { status: 200 }));
    const { getPublicOffers } = await load();

    await expect(getPublicOffers("lumen")).resolves.toEqual({ status: "ok", data: [] });

    expect(lastCall().url).toBe("http://localhost:8080/v1/public/businesses/lumen/offers");
    expect(lastCall().init.next).toEqual({ revalidate: 30 });
  });

  it("reads the marketplace meta, revalidated every 5 minutes", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ categories: [] }), { status: 200 }));
    const { getMarketplaceMeta } = await load();

    await expect(getMarketplaceMeta()).resolves.toEqual({ status: "ok", data: { categories: [] } });

    expect(lastCall().url).toMatch(/\/v1\/public\/marketplace\/meta$/);
    expect(lastCall().init.next).toEqual({ revalidate: 300 });
  });

  it("maps 404 to not_found", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    const { getPublicBusiness } = await load();
    await expect(getPublicBusiness("gone")).resolves.toEqual({ status: "not_found" });
  });

  it("loads a business's public page: business, services and, when asked, offers", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/services")) return new Response("[]", { status: 200 });
      if (url.endsWith("/offers")) return new Response("", { status: 500 });
      return new Response(JSON.stringify({ slug: "lumen" }), { status: 200 });
    });
    const { loadPublicBusinessPage } = await load();

    await expect(loadPublicBusinessPage("lumen", {})).resolves.toEqual({
      business: { slug: "lumen" },
      services: [],
      offers: null,
    });
    expect(fetchMock.mock.calls.map(([u]) => String(u)).some((u) => u.endsWith("/offers"))).toBe(false);
    // Offers that fail to load are left to the client.
    await expect(loadPublicBusinessPage("lumen", {}, { withOffers: true })).resolves.toMatchObject({
      offers: null,
    });
  });

  it("404s a reserved slug or an unknown business, unless previewing", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    const { loadPublicBusinessPage } = await load();

    await expect(loadPublicBusinessPage("dashboard", {})).rejects.toThrow("NOT_FOUND");
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(loadPublicBusinessPage("gone", {})).rejects.toThrow("NOT_FOUND");
    await expect(loadPublicBusinessPage("gone", { preview: "1" })).resolves.toEqual({
      business: null,
      services: null,
      offers: null,
    });
  });

  it("redirects old booking deep links before loading, when asked", async () => {
    const { loadPublicBusinessPage } = await load();
    await expect(
      loadPublicBusinessPage("lumen", { service: "s1" }, { redirectDeepLinks: true }),
    ).rejects.toThrow("REDIRECT /lumen/book?service=s1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps other failures, unreachable backends and timeouts to unavailable", async () => {
    const { getPublicBusiness } = await load();

    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));
    await expect(getPublicBusiness("a")).resolves.toEqual({ status: "unavailable" });

    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(getPublicBusiness("b")).resolves.toEqual({ status: "unavailable" });

    fetchMock.mockRejectedValueOnce(new DOMException("The operation timed out.", "TimeoutError"));
    await expect(getPublicBusiness("c")).resolves.toEqual({ status: "unavailable" });

    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    await expect(getPublicBusiness("d")).resolves.toEqual({ status: "unavailable" });
  });
});

/** The site builder (§15): requests and cache effects. */
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SaveSiteInput } from "../types";
import {
  usePublishSite,
  useRestoreSiteVersion,
  useSaveSite,
  useSiteState,
  useSiteVersions,
  useStockSearch,
  useTrackStockDownload,
  useUploadImage,
} from "./use-site";
import {
  BIZ,
  MARKETPLACE,
  PUBLIC,
  json,
  keyNames,
  noContent,
  renderApiHook,
  stubApi,
} from "./__tests__/harness";

afterEach(() => vi.unstubAllGlobals());

const base = `/v1/businesses/${BIZ}`;
const state = { draftVersion: 4, publishedVersion: 3 };

describe("site queries", () => {
  it("useSiteState and useSiteVersions GET the site", async () => {
    stubApi({
      [`GET ${base}/site`]: json(state),
      [`GET ${base}/site/versions`]: json({ items: [{ version: 3 }] }),
    });
    const { result } = renderApiHook(() => ({ state: useSiteState(BIZ), versions: useSiteVersions(BIZ) }));
    await waitFor(() => expect(result.current.state.data).toEqual(state));
    await waitFor(() => expect(result.current.versions.data).toEqual({ items: [{ version: 3 }] }));
  });

  it("stock search waits for two characters and sends the page", async () => {
    const api = stubApi({ [`GET ${base}/site/stock`]: json({ enabled: true, results: [] }) });
    const { result } = renderApiHook(() => ({
      short: useStockSearch(BIZ, " a "),
      search: useStockSearch(BIZ, "beach", 2),
    }));
    await waitFor(() => expect(result.current.search.isSuccess).toBe(true));
    expect(result.current.short.fetchStatus).toBe("idle");
    expect(api.calls.map((c) => c.query)).toEqual([{ q: "beach", page: "2" }]);
  });
});

describe("site mutations", () => {
  it("save PUTs the plan, stores the new state and refreshes the versions", async () => {
    const input = { plan: { sections: [] }, baseVersion: 3 } as unknown as SaveSiteInput;
    const api = stubApi({ [`PUT ${base}/site`]: json(state) });
    const view = renderApiHook(() => useSaveSite(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync(input));

    expect(api.last().body).toEqual(input);
    expect(view.data("site")).toEqual(state);
    expect(view.invalidated()).toEqual(["siteVersions"]);
  });

  it("restore POSTs the version and stores the new state", async () => {
    stubApi({ [`POST ${base}/site/versions/2/restore`]: json(state) });
    const view = renderApiHook(() => useRestoreSiteVersion(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync(2));

    expect(view.data("site")).toEqual(state);
    expect(view.invalidated()).toEqual(["siteVersions"]);
  });

  it("publish stores the state and refreshes everything showing the business colour", async () => {
    stubApi({ [`POST ${base}/site/publish`]: json(state) });
    const view = renderApiHook(() => usePublishSite(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync());

    expect(view.data("site")).toEqual(state);
    // Marketplace listings embed the business branding too.
    expect(view.invalidated()).toEqual(keyNames("detail", "siteVersions", "me", ...PUBLIC, ...MARKETPLACE));
  });

  it("tracking a stock download POSTs its location and caches nothing", async () => {
    const api = stubApi({ [`POST ${base}/site/stock/download`]: noContent });
    const view = renderApiHook(() => useTrackStockDownload(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync("https://api.unsplash.test/dl/1"));

    expect(api.last().body).toEqual({ downloadLocation: "https://api.unsplash.test/dl/1" });
    expect(view.invalidated()).toEqual([]);
  });

  it("an upload is sent as multipart form data (the browser sets the Content-Type)", async () => {
    const api = stubApi({ [`POST ${base}/uploads`]: json({ url: "https://cdn.test/a.png" }) });
    const view = renderApiHook(() => useUploadImage(BIZ));
    const file = new File(["png"], "a.png", { type: "image/png" });

    await expect(act(() => view.result.current.mutateAsync(file))).resolves.toEqual({
      url: "https://cdn.test/a.png",
    });

    const { body, headers } = api.last();
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("file")).toBeInstanceOf(File);
    expect(headers["Content-Type"]).toBeUndefined();
  });
});

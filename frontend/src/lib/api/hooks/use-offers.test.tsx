/** Deals (§19) and the marketplace (§18): requests and cache effects. */
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setAuthTokenGetter } from "../client";
import type { MarketplaceSearchResult, OfferInput, OfferPreviewInput } from "../types";
import {
  searchCenter,
  useMarketplaceMeta,
  useMarketplaceSearch,
  useMarketplaceSettings,
  useUpdateMarketplaceSettings,
} from "./use-marketplace";
import {
  useCreateOffer,
  useDeleteOffer,
  useOfferPreview,
  useOffers,
  usePauseOffer,
  usePublicOffers,
  useResumeOffer,
  useUpdateOffer,
} from "./use-offers";
import {
  BIZ,
  MARKETPLACE,
  PUBLIC,
  SLUG,
  held,
  json,
  keyNames,
  noContent,
  renderApiHook,
  sequence,
  stubApi,
} from "./__tests__/harness";

afterEach(() => {
  setAuthTokenGetter(null);
  vi.unstubAllGlobals();
});

const base = `/v1/businesses/${BIZ}`;
const offerInput = { name: "Quiet Tuesdays", serviceIds: ["s1"], active: true } as unknown as OfferInput;
// Deals change prices everywhere: the list, staff slots, public pages and marketplace listings.
const priced = keyNames("staffAvailability", "offers", ...PUBLIC, ...MARKETPLACE);

describe("offer queries", () => {
  it("useOffers and usePublicOffers GET their lists", async () => {
    stubApi({
      [`GET ${base}/offers`]: json([{ id: "of1" }]),
      [`GET /v1/public/businesses/${SLUG}/offers`]: json([{ id: "of1", label: "20% off" }]),
    });
    const { result } = renderApiHook(() => ({ offers: useOffers(BIZ), public: usePublicOffers(SLUG) }));
    await waitFor(() => expect(result.current.offers.data).toEqual([{ id: "of1" }]));
    await waitFor(() => expect(result.current.public.data).toEqual([{ id: "of1", label: "20% off" }]));
  });

  it("the preview makes no request while the draft is invalid (null)", () => {
    const api = stubApi();
    const { result } = renderApiHook(() => useOfferPreview(BIZ, null));
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.calls).toHaveLength(0);
  });

  it("the preview POSTs the draft and keeps the last result while the next one loads", async () => {
    const next = held(json({ affectedSlots: 2 }));
    const api = stubApi({
      [`POST ${base}/offers/preview`]: sequence(json({ affectedSlots: 5 }), next.reply),
    });
    const first: OfferPreviewInput = { offer: offerInput, days: 7 };
    let input: OfferPreviewInput = first;
    const { result, rerender } = renderApiHook(() => useOfferPreview(BIZ, input));
    await waitFor(() => expect(result.current.data).toEqual({ affectedSlots: 5 }));
    expect(api.last().body).toEqual(first);

    input = { offer: offerInput, days: 14 };
    rerender();
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.data).toEqual({ affectedSlots: 5 });
    expect(result.current.isPlaceholderData).toBe(true);

    next.release();
    await waitFor(() => expect(result.current.data).toEqual({ affectedSlots: 2 }));
  });
});

describe("offer mutations", () => {
  it("create POSTs and refreshes everything priced", async () => {
    const api = stubApi({ [`POST ${base}/offers`]: json({ id: "of9" }) });
    const view = renderApiHook(() => useCreateOffer(BIZ), {
      seed: true,
      seedData: { offers: [{ id: "of1" }] },
    });

    await act(() => view.result.current.mutateAsync(offerInput));

    expect(api.last().body).toEqual(offerInput);
    expect(view.data("offers")).toEqual([{ id: "of1" }]);
    expect(view.invalidated()).toEqual(priced);
  });

  it("update PUTs and swaps the offer in the cached list", async () => {
    const api = stubApi({ [`PUT ${base}/offers/of1`]: json({ id: "of1", name: "Quiet Tuesdays" }) });
    const view = renderApiHook(() => useUpdateOffer(BIZ), {
      seed: true,
      seedData: { offers: [{ id: "of1", name: "Old" }] },
    });

    await act(() => view.result.current.mutateAsync({ id: "of1", input: offerInput }));

    expect(api.last()).toMatchObject({ method: "PUT", body: offerInput });
    expect(view.data("offers")).toEqual([{ id: "of1", name: "Quiet Tuesdays" }]);
    expect(view.invalidated()).toEqual(priced);
  });

  it.each([
    ["pause", usePauseOffer, "paused"],
    ["resume", useResumeOffer, "active"],
  ] as const)(
    "%s POSTs the action and shows the new status in the list",
    async (action, useAction, status) => {
      const api = stubApi({ [`POST ${base}/offers/of1/${action}`]: json({ id: "of1", status }) });
      const view = renderApiHook(() => useAction(BIZ), {
        seed: true,
        seedData: { offers: [{ id: "of1", status: "draft" }] },
      });

      await act(() => view.result.current.mutateAsync("of1"));

      expect(api.calls).toHaveLength(1);
      expect(view.data("offers")).toEqual([{ id: "of1", status }]);
      expect(view.invalidated()).toEqual(priced);
    },
  );

  it("delete DELETEs and refreshes everything priced", async () => {
    stubApi({ [`DELETE ${base}/offers/of1`]: noContent });
    const view = renderApiHook(() => useDeleteOffer(BIZ), { seed: true });

    await act(() => view.result.current.mutateAsync("of1"));

    expect(view.invalidated()).toEqual(priced);
  });
});

describe("marketplace", () => {
  const page = (ids: string[], nextCursor: string | null): Partial<MarketplaceSearchResult> => ({
    items: ids.map((id) => ({ business: { id } })) as MarketplaceSearchResult["items"],
    nextCursor,
    center: { latitude: 51.9, longitude: -8.47, radiusKm: 10, label: "Cork" },
  });

  it("useMarketplaceMeta GETs the categories and cities", async () => {
    stubApi({ "GET /v1/public/marketplace/meta": json({ categories: [], cities: [] }) });
    const { result } = renderApiHook(() => useMarketplaceMeta());
    await waitFor(() => expect(result.current.data).toEqual({ categories: [], cities: [] }));
  });

  it("search is anonymous, sends the filters and pages by cursor", async () => {
    setAuthTokenGetter(() => "tok");
    const api = stubApi({
      "GET /v1/public/marketplace/search": sequence(json(page(["a"], "c2")), json(page(["b"], null))),
    });
    const { result } = renderApiHook(() => useMarketplaceSearch({ city: "cork", deals: true }));

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.hasNextPage).toBe(false));

    expect(api.calls.map((c) => c.query)).toEqual([
      { city: "cork", deals: "true" },
      { city: "cork", deals: "true", cursor: "c2" },
    ]);
    expect(api.calls.every((c) => c.headers.Authorization === undefined)).toBe(true);
    expect(searchCenter(result.current.data?.pages as MarketplaceSearchResult[])?.label).toBe("Cork");
  });

  it("searchCenter is null before the first page", () => {
    expect(searchCenter(undefined)).toBeNull();
    expect(searchCenter([])).toBeNull();
  });

  it("settings GET, and an update stores them and refreshes every listing", async () => {
    const settings = { listed: true, category: "physio" };
    const api = stubApi({
      [`GET ${base}/marketplace`]: json({ listed: false }),
      [`PUT ${base}/marketplace`]: json(settings),
    });
    const query = renderApiHook(() => useMarketplaceSettings(BIZ));
    await waitFor(() => expect(query.result.current.data).toEqual({ listed: false }));

    const view = renderApiHook(() => useUpdateMarketplaceSettings(BIZ), { seed: true });
    await act(() => view.result.current.mutateAsync(settings));

    expect(api.last()).toMatchObject({ method: "PUT", body: settings });
    expect(view.data("marketplaceSettings")).toEqual(settings);
    expect(view.invalidated()).toEqual(MARKETPLACE);
  });
});

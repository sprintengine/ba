"use client";

import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { marketplaceApi } from "../marketplace";
import { qk } from "../query-keys";
import type {
  Listing,
  MarketplaceMeta,
  MarketplaceSearchQuery,
  MarketplaceSearchResult,
  MarketplaceSettings,
  MarketplaceSettingsInput,
} from "../types";
import {
  cursorPaging,
  enabledWhen,
  invalidateAll,
  useApiMutation,
  type InfiniteQueryOptions,
  type MutationOptions,
  type QueryOptions,
} from "./shared";

/** Categories and cities (with listing counts). Rarely changes. */
export function useMarketplaceMeta(options?: QueryOptions<MarketplaceMeta>) {
  return useQuery({
    staleTime: 5 * 60_000,
    ...options,
    queryKey: qk.marketplace.meta(),
    queryFn: ({ signal }) => marketplaceApi.meta({ signal }),
  });
}

/**
 * Marketplace search, one page per `fetchNextPage()`. Keeps the previous results while a new query loads so the
 * list doesn't flash empty between filter changes.
 */
export function useMarketplaceSearch(
  query: Omit<MarketplaceSearchQuery, "cursor">,
  options?: InfiniteQueryOptions<Listing>,
) {
  return useInfiniteQuery({
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    ...options,
    queryKey: qk.marketplace.search(query),
    queryFn: ({ pageParam, signal }) => marketplaceApi.search({ ...query, cursor: pageParam }, { signal }),
    ...cursorPaging,
  });
}

/** The search `center` of the first page (city or point searched around). */
export function searchCenter(pages: MarketplaceSearchResult[] | undefined) {
  return pages?.[0]?.center ?? null;
}

export function useMarketplaceSettings(businessId: string, options?: QueryOptions<MarketplaceSettings>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).marketplace(),
    queryFn: ({ signal }) => marketplaceApi.settings(businessId, { signal }),
    enabled: enabledWhen(!!businessId, options),
  });
}

export function useUpdateMarketplaceSettings(
  businessId: string,
  options?: MutationOptions<MarketplaceSettings, MarketplaceSettingsInput>,
) {
  return useApiMutation(
    (input: MarketplaceSettingsInput) => marketplaceApi.updateSettings(businessId, input),
    (qc, settings) => {
      qc.setQueryData(qk.business(businessId).marketplace(), settings);
      return invalidateAll(qc, [qk.marketplace.all()]);
    },
    options,
  );
}

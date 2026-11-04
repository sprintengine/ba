"use client";

import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import { qk } from "../query-keys";
import { siteApi } from "../site";
import type {
  EditSiteInput,
  GenerateSiteInput,
  SaveSiteInput,
  SiteAiResult,
  SiteState,
  SiteVersion,
  StockSearchResult,
  Upload,
} from "../types";
import {
  enabledWhen,
  invalidateAll,
  useApiMutation,
  type MutationOptions,
  type QueryOptions,
} from "./shared";

/** Draft + published site plan, context and AI allowance (owner/admin). */
export function useSiteState(businessId: string, options?: QueryOptions<SiteState>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).site(),
    queryFn: () => siteApi.get(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

export function useSiteVersions(businessId: string, options?: QueryOptions<{ items: SiteVersion[] }>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).siteVersions(),
    queryFn: () => siteApi.versions(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

/** Store the new state and refresh the version list. */
function applyState(businessId: string) {
  return (qc: QueryClient, state: SiteState) => {
    qc.setQueryData(qk.business(businessId).site(), state);
    return invalidateAll(qc, [qk.business(businessId).siteVersions()]);
  };
}

export function useSaveSite(businessId: string, options?: MutationOptions<SiteState, SaveSiteInput>) {
  return useApiMutation(
    (input: SaveSiteInput) => siteApi.save(businessId, input),
    applyState(businessId),
    options,
  );
}

/**
 * Publishing also updates the business colour, so the business, `me`, public pages and marketplace listings (which
 * embed the branding) refresh.
 */
export function usePublishSite(businessId: string, options?: MutationOptions<SiteState, void>) {
  return useApiMutation(
    () => siteApi.publish(businessId),
    (qc, state) => {
      qc.setQueryData(qk.business(businessId).site(), state);
      return invalidateAll(qc, [
        qk.business(businessId).siteVersions(),
        qk.business(businessId).detail(),
        qk.me(),
        qk.public.all(),
        qk.marketplace.all(),
      ]);
    },
    options,
  );
}

export function useRestoreSiteVersion(businessId: string, options?: MutationOptions<SiteState, number>) {
  return useApiMutation(
    (version: number) => siteApi.restore(businessId, version),
    applyState(businessId),
    options,
  );
}

/**
 * An AI result: the new state and version list, plus everything else that shows AI credits (the usage card in
 * Billing, and the assistant's state), since the call spent some.
 */
function applyAiResult(businessId: string) {
  return (qc: QueryClient, result: SiteAiResult) => {
    const b = qk.business(businessId);
    return Promise.all([
      applyState(businessId)(qc, result.state),
      qc.invalidateQueries({ queryKey: b.aiUsage() }),
      qc.invalidateQueries({ queryKey: b.assistant(), exact: true }),
    ]);
  };
}

export function useGenerateSite(
  businessId: string,
  options?: MutationOptions<SiteAiResult, GenerateSiteInput>,
) {
  return useApiMutation(
    (input: GenerateSiteInput) => siteApi.generate(businessId, input),
    applyAiResult(businessId),
    options,
  );
}

export function useEditSite(businessId: string, options?: MutationOptions<SiteAiResult, EditSiteInput>) {
  return useApiMutation(
    (input: EditSiteInput) => siteApi.edit(businessId, input),
    applyAiResult(businessId),
    options,
  );
}

/** Unsplash search (`enabled: false` in the result when the server has no key). */
export function useStockSearch(
  businessId: string,
  q: string,
  page = 1,
  options?: QueryOptions<StockSearchResult>,
) {
  return useQuery({
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    ...options,
    queryKey: qk.business(businessId).stock(q, page),
    queryFn: () => siteApi.stock(businessId, q, page),
    enabled: enabledWhen(!!businessId && q.trim().length > 1, options),
  });
}

export function useTrackStockDownload(businessId: string, options?: MutationOptions<void, string>) {
  return useApiMutation(
    (downloadLocation: string) => siteApi.trackStockDownload(businessId, downloadLocation),
    undefined,
    options,
  );
}

export function useUploadImage(businessId: string, options?: MutationOptions<Upload, File | Blob>) {
  return useApiMutation((file: File | Blob) => siteApi.upload(businessId, file), undefined, options);
}

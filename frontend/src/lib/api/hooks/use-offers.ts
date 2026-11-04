"use client";

import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import { offersApi } from "../offers";
import { qk } from "../query-keys";
import type { Offer, OfferInput, OfferPreview, OfferPreviewInput, PublicOffer } from "../types";
import {
  enabledWhen,
  invalidateAll,
  replaceInList,
  useApiMutation,
  type MutationOptions,
  type QueryOptions,
} from "./shared";

export function useOffers(businessId: string, options?: QueryOptions<Offer[]>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).offers(),
    queryFn: () => offersApi.list(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

/**
 * Live preview of the slots a draft offer discounts. Pass `null` while the draft is invalid (no request is made);
 * the last preview stays visible while a new one loads.
 */
export function useOfferPreview(
  businessId: string,
  input: OfferPreviewInput | null,
  options?: QueryOptions<OfferPreview>,
) {
  return useQuery({
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    ...options,
    queryKey: qk.business(businessId).offerPreview(input ?? ({} as OfferPreviewInput)),
    queryFn: () => offersApi.preview(businessId, input!),
    enabled: enabledWhen(!!businessId && input != null, options),
  });
}

/** Active deals of a business, for its site and booking flow. */
export function usePublicOffers(slug: string, options?: QueryOptions<PublicOffer[]>) {
  return useQuery({
    ...options,
    queryKey: qk.public.offers(slug),
    queryFn: () => offersApi.publicOffers(slug),
    enabled: enabledWhen(!!slug, options),
  });
}

export type UpdateOfferVariables = { id: string; input: OfferInput };

/**
 * Offers change prices everywhere: the list, staff availability (the dashboard's slot picker shows deals), public
 * availability and offers, and the marketplace.
 */
function afterOfferChange(businessId: string) {
  return (qc: QueryClient, offer?: Offer) => {
    const b = qk.business(businessId);
    if (offer) replaceInList(qc, b.offers(), offer);
    return invalidateAll(qc, [b.offers(), b.availabilityAll(), qk.public.all(), qk.marketplace.all()]);
  };
}

export function useCreateOffer(businessId: string, options?: MutationOptions<Offer, OfferInput>) {
  return useApiMutation(
    (input: OfferInput) => offersApi.create(businessId, input),
    afterOfferChange(businessId),
    options,
  );
}

export function useUpdateOffer(businessId: string, options?: MutationOptions<Offer, UpdateOfferVariables>) {
  return useApiMutation(
    ({ id, input }: UpdateOfferVariables) => offersApi.update(businessId, id, input),
    afterOfferChange(businessId),
    options,
  );
}

/** Variables: the offer id. */
export function usePauseOffer(businessId: string, options?: MutationOptions<Offer, string>) {
  return useApiMutation(
    (id: string) => offersApi.pause(businessId, id),
    afterOfferChange(businessId),
    options,
  );
}

/** Variables: the offer id. */
export function useResumeOffer(businessId: string, options?: MutationOptions<Offer, string>) {
  return useApiMutation(
    (id: string) => offersApi.resume(businessId, id),
    afterOfferChange(businessId),
    options,
  );
}

/** Variables: the offer id. */
export function useDeleteOffer(businessId: string, options?: MutationOptions<void, string>) {
  return useApiMutation(
    (id: string) => offersApi.remove(businessId, id),
    (qc) => afterOfferChange(businessId)(qc),
    options,
  );
}

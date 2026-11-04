import { api } from "./client";
import { businessPath, seg } from "./paths";
import type { Offer, OfferInput, OfferPreview, OfferPreviewInput, PublicOffer } from "./types";

/** Deals (§19). Owner/admin, except `publicOffers`. */
export const offersApi = {
  list: (businessId: string): Promise<Offer[]> => api.get<Offer[]>(businessPath(businessId, "/offers")),

  create: (businessId: string, body: OfferInput): Promise<Offer> =>
    api.post<Offer>(businessPath(businessId, "/offers"), body),

  update: (businessId: string, offerId: string, body: OfferInput): Promise<Offer> =>
    api.put<Offer>(businessPath(businessId, `/offers/${seg(offerId)}`), body),

  pause: (businessId: string, offerId: string): Promise<Offer> =>
    api.post<Offer>(businessPath(businessId, `/offers/${seg(offerId)}/pause`)),

  resume: (businessId: string, offerId: string): Promise<Offer> =>
    api.post<Offer>(businessPath(businessId, `/offers/${seg(offerId)}/resume`)),

  remove: (businessId: string, offerId: string): Promise<void> =>
    api.delete(businessPath(businessId, `/offers/${seg(offerId)}`)),

  /** Which bookable slots a draft offer would discount (next `days` days, default 7). */
  preview: (businessId: string, body: OfferPreviewInput): Promise<OfferPreview> =>
    api.post<OfferPreview>(businessPath(businessId, "/offers/preview"), body),

  /** Active deals a customer can get now. */
  publicOffers: (slug: string): Promise<PublicOffer[]> =>
    api.get<PublicOffer[]>(`/v1/public/businesses/${seg(slug)}/offers`),
};

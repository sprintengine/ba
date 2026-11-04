import { api, type RequestOptions } from "./client";
import { businessPath } from "./paths";
import type {
  MarketplaceMeta,
  MarketplaceSearchQuery,
  MarketplaceSearchResult,
  MarketplaceSettings,
  MarketplaceSettingsInput,
} from "./types";

/** Marketplace (§18): public search and the owner's listing setting. */
export const marketplaceApi = {
  meta: (options?: Pick<RequestOptions, "signal">): Promise<MarketplaceMeta> =>
    api.get<MarketplaceMeta>("/v1/public/marketplace/meta", undefined, options),

  /** Cursor-paginated; rate limited per client. */
  search: (
    query: MarketplaceSearchQuery,
    options?: Pick<RequestOptions, "signal">,
  ): Promise<MarketplaceSearchResult> =>
    api.get<MarketplaceSearchResult>("/v1/public/marketplace/search", query, { ...options, anonymous: true }),

  /** Owner/admin. */
  settings: (businessId: string, options?: Pick<RequestOptions, "signal">): Promise<MarketplaceSettings> =>
    api.get<MarketplaceSettings>(businessPath(businessId, "/marketplace"), undefined, options),

  /** Owner/admin. Listing on the Free plan answers 409 `PLAN_LIMIT_REACHED`. */
  updateSettings: (businessId: string, body: MarketplaceSettingsInput): Promise<MarketplaceSettings> =>
    api.put<MarketplaceSettings>(businessPath(businessId, "/marketplace"), body),
};

import { api } from "./client";
import { businessPath, seg } from "./paths";
import type {
  EditSiteInput,
  GenerateSiteInput,
  SaveSiteInput,
  SiteAiResult,
  SiteState,
  SiteVersion,
  SiteVersionDetail,
  StockSearchResult,
  Upload,
} from "./types";

/** Site builder (§15.5). Owner/admin only. */
export const siteApi = {
  get: (businessId: string): Promise<SiteState> => api.get<SiteState>(businessPath(businessId, "/site")),

  save: (businessId: string, body: SaveSiteInput): Promise<SiteState> =>
    api.put<SiteState>(businessPath(businessId, "/site"), body),

  publish: (businessId: string): Promise<SiteState> =>
    api.post<SiteState>(businessPath(businessId, "/site/publish")),

  versions: (businessId: string): Promise<{ items: SiteVersion[] }> =>
    api.get<{ items: SiteVersion[] }>(businessPath(businessId, "/site/versions")),

  version: (businessId: string, version: number): Promise<SiteVersionDetail> =>
    api.get<SiteVersionDetail>(businessPath(businessId, `/site/versions/${seg(String(version))}`)),

  restore: (businessId: string, version: number): Promise<SiteState> =>
    api.post<SiteState>(businessPath(businessId, `/site/versions/${seg(String(version))}/restore`)),

  generate: (businessId: string, body: GenerateSiteInput): Promise<SiteAiResult> =>
    api.post<SiteAiResult>(businessPath(businessId, "/site/generate"), body),

  edit: (businessId: string, body: EditSiteInput): Promise<SiteAiResult> =>
    api.post<SiteAiResult>(businessPath(businessId, "/site/edit"), body),

  stock: (businessId: string, q: string, page = 1): Promise<StockSearchResult> =>
    api.get<StockSearchResult>(businessPath(businessId, "/site/stock"), { q, page }),

  trackStockDownload: (businessId: string, downloadLocation: string): Promise<void> =>
    api.post<undefined>(businessPath(businessId, "/site/stock/download"), { downloadLocation }),

  /** multipart `file` → our storage URL (tenant-scoped). */
  upload: (businessId: string, file: File | Blob): Promise<Upload> => {
    const form = new FormData();
    form.append("file", file);
    return api.post<Upload>(businessPath(businessId, "/uploads"), form);
  },
};

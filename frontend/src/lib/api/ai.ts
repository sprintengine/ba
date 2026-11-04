import { api } from "./client";
import { businessPath } from "./paths";
import type { AiUsage } from "./types";

/** AI credits and usage (§16). Owner/admin. */
export const aiApi = {
  usage: (businessId: string): Promise<AiUsage> => api.get<AiUsage>(businessPath(businessId, "/ai/usage")),
};

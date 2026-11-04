"use client";

import { useQuery } from "@tanstack/react-query";
import { aiApi } from "../ai";
import { qk } from "../query-keys";
import type { AiUsage } from "../types";
import { enabledWhen, type QueryOptions } from "./shared";

/** This month's AI credits, per-feature breakdown and daily series (owner/admin). */
export function useAiUsage(businessId: string, options?: QueryOptions<AiUsage>) {
  return useQuery({
    ...options,
    queryKey: qk.business(businessId).aiUsage(),
    queryFn: () => aiApi.usage(businessId),
    enabled: enabledWhen(!!businessId, options),
  });
}

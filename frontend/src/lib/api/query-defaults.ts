import type { DefaultOptions } from "@tanstack/react-query";
import { isApiError } from "./client";

/** Don't retry client errors (4xx); retry network failures and 5xx twice. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

/**
 * TanStack Query defaults for every bookanything client, the website's and the mobile app's (which adds cache
 * persistence and its own focus/online wiring on top).
 */
export const QUERY_DEFAULTS = {
  queries: {
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: shouldRetryQuery,
  },
  mutations: { retry: false },
} satisfies DefaultOptions;

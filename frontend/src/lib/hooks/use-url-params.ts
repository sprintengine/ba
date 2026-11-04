"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** A patch of search params: a string sets the key, `null` or `""` removes it. */
export type UrlParamsPatch = Record<string, string | null>;

/** `pathname` with `current` search params patched; no trailing `?` when nothing is left. */
export function withSearchParams(
  pathname: string,
  current: URLSearchParams | string,
  patch: UrlParamsPatch,
): string {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  }
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Filters and view state that live in the URL (shareable views). `setParams` patches the current search params
 * (no history entry, no scroll); `clearParams` drops them all.
 *
 * Through `history.replaceState`, which Next's router follows (`useSearchParams` updates), not `router.replace`: the
 * pages using this read their params on the client only, and `router.replace` would fetch the route from the server
 * again on every change (a round trip before the calendar shows the next day, a filter applies). Don't use it for
 * params a server component reads.
 */
export function useUrlParams() {
  const pathname = usePathname();
  const params = useSearchParams();

  const setParams = useCallback(
    (patch: UrlParamsPatch) =>
      window.history.replaceState(null, "", withSearchParams(pathname, params, patch)),
    [pathname, params],
  );
  const clearParams = useCallback(() => window.history.replaceState(null, "", pathname), [pathname]);

  return { params, setParams, clearParams };
}

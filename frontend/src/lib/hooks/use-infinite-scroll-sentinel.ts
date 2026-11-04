"use client";

import { useEffect, useState } from "react";

type InfiniteScrollOptions = {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  /** How far before the sentinel scrolls into view to start loading (CSS margin, e.g. "240px"). */
  rootMargin?: string;
  /** The scrolling element to observe within; called when the sentinel mounts. Default: the viewport. */
  getRoot?: () => Element | null;
};

/**
 * Infinite scroll for a TanStack infinite query: returns a callback ref for a sentinel element placed after the
 * list; when it comes within `rootMargin` of the root, the next page loads.
 */
export function useInfiniteScrollSentinel({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  rootMargin,
  getRoot,
}: InfiniteScrollOptions): (element: HTMLElement | null) => void {
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
      },
      { root: getRoot?.() ?? null, rootMargin },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, hasNextPage, isFetchingNextPage, fetchNextPage, rootMargin, getRoot]);

  return setSentinel;
}

"use client";

import { useInfiniteScrollSentinel } from "@/lib/hooks/use-infinite-scroll-sentinel";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

/** The parts of a TanStack infinite query the footer needs. */
export type InfinitePaging = {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
};

/**
 * The end of an infinitely scrolling list: loads the next page as it comes within `rootMargin` of view, shows a
 * spinner while it loads, and `endLabel` (e.g. "120 customers") once everything is loaded.
 */
export function InfiniteFooter({
  paging,
  endLabel,
  rootMargin,
  getRoot,
  className,
}: {
  paging: InfinitePaging;
  /** Shown when there is nothing more to load; omit for an empty footer. */
  endLabel?: string;
  rootMargin?: string;
  /** The scrolling element the list scrolls in; the viewport by default. */
  getRoot?: () => Element | null;
  className?: string;
}) {
  const sentinel = useInfiniteScrollSentinel({
    hasNextPage: paging.hasNextPage,
    isFetchingNextPage: paging.isFetchingNextPage,
    fetchNextPage: paging.fetchNextPage,
    rootMargin,
    getRoot,
  });
  return (
    <div
      ref={sentinel}
      className={cn("flex items-center justify-center text-xs text-subtle-foreground", className)}
    >
      {paging.isFetchingNextPage ? <Spinner /> : !paging.hasNextPage ? endLabel : null}
    </div>
  );
}

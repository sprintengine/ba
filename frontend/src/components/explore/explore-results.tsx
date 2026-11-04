"use client";

import { useMemo } from "react";
import { Clock, RotateCw, SearchX } from "lucide-react";
import type { useMarketplaceSearch } from "@/lib/api/hooks/use-marketplace";
import { errorMessage, isApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/common/feedback";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListingCard, ListingCardSkeleton } from "./listing-card";

type SearchResult = ReturnType<typeof useMarketplaceSearch>;

/** A way out of an empty result, e.g. "Clear filters" or "Widen to 50 km". */
export type EmptySuggestion = { label: string; onSelect: () => void };

const GRID = "grid gap-3 sm:gap-4 @2xl:grid-cols-2";

/** Results list: skeletons, errors (incl. rate limiting and bad filters), empty state and "Show more". */
export function ExploreResults({
  search,
  emptyDescription,
  suggestions,
  onReset,
}: {
  search: SearchResult;
  emptyDescription: string;
  suggestions: EmptySuggestion[];
  onReset: () => void;
}) {
  const items = useMemo(() => search.data?.pages.flatMap((p) => p.items) ?? [], [search.data]);

  if (search.isPending) {
    return (
      <div role="status" aria-label="Loading results" className={GRID}>
        {Array.from({ length: 6 }, (_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (search.isError && !search.data) {
    return <ResultsError error={search.error} onRetry={() => search.refetch()} onReset={onReset} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<SearchX />}
        title="Nothing matches yet"
        description={emptyDescription}
        action={suggestions.map((s, i) => (
          <Button key={s.label} variant={i === 0 ? "primary" : "secondary"} onClick={s.onSelect}>
            {s.label}
          </Button>
        ))}
      />
    );
  }

  // Previous results stay visible (dimmed) while a new search loads.
  const refreshing = search.isPlaceholderData;
  return (
    <div className="flex flex-col gap-6">
      <p aria-live="polite" className="sr-only">
        {items.length === 1 ? "1 result" : `${items.length} results`}
        {search.hasNextPage ? ", more available" : ""}
      </p>
      <ul
        aria-busy={refreshing || undefined}
        className={cn(GRID, "transition-opacity duration-200", refreshing && "opacity-60")}
      >
        {items.map((listing) => (
          <li key={listing.business.id} className="flex *:flex-1">
            <ListingCard listing={listing} />
          </li>
        ))}
      </ul>
      {search.isFetchNextPageError ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground"
        >
          <p>{errorMessage(search.error, "We couldn't load more results.")}</p>
          <Button variant="secondary" onClick={() => search.fetchNextPage()}>
            <RotateCw /> Try again
          </Button>
        </div>
      ) : (
        search.hasNextPage && (
          <div className="flex justify-center">
            <Button
              variant="secondary"
              size="lg"
              loading={search.isFetchingNextPage}
              onClick={() => search.fetchNextPage()}
            >
              Show more
            </Button>
          </div>
        )
      )}
    </div>
  );
}

function ResultsError({
  error,
  onRetry,
  onReset,
}: {
  error: unknown;
  onRetry: () => void;
  onReset: () => void;
}) {
  if (isApiError(error) && error.code === "RATE_LIMITED") {
    return (
      <EmptyState
        icon={<Clock />}
        title="Lots of searches in a short time"
        description="Give it a few seconds, then try again. Your filters are saved."
        action={
          <Button variant="secondary" onClick={onRetry}>
            <RotateCw /> Try again
          </Button>
        }
      />
    );
  }
  if (isApiError(error) && error.code === "INVALID_REQUEST") {
    return (
      <EmptyState
        icon={<SearchX />}
        title="Those filters don't work together"
        description={errorMessage(error)}
        action={
          <Button variant="primary" onClick={onReset}>
            Reset filters
          </Button>
        }
      />
    );
  }
  return <ErrorState error={error} title="We couldn't load results" onRetry={onRetry} />;
}

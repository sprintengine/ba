"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Clock, Lock } from "lucide-react";
import { formatDate, formatRelativeDay, type PlainDate } from "@/lib/format";
import { useCountdown } from "@/lib/hooks/use-now";
import { opensLabel } from "@/lib/releases/text";
import { Button } from "@/components/ui/button";

/** Releases closer than this show a countdown and are refetched when they open. */
const WATCH_MS = 6 * 3_600_000;
/** Spread of the refetch after a release, so everyone waiting for it doesn't ask at the same instant. */
const JITTER_MS = 5_000;
/** When the server still says "not yet" (its clock is behind ours), ask again this much later, a few times at most. */
const RETRY_MS = 10_000;
const MAX_TRIES = 3;
/** setTimeout's longest delay. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Calls `refetch` once `opensAt` has passed (plus up to 5 s at random): a day that opens while the page is open shows
 * its times without a reload. A release further than 6 hours away is looked at again when it comes within them; when
 * the answer still has the same opening (the server's clock is behind), it asks again a couple of times. Null: nothing
 * to wait for.
 */
export function useRefetchAt(opensAt: string | null, refetch: () => void) {
  const latest = useRef(refetch);
  useEffect(() => {
    latest.current = refetch;
  });
  const [tick, setTick] = useState(0);
  const tries = useRef<{ opensAt: string | null; count: number }>({ opensAt: null, count: 0 });
  useEffect(() => {
    if (!opensAt) return;
    if (tries.current.opensAt !== opensAt) tries.current = { opensAt, count: 0 };
    if (tries.current.count >= MAX_TRIES) return;
    const wait = Date.parse(opensAt) - Date.now();
    const id =
      wait > WATCH_MS
        ? window.setTimeout(() => setTick((n) => n + 1), Math.min(wait - WATCH_MS, MAX_TIMEOUT_MS))
        : window.setTimeout(
            () => {
              tries.current.count += 1;
              latest.current();
              setTick((n) => n + 1);
            },
            Math.max(0, wait) + (tries.current.count === 0 ? Math.random() * JITTER_MS : RETRY_MS),
          );
    return () => window.clearTimeout(id);
  }, [opensAt, tick]);
}

/** "1 h 14 min", "9 min", "under a minute". */
export function formatCountdown(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (ms < 60_000) return "under a minute";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * A day that has times but isn't open for online booking yet (§21): when it opens (with a countdown in its last
 * hours), or that the business hasn't opened it; and a way on to the next day with free times.
 */
export function LockedDay({
  date,
  opensAt,
  timeZone,
  locale,
  nextAvailable,
  onNextAvailable,
}: {
  date: PlainDate;
  /** When it opens; null when the business holds it until they open it. */
  opensAt: string | null;
  timeZone: string;
  locale?: string;
  nextAvailable: PlainDate | null;
  onNextAvailable: (date: PlainDate) => void;
}) {
  const left = useCountdown(opensAt);
  const day = formatDate(date, timeZone, "long", locale);
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-5 dark:bg-surface-raised">
      <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
        <Lock className="size-5" />
      </span>
      <div>
        <p className="font-semibold">
          {opensAt ? `Opens ${opensLabel(opensAt, timeZone, locale)}` : "Not open for online booking yet"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {opensAt
            ? `Times for ${day} aren't open for online booking yet. Come back then to book.`
            : `${day} hasn't been opened for online booking yet. Please check back later or contact the business.`}
        </p>
      </div>
      {left !== null && left > 0 && left <= WATCH_MS && (
        <p
          className="tnum flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm font-medium"
          aria-live="off"
        >
          <Clock className="size-4 text-muted-foreground" /> Opens in {formatCountdown(left)}
        </p>
      )}
      {left === 0 && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Opening now…
        </p>
      )}
      {nextAvailable && (
        <Button variant="soft" size="sm" onClick={() => onNextAvailable(nextAvailable)}>
          Next available: {formatRelativeDay(nextAvailable, timeZone, locale)}
          <ChevronRight />
        </Button>
      )}
    </div>
  );
}

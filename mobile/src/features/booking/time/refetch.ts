/** Release schedules (architecture §21): when a closed day opens, look again. Pure helpers and the timer hook. */
import { useEffect, useRef, useState } from "react";
import type { PlainDate } from "@shared/format";

/** Releases closer than this show a countdown and are refetched when they open. */
export const WATCH_MS = 6 * 3_600_000;
/** Spread of the refetch after a release, so everyone waiting for it doesn't ask at the same instant. */
const JITTER_MS = 5_000;
/** When the server still says "not yet" (its clock is behind ours), ask again this much later, a few times at most. */
const RETRY_MS = 10_000;
const MAX_TRIES = 3;
/** setTimeout's longest delay. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Calls `refetch` once `opensAt` has passed (plus up to 5 s at random): a day that opens while the screen is open shows
 * its times without a reload (the website's `useRefetchAt`). Null: nothing to wait for.
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
        ? setTimeout(() => setTick((n) => n + 1), Math.min(wait - WATCH_MS, MAX_TIMEOUT_MS))
        : setTimeout(
            () => {
              tries.current.count += 1;
              latest.current();
              setTick((n) => n + 1);
            },
            Math.max(0, wait) + (tries.current.count === 0 ? Math.random() * JITTER_MS : RETRY_MS),
          );
    return () => clearTimeout(id);
  }, [opensAt, tick]);
}

/** The soonest time a closed day opens (held days have none), or null. */
export function nextOpening(locks: Map<PlainDate, { opensAt: string | null }>): string | null {
  const times = [...locks.values()].flatMap((l) => (l.opensAt ? [l.opensAt] : []));
  return times.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}

/** "1 h 14 min", "9 min", "under a minute". */
export function formatOpensIn(ms: number): string {
  if (ms < 60_000) return "under a minute";
  const minutes = Math.ceil(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

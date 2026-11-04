"use client";

import { useEffect, useState } from "react";

/**
 * The current time, refreshed every `intervalMs`: a render-safe alternative to `new Date()` in a component.
 * Pass `null` to stop ticking (the value stays at the last tick), e.g. while nothing on screen depends on it.
 */
export function useNow(intervalMs: number | null = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (intervalMs === null) return;
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Milliseconds until `iso` (never negative), ticking every second; null when there is no target. */
export function useCountdown(iso: string | null | undefined): number | null {
  const now = useNow(iso ? 1000 : null);
  if (!iso) return null;
  return Math.max(0, new Date(iso).getTime() - now.getTime());
}

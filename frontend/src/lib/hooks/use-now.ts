"use client";

import { createContext, useContext, useEffect, useState } from "react";

const FixedNow = createContext<Date | null>(null);

/** Holds the clock at one moment for what's inside, for a sample of a screen that must always show the same time. */
export const FixedNowProvider = FixedNow.Provider;

/**
 * The current time, refreshed every `intervalMs`: a render-safe alternative to `new Date()` in a component.
 * Pass `null` to stop ticking (the value stays at the last tick), e.g. while nothing on screen depends on it.
 */
export function useNow(intervalMs: number | null = 60_000): Date {
  const fixed = useContext(FixedNow);
  const [now, setNow] = useState(() => new Date());
  const ticking = fixed === null && intervalMs !== null;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [ticking, intervalMs]);
  return fixed ?? now;
}

/** Milliseconds until `iso` (never negative), ticking every second; null when there is no target. */
export function useCountdown(iso: string | null | undefined): number | null {
  const now = useNow(iso ? 1000 : null);
  if (!iso) return null;
  return Math.max(0, new Date(iso).getTime() - now.getTime());
}

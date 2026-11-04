import { useEffect, useState } from "react";

/**
 * Whether to mount UI that stays closed until asked for (the ⌘K menu, Bo's panel), loaded with `next/dynamic`: true
 * once the page has gone idle and `load` (the same dynamic import) has resolved, or straight away when `open`. Its
 * JavaScript stays out of the page's first load, and mounting it closed ahead of time keeps the first opening an
 * ordinary closed → open transition.
 */
export function useIdleMount(load: () => Promise<unknown>, open: boolean): boolean {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Safari has no requestIdleCallback.
    const idleApi = window as Partial<Pick<Window, "requestIdleCallback" | "cancelIdleCallback">>;
    let cancelled = false;
    const run = () => {
      // A failed preload is retried by next/dynamic when the UI is opened.
      load().then(
        () => !cancelled && setLoaded(true),
        () => undefined,
      );
    };
    const idle = idleApi.requestIdleCallback?.(run, { timeout: 3000 });
    const timer = idle === undefined ? window.setTimeout(run, 1500) : undefined;
    return () => {
      cancelled = true;
      if (idle !== undefined) idleApi.cancelIdleCallback?.(idle);
      window.clearTimeout(timer);
    };
  }, [load]);

  return loaded || open;
}

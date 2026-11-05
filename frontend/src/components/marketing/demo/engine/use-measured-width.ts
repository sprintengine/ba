import { useEffect, type RefObject } from "react";

/**
 * Keeps `--mw` on the element at its measured width. A scale worked out from `100cqw` alone comes out wrong in Safari
 * 26 (the replica drew tiny or not at all), so stages fall back on `cqw` only until this has run: `var(--mw, 100cqw)`.
 */
export function useMeasuredWidth(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      el.style.setProperty("--mw", `${String(el.clientWidth)}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
}

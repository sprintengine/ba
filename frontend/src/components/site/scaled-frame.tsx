"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Renders children at a fixed virtual width (e.g. a 1280px desktop) zoomed to fit the available
 * width. Site blocks use container queries, so they lay out exactly as on a real screen of that
 * width. CSS `zoom` (unlike transforms) also scales the layout box, so heights follow. `overflow:
 * clip` (not hidden) keeps the site's sticky header working inside a scrolling preview. Inline-size
 * containment keeps the virtual width out of the parent's intrinsic size, so an auto-sized grid or flex
 * column on a phone doesn't grow to fit it (and the zoom is measured against the real width).
 */
export function ScaledFrame({
  width,
  className,
  innerClassName,
  children,
}: {
  width: number;
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const update = () => setZoom(el.clientWidth > 0 ? Math.min(1, el.clientWidth / width) : 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={outer} className={cn("w-full overflow-clip contain-inline-size", className)}>
      <div style={{ width, zoom }} className={innerClassName}>
        {children}
      </div>
    </div>
  );
}

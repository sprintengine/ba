"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Fades content up once when it scrolls into view. The server's HTML shows it as is, so it reads without JavaScript
 * and before hydration; once hydrated, content still below the fold is lowered out of sight and fades up as it
 * arrives, and content already on screen (or scrolled past) stays put. Reduced motion: it simply appears. A CSS
 * transition driven by an IntersectionObserver, so the landing page doesn't load an animation library for it.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  "aria-hidden": ariaHidden,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  "aria-hidden"?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"static" | "hidden" | "shown">("static");
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let first = true;
    // In view once any of it is 80px above the bottom of the viewport.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const wasFirst = first;
        first = false;
        if (entry.isIntersecting) {
          if (!wasFirst) setState("shown");
          io.disconnect();
          return;
        }
        // The first report says where it started: only content entirely below the viewport (not just below the
        // margin) waits to fade up.
        if (wasFirst) {
          if (entry.boundingClientRect.top >= window.innerHeight) setState("hidden");
          else io.disconnect();
        }
      },
      { rootMargin: "0px 0px -80px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      aria-hidden={ariaHidden}
      style={
        state === "static"
          ? undefined
          : {
              opacity: state === "shown" ? 1 : 0,
              transform: state === "shown" ? "none" : "translateY(18px)",
              transition:
                reduce || state === "hidden"
                  ? "none"
                  : `opacity 0.6s ${EASE} ${delay}s, transform 0.6s ${EASE} ${delay}s`,
            }
      }
    >
      {children}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { LogoMark } from "@/components/brand/logo";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/** The particles come as their own chunk, and only as the section gets near. */
const ParticleInfinity = dynamic(() => import("./particle-infinity").then((m) => m.ParticleInfinity), {
  ssr: false,
});

/**
 * The words beside the infinity. The drawn symbol holds the place: it's what shows until the particles are up, with
 * reduced motion, and where WebGL isn't available.
 */
export function AnythingStage({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const mounted = useMounted();
  const reduce = useReducedMotion() && mounted;
  const [near, setNear] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [failed, setFailed] = useState(false);
  const onDrawing = useCallback(() => setDrawing(true), []);
  const onFailed = useCallback(() => {
    setDrawing(false);
    setFailed(true);
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => entry?.isIntersecting && setNear(true), {
      rootMargin: "600px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={root} className="relative isolate grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
      <div className="relative">{children}</div>
      <div ref={slot} className="relative aspect-[1087/620] w-full max-lg:order-first max-lg:max-w-md">
        <LogoMark
          aria-hidden
          title=""
          className={cn("size-full transition-opacity", drawing && "opacity-0")}
        />
      </div>
      {near && !reduce && !failed && (
        <ParticleInfinity slot={slot} onDrawing={onDrawing} onFailed={onFailed} />
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createDirector, run, type Director } from "./director";

/**
 * The stage's clock and its pause button. The script runs from when the stage appears until it goes, and stands still
 * while it's paused, scrolled off screen, or in a hidden tab. Reduced motion never starts it.
 */
export function useStageClock(
  scene: React.RefObject<HTMLElement | null>,
  still: boolean,
  script: (director: Director) => Promise<void>,
) {
  const [paused, setPaused] = useState(false);
  const clock = useRef<Director | null>(null);
  const latest = useRef(script);

  useEffect(() => {
    latest.current = script;
  });

  // Bumped to start the script again from the top, with a fresh clock.
  const [run_, setRun] = useState(0);

  useEffect(() => {
    const el = scene.current;
    if (still || !el) return;
    const director = createDirector();
    clock.current = director;
    const io = new IntersectionObserver(([e]) => director.hold("off screen", !e?.isIntersecting), {
      threshold: 0.2,
    });
    io.observe(el);
    const onVisibility = () => director.hold("hidden", document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    run(() => latest.current(director));
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      clock.current = null;
      director.stop();
    };
  }, [scene, still, run_]);

  return {
    paused,
    toggle: () => {
      clock.current?.hold("paused", !paused);
      setPaused(!paused);
    },
    /** Stops the script where it stands and runs it again, playing. */
    restart: () => {
      setPaused(false);
      setRun((n) => n + 1);
    },
  };
}

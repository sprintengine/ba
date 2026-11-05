"use client";

import { useEffect, useState } from "react";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

/**
 * Steps through a looping scene while it's on screen and not paused, holding each step for its duration. With reduced
 * motion it rests on the last step, which shows the result. Starts at step 0, as the server's HTML does.
 */
export function useScene(
  ref: React.RefObject<HTMLElement | null>,
  durations: readonly number[],
  paused: boolean,
): number {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const mounted = useMounted();
  const reduce = useReducedMotion() && mounted;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  useEffect(() => {
    if (reduce || paused || !visible) return;
    const id = window.setTimeout(() => setStep((s) => (s + 1) % durations.length), durations[step]);
    return () => window.clearTimeout(id);
  }, [reduce, paused, visible, step, durations]);

  return reduce ? durations.length - 1 : step;
}

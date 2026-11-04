"use client";

import { LazyMotion } from "motion/react";

const loadMotionFeatures = () => import("./motion-features").then((m) => m.default);

/**
 * Wrap `m.*` components (rather than `motion.*`) in this so motion's features load as their own chunk after the page
 * instead of in its first load. Same animations, springs and layout transitions.
 */
export function LazyMotionFeatures({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={loadMotionFeatures}>{children}</LazyMotion>;
}

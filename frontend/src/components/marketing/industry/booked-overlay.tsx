"use client";

import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { CircleCheck, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LazyMotionFeatures } from "@/components/ui/lazy-motion";

/** The preview's "booked" confirmation over the page, with Start over. */
export function BookedOverlay({
  open,
  title,
  detail,
  booking,
  onStartOver,
}: {
  open: boolean;
  title: string;
  detail: string;
  /** The business's word for a booking ("appointment"). */
  booking: string;
  onStartOver: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <LazyMotionFeatures>
      <AnimatePresence>
        {open && (
          <m.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-end justify-center bg-surface/85 p-6 pb-10 backdrop-blur-sm"
          >
            <m.div
              role="status"
              initial={reduce ? false : { opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-xs rounded-2xl border border-border bg-surface-raised p-6 text-center shadow-xl"
            >
              <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground">
                <CircleCheck className="size-6" />
              </span>
              <p className="mt-4 text-base font-semibold">{title}</p>
              <p className="tnum mt-1 text-sm text-muted-foreground">{detail}</p>
              <p className="mt-3 text-xs text-subtle-foreground">
                This is a preview. Your customers get a confirmation email with a link to manage their{" "}
                {booking.toLowerCase()}.
              </p>
              <Button variant="secondary" size="sm" className="mt-5" onClick={onStartOver}>
                <RotateCcw /> Start over
              </Button>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotionFeatures>
  );
}

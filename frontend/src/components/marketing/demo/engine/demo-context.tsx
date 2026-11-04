"use client";

import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";
import type { DemoPointer } from "./types";
import s from "./demo.module.css";

const PointerContext = createContext<DemoPointer>({ hover: null, pressed: null, focus: null });

export const DemoPointerProvider = PointerContext.Provider;

/**
 * Wire a replica element up as a cursor target: `data-demo` for the script, and the hover / pressed / focus
 * the cursor is applying to it (for the same styles a real pointer would trigger).
 */
export function useDemoTarget(id: string) {
  const pointer = useContext(PointerContext);
  return {
    hovered: pointer.hover === id,
    pressed: pointer.pressed === id,
    focused: pointer.focus === id,
    props: { "data-demo": id },
  };
}

/** A blinking text caret for the field being typed into. */
export function DemoCaret({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "ml-px inline-block h-[1.1em] w-px translate-y-[0.15em] bg-foreground",
        s.caret,
        className,
      )}
    />
  );
}

"use client";

import { useRef } from "react";
import { useMeasuredWidth } from "../../demo/engine/use-measured-width";
import s from "./prism.module.css";

/** A story beat's pane: its design size scaled to its column (see .card and .cardFit). */
export function FitCard({ style, children }: { style: React.CSSProperties; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useMeasuredWidth(ref);
  return (
    <div ref={ref} className={s.card} style={style}>
      {children}
    </div>
  );
}

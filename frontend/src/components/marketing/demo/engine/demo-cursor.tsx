import { cn } from "@/lib/utils";
import type { CursorState } from "./types";

/** A macOS-style arrow pointer (or a fingertip, on phones) with a click ripple, positioned in stage coordinates. */
export function DemoCursor({
  cursor,
  variant = "arrow",
}: {
  cursor: CursorState;
  variant?: "arrow" | "touch";
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-50 transition-[transform,opacity]",
        cursor.visible ? "opacity-100" : "opacity-0",
      )}
      style={{
        transform: `translate(${String(cursor.x)}px, ${String(cursor.y)}px)`,
        transitionDuration: `${String(cursor.ms)}ms, 200ms`,
        transitionTimingFunction: "cubic-bezier(0.45, 0.05, 0.25, 1)",
      }}
    >
      {/* Click ripple, centred on the hotspot */}
      <span
        className={cn(
          "absolute -top-5 -left-5 size-10 rounded-full bg-brand/25 ring-1 ring-brand/40 transition-[transform,opacity] duration-300 ease-out",
          cursor.pressed ? "scale-100 opacity-100" : "scale-50 opacity-0",
        )}
      />
      {variant === "touch" ? (
        <span
          className={cn(
            "absolute -top-5.5 -left-5.5 size-11 rounded-full bg-gray-950/20 shadow-[0_2px_10px_rgb(0_0_0/0.25)] ring-2 ring-white/80 backdrop-blur-[1px] transition-transform duration-150",
            cursor.pressed ? "scale-75 bg-gray-950/35" : "scale-100",
          )}
        />
      ) : (
        <svg
          width="22"
          height="28"
          viewBox="0 0 22 28"
          className={cn(
            "relative -top-px -left-px drop-shadow-[0_2px_3px_rgb(0_0_0/0.3)] transition-transform duration-100",
            cursor.pressed && "scale-90",
          )}
        >
          <path
            d="M1.5 1.5v21.2l5.3-5.1 3.4 8.1 3.9-1.6-3.4-8h7.4L1.5 1.5Z"
            fill="#111"
            stroke="#fff"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

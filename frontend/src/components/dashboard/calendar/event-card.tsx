import type { EventAppearance } from "@/lib/dashboard/calendar";
import { cn } from "@/lib/utils";

export const TONE_DOT = {
  neutral: "bg-subtle-foreground",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
} as const;

/** A booking's card: the service's colour across the whole of it, a little above the page, lifting on hover. */
export const CARD =
  "group absolute z-[5] flex flex-col overflow-clip rounded-md border text-left transition-[box-shadow,translate] duration-150 outline-none focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring";
export const CARD_RAISED = "hover:z-20 hover:shadow-md motion-safe:hover:-translate-y-0.5";

/** The soft service colour for a card: data on a grid, not a box, so its edge only just separates it from the next. */
export const serviceTint = (color: string, tint = "var(--event-tint)"): React.CSSProperties => ({
  backgroundColor: `color-mix(in oklab, ${color} ${tint}, var(--surface))`,
  borderColor: `color-mix(in oklab, ${color} 10%, var(--surface))`,
});

/**
 * The card's text. Its name and first detail stay in view while it is scrolled, so a long booking that began above
 * still says who and when; near the card's end the detail slides under the name, which goes last.
 */
export const CARD_TEXT = "block w-full flex-1 bg-inherit px-2 py-1";
export const STUCK_NAME = "sticky top-(--calendar-top,0px) z-[2] -mt-1 bg-inherit pt-1";
export const STUCK_DETAIL = "sticky top-[calc(var(--calendar-top,0px)+1.3125rem)] z-[1] bg-inherit";

/** How many lines of text a card this tall holds. */
export const linesFor = (h: number) => Math.max(1, Math.floor((h - 8) / 17));

export type Position = { left: string; width: string };

export const lanePosition = (lane: number, lanes: number): Position => {
  const width = 100 / lanes;
  return { left: `calc(${lane * width}% + 2px)`, width: `calc(${width}% - 4px)` };
};

export function StatusWord({ tone, children }: { tone: EventAppearance["tone"]; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "font-semibold",
        tone === "warning" ? "text-warning-soft-foreground" : "text-danger-soft-foreground",
      )}
    >
      {children}
    </span>
  );
}

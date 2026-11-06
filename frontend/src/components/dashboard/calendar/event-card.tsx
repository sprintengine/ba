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

/**
 * A booking's card: the service's colour across the whole of it, a little above the page, lifting on hover. It has no
 * stacking order of its own, so the now line runs over its colour and under its words.
 */
export const CARD =
  "group absolute flex flex-col overflow-clip rounded-md border text-left transition-[box-shadow,translate] duration-150 outline-none focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring";
/** The card open in the inspector. */
export const CARD_OPEN = "z-20 ring-2 ring-foreground";
export const CARD_RAISED = "hover:z-20 hover:shadow-md motion-safe:hover:-translate-y-0.5";

/** The soft service colour for a card: data on a grid, not a box, so its edge only just separates it from the next. */
export const serviceTint = (color: string, tint = "var(--event-tint)"): React.CSSProperties => ({
  backgroundColor: `color-mix(in oklab, ${color} ${tint}, var(--event-base))`,
  borderColor: `color-mix(in oklab, ${color} var(--event-edge), var(--event-base))`,
});

/**
 * Amber on any surface. Solid, because the pinned text inherits the card's background: a translucent amber would
 * stack with itself and show a strip behind the words.
 */
export const waitingFill: React.CSSProperties = { backgroundColor: "var(--event-waiting)" };

/**
 * The card's text. Its name and first detail stay in view while it is scrolled, so a long booking that began above
 * still says who and when; near the card's end the detail slides under the name, which goes last.
 */
export const CARD_TEXT = "block w-full flex-1 bg-inherit px-2 py-1";
/** A card too short for its usual padding: one line, close to the top, so a quarter hour stays readable in Compact. */
export const CARD_TEXT_TIGHT = "block w-full flex-1 bg-inherit px-1.5 py-0";
export const isTight = (h: number) => h < 25;
/** A line of a card's text, as wide as its words: it carries the card's colour, so the now line breaks around it. */
export const CARD_LINE = "relative z-[16] w-fit max-w-full bg-inherit";
export const STUCK_NAME = "sticky top-(--calendar-top,0px) z-[18] -mt-1 w-fit max-w-full bg-inherit pt-1";
export const STUCK_DETAIL = "sticky top-[calc(var(--calendar-top,0px)+1.3125rem)] z-[17] bg-inherit";

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

import { Check, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { WINDOW_BAR } from "./browser-window";

/**
 * The AI scenes' frames, shared with their poster so nothing moves when a scene arrives. On a laptop the phone shrinks
 * to fit under the heading, and the browser window around the calendar stays the phone's height. A phone in the hand
 * has room for the chat alone.
 */
export const SCENE_GRID =
  "relative grid justify-items-center gap-4 [--iphone-scale:0.66] sm:gap-5 sm:[--iphone-scale:0.72] lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:justify-items-stretch lg:gap-6 lg:[--iphone-scale:0.78] [@media(min-width:1024px)_and_(max-height:960px)]:[--iphone-scale:0.72]";
export const SCENE_WINDOW = "w-full max-sm:hidden";
export const SCENE_CALENDAR = `h-[42rem] lg:h-[calc(878px*var(--iphone-scale)-${WINDOW_BAR})]`;

/** What the calendar says when something lands on it. */
export function CalendarNotice({
  title,
  detail,
  className = "right-3 bottom-10 max-sm:bottom-3",
  style,
}: {
  title: string;
  detail: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cn(
        "absolute z-50 flex animate-pop-in items-center gap-2.5 rounded-xl bg-surface-raised px-3 py-2.5 text-sm shadow-lg ring-1 ring-border",
        className,
      )}
    >
      <span className="grid size-6 place-items-center rounded-full bg-success-soft text-success-soft-foreground">
        <Check className="size-3.5" />
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </div>
  );
}

export function SceneToggle({
  paused,
  onToggle,
  name = "animation",
}: {
  paused: boolean;
  onToggle: () => void;
  /** What it pauses, when the page has more than one. */
  name?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`${paused ? "Play" : "Pause"} the ${name}`}
      className="focus-ring flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground pointer-coarse:size-11"
    >
      {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
    </button>
  );
}

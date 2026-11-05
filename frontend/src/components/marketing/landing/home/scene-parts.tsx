import { Check, Pause, Play } from "lucide-react";

/**
 * The booking scene's frames, shared with its poster so nothing moves when the scene arrives. On a laptop the phone
 * shrinks to fit under the heading, and the calendar stays the phone's height.
 */
export const SCENE_GRID =
  "relative grid justify-items-center gap-4 [--iphone-scale:0.66] sm:gap-5 sm:[--iphone-scale:0.72] lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:justify-items-stretch lg:gap-6 lg:[--iphone-scale:0.78] [@media(min-width:1024px)_and_(max-height:960px)]:[--iphone-scale:0.72]";
export const SCENE_CALENDAR = "h-[17rem] w-full sm:h-[45rem] lg:h-[calc(878px*var(--iphone-scale))]";

/** What the calendar says when something lands on it. */
export function CalendarNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="absolute right-3 bottom-10 z-50 flex animate-pop-in items-center gap-2.5 rounded-xl bg-surface-raised px-3 py-2.5 text-sm shadow-lg ring-1 ring-border max-sm:bottom-3">
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

export function SceneToggle({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={paused ? "Play the animation" : "Pause the animation"}
      className="focus-ring flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground pointer-coarse:size-11"
    >
      {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
    </button>
  );
}

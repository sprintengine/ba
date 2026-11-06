import { Check, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The AI stage's frames, shared with its poster so nothing moves when it arrives: the chat at reading size and the
 * calendar answering beside it. A phone in the hand has room for the chat alone.
 */
export const SCENE_PANEL =
  "mx-auto w-[calc(100%-1.25rem)] max-w-[80rem] rounded-[1.5rem] bg-[#8fa7bd] bg-[url('/hero/coast-morning.webp')] bg-cover bg-center p-3 sm:w-[calc(100%-3rem)] sm:rounded-[2.25rem] sm:p-6 lg:p-8";
export const SCENE_GRID = "grid gap-4 lg:grid-cols-[23.5rem_minmax(0,1fr)] lg:gap-5";
export const SCENE_CHAT = "h-[33rem] lg:h-[36rem]";
export const SCENE_WINDOW = "w-full max-sm:hidden";
export const SCENE_CALENDAR = "h-[24rem] lg:h-[33.25rem]";

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

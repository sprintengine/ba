import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/** A phone, drawn from the page's own tokens so it follows light and dark. */
export function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[2.75rem] bg-foreground/90 p-[7px] shadow-[0_40px_80px_-32px_rgb(0_0_0/0.45)] ring-1 ring-border-strong dark:bg-gray-800",
        className,
      )}
    >
      <div className="relative flex h-[33rem] flex-col overflow-hidden rounded-[2.4rem] bg-surface text-left">
        <div className="absolute top-2.5 left-1/2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
        {children}
      </div>
    </div>
  );
}

/** The soft fill for a booking: a service's colour over the page, the same mix the real calendar uses. */
export const eventFill = (chart: number) => ({
  background: `color-mix(in srgb, var(--chart-${String(chart)}) var(--event-tint), var(--surface))`,
});

export function SceneToggle({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={paused ? "Play the animation" : "Pause the animation"}
      className="focus-ring flex size-8 items-center justify-center rounded-full text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground pointer-coarse:size-11"
    >
      {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
    </button>
  );
}

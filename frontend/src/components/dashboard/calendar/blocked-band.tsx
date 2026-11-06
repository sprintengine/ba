import type { BlockedInterval } from "@/lib/availability/windows";
import { cn } from "@/lib/utils";

/** Closed for everyone: a deeper fill than the sunken not-working hours. */
export const CLOSED_FILL = "bg-border";

/** Preparation is time taken, not more of the service's colour: a neutral hatch, quieter than any booking. */
export const PREPARATION_HATCH =
  "repeating-linear-gradient(135deg, var(--border) 0 1px, transparent 1px 7px)";

/**
 * A closure or time off on a column, named in words: the same quiet fill as hours nobody works, with the reason on it. It only marks the time: clicks fall through to the column, so
 * the business can still book over it, as with any closed hours.
 */
export function BlockedBand({ block, top, height }: { block: BlockedInterval; top: number; height: number }) {
  const word = block.kind === "closed" ? "Closed" : "Time off";
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 z-[1] overflow-clip",
        block.kind === "closed" ? CLOSED_FILL : "bg-muted",
      )}
      style={{ top, height }}
    >
      <span className="sticky top-(--calendar-top,0px) block truncate px-2 py-1 text-xs font-medium text-muted-foreground">
        {block.reason ? `${word} · ${block.reason}` : word}
      </span>
    </div>
  );
}

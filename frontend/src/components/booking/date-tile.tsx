import { formatDate, type PlainDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const SIZES = {
  md: { box: "w-14 self-start", day: "pt-0.5 text-xl", month: "pb-1" },
  lg: { box: "w-16 bg-surface shadow-xs max-sm:hidden", day: "pt-1 text-2xl", month: "pb-1.5" },
};

/** A tear-off calendar tile for a booking's date: weekday, day and month. Decorative (the date is in the text). */
export function DateTile({
  date,
  timeZone,
  size,
  muted = false,
}: {
  date: PlainDate;
  timeZone: string;
  /** "md" on My bookings cards, "lg" on the manage page (hidden on phones). */
  size: keyof typeof SIZES;
  /** Neutral for cancelled and past bookings, and still readable. */
  muted?: boolean;
}) {
  const s = SIZES[size];
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 flex-col items-center overflow-hidden rounded-xl border border-border text-center",
        s.box,
      )}
    >
      <span
        className={cn(
          "w-full py-0.5 text-2xs font-semibold tracking-wide uppercase",
          muted ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
        )}
      >
        {formatDate(date, timeZone, "weekday")}
      </span>
      <span className={cn("tnum leading-tight font-semibold", s.day)}>{Number(date.slice(8))}</span>
      <span className={cn("text-2xs text-muted-foreground uppercase", s.month)}>
        {formatDate(date, timeZone, "short").split(" ")[1]}
      </span>
    </div>
  );
}

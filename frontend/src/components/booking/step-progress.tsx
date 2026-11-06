import { cn } from "@/lib/utils";

/** Thin segmented progress indicator. */
export function StepProgress({
  index,
  total,
  labels,
  className,
}: {
  index: number;
  total: number;
  /** Each step's name, under its segment. */
  labels?: string[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        className="flex gap-1"
        role="progressbar"
        aria-label="Booking progress"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={index + 1}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              i <= index ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </div>
      {labels && (
        <div aria-hidden className="flex gap-1 text-xs">
          {labels.map((label, i) => (
            <span
              key={label}
              className={cn(
                "min-w-0 flex-1 truncate",
                i === index ? "font-medium text-foreground" : "text-subtle-foreground",
              )}
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

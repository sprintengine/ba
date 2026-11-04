import { cn } from "@/lib/utils";

/**
 * Friendly empty/zero state. Use for empty lists, "nothing today", errors with a retry.
 *   <EmptyState icon={<CalendarX/>} title="No bookings yet" description="…" action={<Button …/>} />
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "md",
  headingLevel = 3,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /**
   * The title's heading level: one below the heading it sits under (2 right under a page's title), 1 when it
   * stands in for the page (a not found or error page).
   */
  headingLevel?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      className={cn(
        "flex animate-rise flex-col items-center justify-center text-center",
        size === "sm" && "gap-2 px-4 py-8",
        size === "md" && "gap-3 px-6 py-14",
        size === "lg" && "gap-4 px-6 py-24",
        className,
      )}
    >
      {icon && (
        <div className="relative mb-1">
          <div aria-hidden className="absolute -inset-3 rounded-2xl bg-brand-soft/60 blur-xl" />
          <div className="relative flex size-11 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground shadow-sm [&_svg]:size-5">
            {icon}
          </div>
        </div>
      )}
      <div className="flex max-w-sm flex-col gap-1">
        <Heading className={cn("font-semibold tracking-tight", size === "lg" ? "text-lg" : "text-base")}>
          {title}
        </Heading>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

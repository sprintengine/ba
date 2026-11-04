import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";

/**
 * KPI tile.
 *   <StatCard label="Bookings (30d)" value="128" delta={{ value: "+12%", trend: "up" }} hint="vs previous 30 days" />
 */
export function StatCard({
  label,
  value,
  icon,
  delta,
  hint,
  loading,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  delta?: {
    value: string;
    trend: "up" | "down" | "flat";
    /** Is "up" good? default true */ positiveIsGood?: boolean;
  };
  hint?: React.ReactNode;
  loading?: boolean;
  className?: string;
}) {
  const good = delta
    ? delta.trend === "flat"
      ? null
      : (delta.trend === "up") === (delta.positiveIsGood ?? true)
    : null;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-xs",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {/* One line, so tiles in a row keep their figures level when a label is too long for a narrow tile. */}
        <span
          className="min-w-0 truncate text-sm font-medium text-muted-foreground"
          title={typeof label === "string" ? label : undefined}
        >
          {label}
        </span>
        {icon && <span className="shrink-0 text-subtle-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tracking-tight">{value}</span>
          {delta && (
            <span
              className={cn(
                "tnum inline-flex items-center gap-0.5 text-xs font-medium",
                good === true && "text-success-soft-foreground",
                good === false && "text-danger-soft-foreground",
                good === null && "text-muted-foreground",
              )}
            >
              {delta.trend === "up" && <ArrowUpRight className="size-3.5" />}
              {delta.trend === "down" && <ArrowDownRight className="size-3.5" />}
              {delta.value}
            </span>
          )}
        </div>
      )}
      {hint && <span className="-mt-1 text-xs text-subtle-foreground">{hint}</span>}
    </div>
  );
}

import { cn } from "@/lib/utils";

/** Width container for dashboard pages. `wide` for tables, `full` for calendars. */
export function PageContainer({
  size = "default",
  className,
  children,
}: {
  size?: "narrow" | "default" | "wide" | "full";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        size === "narrow" && "max-w-3xl",
        size === "default" && "max-w-5xl",
        size === "wide" && "max-w-7xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

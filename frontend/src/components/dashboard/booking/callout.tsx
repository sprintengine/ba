import { cn } from "@/lib/utils";

const TONES = {
  warning: "border-warning-border bg-warning-soft text-warning-soft-foreground",
  info: "border-info-border bg-info-soft text-info-soft-foreground",
  danger: "border-danger-border bg-danger-soft text-danger-soft-foreground",
  success: "border-success-border bg-success-soft text-success-soft-foreground",
} as const;

/** A tinted note with an icon at the top of the booking details (held, needs approval, cancelled). */
export function Callout({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0",
        TONES[tone],
      )}
    >
      {icon}
      <div>{children}</div>
    </div>
  );
}

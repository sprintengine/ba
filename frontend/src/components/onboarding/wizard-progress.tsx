import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Start", "Review", "Design", "Launch"] as const;

/** Slim progress indicator for the onboarding wizard. */
export function WizardProgress({ current, className }: { current: 0 | 1 | 2 | 3; className?: string }) {
  return (
    <nav aria-label="Setup progress" className={cn("w-full", className)}>
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((label, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li
              key={label}
              aria-current={state === "current" ? "step" : undefined}
              className="flex flex-col gap-2"
            >
              <span className="relative h-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full bg-brand transition-[width] duration-500 ease-out",
                    state === "todo" ? "w-0" : "w-full",
                    state === "current" && "bg-foreground",
                  )}
                />
              </span>
              <span
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium",
                  state === "todo" ? "text-subtle-foreground" : "text-foreground",
                )}
              >
                {state === "done" && <Check aria-hidden className="size-3 text-brand" />}
                <span className="tnum text-subtle-foreground">{i + 1}</span>
                {label}
                {state === "done" && <span className="sr-only">(completed)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

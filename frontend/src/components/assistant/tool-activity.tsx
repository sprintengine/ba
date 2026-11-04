import { Check, CircleAlert } from "lucide-react";
import type { ToolActivity } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

/** What Bo looked up or prepared for this answer, as small chips (running, done or failed). */
export function ToolActivityList({ tools }: { tools: ToolActivity[] }) {
  if (tools.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="What Bo did">
      {tools.map((t) => (
        <li
          key={t.id}
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
            t.status === "error"
              ? "border-warning-border bg-warning-soft text-warning-soft-foreground"
              : "border-border-subtle bg-surface-sunken text-muted-foreground",
          )}
          title={t.summary ?? undefined}
        >
          {t.status === "running" ? (
            <Spinner className="size-3" aria-hidden />
          ) : t.status === "done" ? (
            <Check className="size-3 text-success" aria-hidden />
          ) : (
            <CircleAlert className="size-3" aria-hidden />
          )}
          <span className="truncate">
            {t.status === "done" && t.summary ? t.summary : t.label}
            {t.status === "running" && "…"}
          </span>
          <span className="sr-only">
            {t.status === "running" ? " (in progress)" : t.status === "error" ? " (didn't work)" : " (done)"}
          </span>
        </li>
      ))}
    </ul>
  );
}

"use client";

import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * One section of the review page. Collapsible sections show their `summary` when closed so the
 * page reads as an overview first and an editor second.
 */
export function SectionCard({
  id,
  icon,
  title,
  summary,
  problems = 0,
  open,
  onOpenChange,
  action,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  summary?: React.ReactNode;
  problems?: number;
  /** Omit `open`/`onOpenChange` for an always-open section. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const collapsible = onOpenChange !== undefined;
  const expanded = collapsible ? !!open : true;
  const headingId = `${id}-title`;
  const bodyId = `${id}-body`;

  const heading = (
    <span className="flex min-w-0 flex-1 items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span id={headingId} className="text-base font-semibold tracking-tight">
            {title}
          </span>
          {problems > 0 && (
            <Badge tone="danger" dot>
              {problems === 1 ? "1 to fix" : `${problems} to fix`}
            </Badge>
          )}
        </span>
        {summary && <span className="text-sm text-muted-foreground">{summary}</span>}
      </span>
    </span>
  );

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="scroll-mt-24 rounded-xl border border-border bg-surface shadow-xs"
    >
      <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => onOpenChange(!expanded)}
            className="-m-1.5 flex min-w-0 flex-1 items-start gap-3 rounded-lg p-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {heading}
            <ChevronDown
              aria-hidden
              className={cn(
                "mt-1.5 size-4 shrink-0 text-subtle-foreground transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </button>
        ) : (
          heading
        )}
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {expanded && (
        <div id={bodyId} className="animate-fade-in border-t border-border-subtle px-4 py-4 sm:px-5 sm:py-5">
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * A list item that shows a one-line summary and expands into its editor.
 */
export function ItemRow({
  id,
  expanded,
  onToggle,
  leading,
  title,
  meta,
  aside,
  invalid,
  children,
}: {
  id: string;
  expanded: boolean;
  onToggle: () => void;
  leading?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  aside?: React.ReactNode;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      id={id}
      className={cn(
        "scroll-mt-24 rounded-lg border transition-[border-color,box-shadow,background-color] duration-150",
        expanded
          ? "border-border-strong bg-surface shadow-sm"
          : "border-border-subtle bg-surface-sunken/40 hover:border-border",
        invalid && !expanded && "border-danger-border",
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`${id}-editor`}
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {leading}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2 truncate text-sm font-medium">
            <span className="truncate">{title}</span>
            {invalid && (
              <Badge tone="danger" className="h-5">
                Fix
              </Badge>
            )}
          </span>
          {meta && <span className="truncate text-xs text-muted-foreground">{meta}</span>}
        </span>
        {aside && <span className="tnum shrink-0 text-sm text-muted-foreground">{aside}</span>}
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-subtle-foreground transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div
          id={`${id}-editor`}
          className="animate-fade-in border-t border-border-subtle px-3 pt-4 pb-3 sm:px-4"
        >
          {children}
        </div>
      )}
    </li>
  );
}

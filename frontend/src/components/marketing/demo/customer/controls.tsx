"use client";

import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlStyles } from "@/components/ui/input";
import { floatingSurface } from "@/components/ui/popover";
import { FOCUSED, Typed } from "../engine/controls";
import { useDemoTarget } from "../engine/demo-context";

/** A `<Textarea>` (content-sized, at least five lines' worth of height), with its resize grip. */
export function DemoTextarea({
  id,
  value,
  placeholder,
}: {
  id: string;
  value: string;
  placeholder?: string;
}) {
  const t = useDemoTarget(id);
  return (
    <div
      {...t.props}
      data-demo-y="0.3"
      className={cn(
        controlStyles,
        "relative min-h-20 px-3 py-2 text-base leading-6 break-words whitespace-pre-wrap",
        t.focused && FOCUSED,
      )}
    >
      <Typed value={value} placeholder={placeholder} focused={t.focused} caretClassName="h-[1.2em]" />
      <svg
        aria-hidden
        viewBox="0 0 8 8"
        className="absolute right-0.5 bottom-0.5 size-2 text-subtle-foreground"
        stroke="currentColor"
        strokeWidth="0.9"
      >
        <path d="M7.5 1.5 1.5 7.5M7.5 4.5 4.5 7.5" />
      </svg>
    </div>
  );
}

/**
 * A `<SelectTrigger size="lg">` with its open listbox (Radix renders it in a portal; here it sits below). A tap
 * doesn't make the trigger `:focus-visible`, so no ring.
 */
export function DemoSelect({
  id,
  value,
  options,
  open,
  highlighted,
}: {
  id: string;
  value: string | null;
  options: string[];
  open: boolean;
  highlighted?: string;
}) {
  const t = useDemoTarget(id);
  return (
    <div className="relative">
      <div
        {...t.props}
        className={cn(
          controlStyles,
          "flex h-11 items-center justify-between gap-2 px-3.5 text-left text-base",
          !value && "text-subtle-foreground",
        )}
      >
        <span className="truncate">{value ?? "Choose…"}</span>
        <ChevronDown className="size-4 shrink-0 text-subtle-foreground" />
      </div>
      {open && (
        <div
          className={cn(
            floatingSurface,
            "absolute inset-x-0 top-full mt-1.5 animate-pop-in overflow-hidden p-1",
          )}
        >
          {options.map((o) => (
            <SelectOption key={o} id={`${id}-${o.toLowerCase()}`} label={o} highlighted={o === highlighted} />
          ))}
        </div>
      )}
    </div>
  );
}

function SelectOption({ id, label, highlighted }: { id: string; label: string; highlighted: boolean }) {
  const t = useDemoTarget(id);
  return (
    <div
      {...t.props}
      className={cn(
        "relative flex h-8 items-center gap-2 rounded-md pr-8 pl-2 text-sm select-none",
        (highlighted || t.hovered || t.pressed) && "bg-accent",
      )}
    >
      {label}
      {t.pressed && <Check className="absolute right-2 size-4" />}
    </div>
  );
}

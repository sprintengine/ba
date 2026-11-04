"use client";

import { useId } from "react";
import { ToggleGroup } from "radix-ui";
import * as m from "motion/react-m";
import { cn } from "@/lib/utils";
import { LazyMotionFeatures } from "./lazy-motion";
import { Tooltip } from "./tooltip";

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
};

/** Where options with an icon drop their visible label (it stays their accessible name and tooltip). */
const COLLAPSE = { always: "sr-only", sm: "max-sm:sr-only", md: "max-md:sr-only" } as const;

/**
 * Single-choice switcher with a sliding indicator (Day / Week, List / Grid).
 *   <SegmentedControl value={view} onValueChange={setView} options={[{value:"day",label:"Day"}, …]} />
 * `collapseLabels="sm"` shows options that have an icon as the icon alone below `sm` (named, with a tooltip), so a
 * tight toolbar never has to cut a label short. On touch screens every option is a 44px target.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  size = "md",
  collapseLabels,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: "sm" | "md";
  collapseLabels?: keyof typeof COLLAPSE;
  className?: string;
  "aria-label"?: string;
}) {
  const layoutId = useId();
  return (
    <LazyMotionFeatures>
      <ToggleGroup.Root
        type="single"
        value={value}
        aria-label={ariaLabel}
        onValueChange={(v) => v && onValueChange(v as T)}
        className={cn(
          "inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5 pointer-coarse:h-11",
          size === "sm" ? "h-8" : "h-9",
          className,
        )}
      >
        {options.map((option) => {
          const active = option.value === value;
          const collapse = collapseLabels && option.icon ? COLLAPSE[collapseLabels] : undefined;
          const item = (
            <ToggleGroup.Item
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className={cn(
                "relative inline-flex h-full items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
                size === "sm" ? "px-2.5 text-xs" : "px-3 text-sm",
                "pointer-coarse:min-w-11 pointer-coarse:text-sm",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <m.span
                  layoutId={layoutId}
                  className="absolute inset-0 rounded-md bg-surface shadow-sm dark:bg-border-strong"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                {option.icon}
                <span className={collapse}>{option.label}</span>
              </span>
            </ToggleGroup.Item>
          );
          return collapse && typeof option.label === "string" ? (
            <Tooltip key={option.value} content={option.label}>
              {item}
            </Tooltip>
          ) : (
            item
          );
        })}
      </ToggleGroup.Root>
    </LazyMotionFeatures>
  );
}

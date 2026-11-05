"use client";

import { RadioGroup as RadioPrimitive } from "radix-ui";
import { Check } from "lucide-react";
import { normalizeHex, readableForeground } from "@/lib/theme/color";
import { cn } from "@/lib/utils";

const SIZE = {
  sm: "size-6 [&_svg]:size-3",
  md: "size-7 [&_svg]:size-3.5",
  lg: "size-8 [&_svg]:size-4",
} as const;

/**
 * A row of colour swatches to pick one from: a radio group, so Tab enters at the chosen colour and the arrow keys
 * move between them. Colours compare as normalised hex (`#0E7C70` is `#0e7c70`), and the choice is reported that
 * way. `includeValue` lists a value that isn't one of the swatches first, so a custom colour stays visible.
 * `children` (e.g. a custom colour control) sit at the end of the row, outside the arrow-key order.
 */
export function SwatchGroup({
  value,
  onValueChange,
  swatches,
  includeValue = false,
  size = "md",
  className,
  children,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (hex: string) => void;
  swatches: readonly string[];
  includeValue?: boolean;
  size?: keyof typeof SIZE;
  className?: string;
  children?: React.ReactNode;
  "aria-label": string;
}) {
  const selected = normalizeHex(value) ?? "";
  const listed = [...new Set(swatches.map((s) => normalizeHex(s) ?? s))];
  const shown = includeValue && selected && !listed.includes(selected) ? [selected, ...listed] : listed;
  return (
    <RadioPrimitive.Root
      value={selected}
      onValueChange={onValueChange}
      aria-label={ariaLabel}
      loop
      className={cn("flex flex-wrap gap-2", className)}
    >
      {shown.map((swatch) => (
        <RadioPrimitive.Item
          key={swatch}
          value={swatch}
          aria-label={swatch}
          className={cn(
            "relative flex shrink-0 items-center justify-center rounded-full ring-1 ring-input transition-transform duration-150 hover:scale-110 pointer-coarse:size-10",
            "ring-offset-2 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "data-[state=checked]:ring-2 data-[state=checked]:ring-foreground",
            SIZE[size],
          )}
          style={{ backgroundColor: swatch }}
        >
          <RadioPrimitive.Indicator asChild>
            <Check className="animate-pop-in" style={{ color: readableForeground(swatch) }} aria-hidden />
          </RadioPrimitive.Indicator>
        </RadioPrimitive.Item>
      ))}
      {children}
    </RadioPrimitive.Root>
  );
}

"use client";

import { useState } from "react";
import { Pipette } from "lucide-react";
import { BRAND_SWATCHES, contrastRatio, normalizeHex, readableForeground } from "@/lib/theme/color";
import { cn } from "@/lib/utils";
import { Input } from "./input";
import { SwatchGroup } from "./swatch-group";

/**
 * Brand colour picker: curated swatches + custom hex (with the native picker).
 * Shows a live contrast preview so owners pick accessible colours.
 */
export function ColorPicker({
  value,
  onValueChange,
  swatches = BRAND_SWATCHES,
  className,
  id,
}: {
  value: string;
  onValueChange: (hex: string) => void;
  swatches?: readonly string[];
  className?: string;
  id?: string;
}) {
  // Local text while typing; falls back to the committed value.
  const [draft, setDraft] = useState<string | null>(null);
  const hex = draft ?? value;
  const normalized = normalizeHex(value) ?? "#0e7c70";
  const fg = readableForeground(normalized);
  const ratio = contrastRatio(normalized, fg);
  const isCustom = !swatches.some((s) => normalizeHex(s) === normalized);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <SwatchGroup
        aria-label="Brand colour"
        size="lg"
        value={normalized}
        onValueChange={onValueChange}
        swatches={swatches}
      >
        <label
          className={cn(
            "relative flex size-8 cursor-pointer items-center justify-center rounded-full border border-dashed border-border-strong text-muted-foreground transition-colors hover:text-foreground pointer-coarse:size-10",
            isCustom && "border-solid ring-2 ring-foreground ring-offset-2 ring-offset-background",
          )}
          style={isCustom ? { backgroundColor: normalized, color: fg } : undefined}
          title="Custom colour"
        >
          <Pipette className="size-3.5" />
          <input
            type="color"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={normalized}
            onChange={(e) => onValueChange(e.target.value)}
            aria-label="Custom colour"
          />
        </label>
      </SwatchGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          id={id}
          value={hex}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = normalizeHex(e.target.value);
            if (n) onValueChange(n);
          }}
          onBlur={() => setDraft(null)}
          className="tnum w-32 font-mono text-sm uppercase"
          maxLength={7}
          aria-label="Hex colour"
          leading={
            <span
              className="size-3.5 rounded-full shadow-[inset_0_0_0_1px_oklch(0_0_0/0.15)]"
              style={{ backgroundColor: normalized }}
            />
          }
        />
        <div
          className="inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap shadow-button"
          style={{ backgroundColor: normalized, color: fg }}
        >
          Book now
        </div>
        <span
          className={cn(
            "tnum text-xs whitespace-nowrap",
            ratio >= 4.5 ? "text-muted-foreground" : "text-warning-soft-foreground",
          )}
        >
          {ratio >= 4.5
            ? `Contrast ${ratio.toFixed(1)}:1 · AA`
            : `Low contrast (${ratio.toFixed(1)}:1) — we'll adjust it`}
        </span>
      </div>
    </div>
  );
}

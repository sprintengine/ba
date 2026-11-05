"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input, type InputProps } from "./input";

/** Larger values are cut to this while typing, so a held key can't produce an unsafe integer. */
const MAX_TYPED = 1_000_000_000;

/** What a decimal-mode draft may look like: an optional leading minus, digits, one `.` or `,` separator. */
const DECIMAL_DRAFT = /^-?\d*[.,]?\d*$/;

export type NumberInputMode = "integer" | "decimal";

type Parsed = { draft: string; value?: number | null };

/** Digits only (anything else is dropped); empty is null. */
function parseInteger(raw: string): Parsed {
  const draft = raw.replace(/[^\d]/g, "");
  return { draft, value: draft === "" ? null : Math.min(Number(draft), MAX_TYPED) };
}

/**
 * Keeps digits, one separator and a leading minus; a change that still doesn't fit (a second separator, a minus in
 * the middle) is rejected and the previous draft stays. A comma reads as a decimal point. A draft that isn't a number
 * yet ("-", ".") keeps the last value.
 */
function parseDecimal(raw: string, previous: string): Parsed {
  const draft = raw.replace(/[^\d.,-]/g, "");
  if (!DECIMAL_DRAFT.test(draft)) return { draft: previous };
  if (draft === "") return { draft, value: null };
  const n = Number(draft.replace(",", "."));
  return Number.isFinite(n) ? { draft, value: n } : { draft };
}

function display(value: number | null) {
  return value === null || Number.isNaN(value) ? "" : String(value);
}

/**
 * Number input bound to `number | null` (empty = null); the field may be empty while editing.
 *
 * - `mode="integer"` (default): whole, non-negative numbers; only digits can be typed or pasted.
 * - `mode="decimal"`: signed decimals; `.` or `,` as the separator, other characters are rejected.
 *
 * `min`/`max` clamp the value when the field loses focus (validation can flag it instead when they are left out).
 * `unit` shows a suffix such as "min".
 */
export function NumberInput({
  value,
  onValueChange,
  mode = "integer",
  min,
  max,
  unit,
  className,
  onBlur,
  ...props
}: Omit<InputProps, "value" | "onChange" | "type" | "min" | "max" | "trailing"> & {
  value: number | null;
  onValueChange: (value: number | null) => void;
  mode?: NumberInputMode;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      inputMode={mode === "decimal" ? "decimal" : "numeric"}
      autoComplete="off"
      className={cn("tnum", !unit && className)}
      wrapperClassName={unit ? className : undefined}
      {...props}
      trailing={unit ? <span className="text-xs text-subtle-foreground">{unit}</span> : undefined}
      value={draft ?? display(value)}
      onChange={(e) => {
        const parsed =
          mode === "decimal"
            ? parseDecimal(e.target.value, draft ?? display(value))
            : parseInteger(e.target.value);
        setDraft(parsed.draft);
        if (parsed.value !== undefined) onValueChange(parsed.value);
      }}
      onBlur={(e) => {
        setDraft(null);
        if (value !== null && min !== undefined && value < min) onValueChange(min);
        if (value !== null && max !== undefined && value > max) onValueChange(max);
        onBlur?.(e);
      }}
    />
  );
}

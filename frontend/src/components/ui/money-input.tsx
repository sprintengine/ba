"use client";

import { useState } from "react";
import { centsToInput, currencySymbol, parseMoney } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import { Input, type InputProps } from "./input";

/**
 * Money input. Value is integer minor units (cents) | null — exactly what the API wants.
 *   <MoneyInput currency={business.currency} value={priceCents} onValueChange={setPriceCents} />
 */
export function MoneyInput({
  value,
  onValueChange,
  currency,
  locale = "en-IE",
  className,
  onBlur,
  ...props
}: Omit<InputProps, "value" | "onChange" | "defaultValue" | "leading"> & {
  value: number | null;
  onValueChange: (cents: number | null) => void;
  currency: string;
  locale?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? centsToInput(value, currency, locale);
  const parsedDraft = draft === null ? null : parseMoney(draft, currency, locale);
  // A price is never negative: "-5" is flagged rather than silently ignored.
  const invalid = draft !== null && draft.trim() !== "" && (parsedDraft === null || parsedDraft < 0);
  return (
    <Input
      inputMode="decimal"
      autoComplete="off"
      placeholder="0.00"
      leading={<span className="font-medium">{currencySymbol(currency, locale)}</span>}
      className={cn("tnum", className)}
      {...props}
      aria-invalid={invalid || props["aria-invalid"]}
      value={shown}
      onChange={(e) => {
        setDraft(e.target.value);
        const parsed = parseMoney(e.target.value, currency, locale);
        if (parsed !== null && parsed >= 0) onValueChange(parsed);
        else if (e.target.value.trim() === "") onValueChange(null);
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}

"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { minutesToTime, parseTimeInput, timeToMinutes, type TimeOfDay } from "@/lib/format/datetime";
import { Input, type InputProps } from "./input";

/**
 * Time-of-day input ("HH:mm", 24h). Accepts lenient typing ("9", "930", "2pm")
 * and normalises on blur. ↑/↓ step by `step` minutes.
 */
export function TimeInput({
  value,
  onValueChange,
  step = 15,
  onBlur,
  ...props
}: Omit<InputProps, "value" | "onChange" | "defaultValue"> & {
  value: TimeOfDay | null;
  onValueChange: (value: TimeOfDay | null) => void;
  step?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value ?? "";

  function commit(raw: string) {
    setDraft(null);
    if (!raw.trim()) return onValueChange(null);
    const parsed = parseTimeInput(raw);
    if (parsed) onValueChange(parsed);
  }

  return (
    <Input
      inputMode="numeric"
      autoComplete="off"
      placeholder="09:00"
      leading={<Clock />}
      className="tnum w-32"
      {...props}
      value={shown}
      aria-invalid={
        draft !== null && draft.trim() !== "" && parseTimeInput(draft) === null ? true : props["aria-invalid"]
      }
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        commit(e.target.value);
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(e.currentTarget.value);
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const base = parseTimeInput(e.currentTarget.value) ?? value ?? "09:00";
          const mins = timeToMinutes(base);
          const next =
            e.key === "ArrowUp"
              ? Math.floor(mins / step) * step + step
              : Math.ceil(mins / step) * step - step;
          setDraft(null);
          onValueChange(minutesToTime(next));
        }
        props.onKeyDown?.(e);
      }}
    />
  );
}

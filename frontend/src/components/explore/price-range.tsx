"use client";

import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { Field } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";

type Range = { min: number | null; max: number | null };

/** Min/max price in cents. Commits after typing pauses, and only when the range makes sense. */
export function PriceRange({
  min,
  max,
  currency,
  onChange,
}: {
  min: number | null;
  max: number | null;
  currency: string;
  onChange: (range: Range) => void;
}) {
  const [draft, setDraft] = useState<Range>({ min, max });
  const [synced, setSynced] = useState<Range>({ min, max });
  const debounced = useDebouncedValue(draft, 500);
  // Follow outside changes (e.g. "Clear filters"), but not the echo of our own commit.
  if (synced.min !== min || synced.max !== max) {
    setSynced({ min, max });
    if (debounced.min !== min || debounced.max !== max) setDraft({ min, max });
  }
  const invalid = draft.min !== null && draft.max !== null && draft.max < draft.min;

  useEffect(() => {
    const ok = !(debounced.min !== null && debounced.max !== null && debounced.max < debounced.min);
    if (ok && (debounced.min !== min || debounced.max !== max)) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced draft
  }, [debounced]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Min price">
        <MoneyInput
          currency={currency}
          placeholder="Any"
          value={draft.min}
          onValueChange={(cents) => setDraft((d) => ({ ...d, min: cents }))}
        />
      </Field>
      <Field label="Max price" error={invalid ? "Must be at least the min" : undefined}>
        <MoneyInput
          currency={currency}
          placeholder="Any"
          value={draft.max}
          onValueChange={(cents) => setDraft((d) => ({ ...d, max: cents }))}
        />
      </Field>
    </div>
  );
}

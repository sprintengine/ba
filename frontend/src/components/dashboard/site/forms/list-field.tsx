"use client";

import {
  useFieldArray,
  useFormContext,
  type ArrayPath,
  type FieldArray,
  type FieldValues,
} from "react-hook-form";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";

/**
 * An editable list inside a section form (FAQ items, testimonials, highlights…): add up to `max`,
 * remove and reorder. `renderItem` renders the fields of item `index`.
 */
export function ListField<T extends FieldValues, N extends ArrayPath<T>>({
  name,
  label,
  itemLabel,
  max,
  newItem,
  renderItem,
  empty,
}: {
  name: N;
  label: string;
  /** e.g. "question" → "Add question", "Question 2". */
  itemLabel: string;
  max: number;
  newItem: () => FieldArray<T, N>;
  renderItem: (index: number) => React.ReactNode;
  empty?: React.ReactNode;
}) {
  const { control } = useFormContext<T>();
  const { fields, append, remove, move } = useFieldArray<T, N>({ control, name });
  const title = itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 flex w-full items-baseline justify-between text-sm font-medium">
        {label}
        <span className="tnum text-xs font-normal text-muted-foreground">
          {fields.length}/{max}
        </span>
      </legend>
      {fields.length === 0 && empty}
      <ol className="flex flex-col gap-3">
        {fields.map((f, index) => (
          <li
            key={f.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface-sunken/50 p-3"
          >
            <div className="flex items-center gap-1">
              <span className="mr-auto text-xs font-medium text-muted-foreground">
                {title} {index + 1}
              </span>
              <IconButton
                size="sm"
                variant="ghost"
                label={`Move ${itemLabel} ${index + 1} up`}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <ArrowUp />
              </IconButton>
              <IconButton
                size="sm"
                variant="ghost"
                label={`Move ${itemLabel} ${index + 1} down`}
                disabled={index === fields.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <ArrowDown />
              </IconButton>
              <IconButton
                size="sm"
                variant="ghost"
                label={`Remove ${itemLabel} ${index + 1}`}
                onClick={() => remove(index)}
              >
                <Trash2 />
              </IconButton>
            </div>
            {renderItem(index)}
          </li>
        ))}
      </ol>
      <Button
        size="sm"
        className="self-start"
        disabled={fields.length >= max}
        onClick={() => append(newItem())}
      >
        <Plus aria-hidden /> Add {itemLabel}
      </Button>
    </fieldset>
  );
}

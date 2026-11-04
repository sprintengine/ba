"use client";

import { useId } from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFieldControlProps } from "./field";
import { touchHitArea } from "./touch";

export function Checkbox({ className, ...rest }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  const props = useFieldControlProps(rest);
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer group/checkbox inline-flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-input bg-surface shadow-xs transition-colors",
        "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger dark:bg-surface-sunken",
        touchHitArea,
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex animate-pop-in items-center justify-center">
        <Check strokeWidth={3} className="size-3 group-data-[state=indeterminate]/checkbox:hidden" />
        <Minus strokeWidth={3} className="hidden size-3 group-data-[state=indeterminate]/checkbox:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/** Checkbox with a clickable label and optional description. */
export function CheckboxItem({
  label,
  description,
  className,
  id,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  label: React.ReactNode;
  description?: React.ReactNode;
}) {
  const autoId = useId();
  const controlId = id ?? autoId;
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <Checkbox id={controlId} className="mt-0.5" {...props} />
      <label htmlFor={controlId} className="flex flex-col gap-0.5 text-sm select-none">
        <span className="leading-5 font-medium">{label}</span>
        {description && <span className="text-muted-foreground">{description}</span>}
      </label>
    </div>
  );
}

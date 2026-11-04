"use client";

import { RadioGroup as RadioPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { useFieldControlProps, useFieldLabelledBy } from "./field";
import { touchHitArea } from "./touch";

export function RadioGroup({ className, ...rest }: React.ComponentProps<typeof RadioPrimitive.Root>) {
  const props = useFieldControlProps(rest);
  // A <label for> doesn't name a radiogroup (a div): point at the Field's label instead.
  const labelledBy = useFieldLabelledBy(!!rest["aria-label"] || !!rest["aria-labelledby"]);
  return (
    <RadioPrimitive.Root className={cn("grid gap-2.5", className)} aria-labelledby={labelledBy} {...props} />
  );
}

export function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof RadioPrimitive.Item>) {
  return (
    <RadioPrimitive.Item
      className={cn(
        "peer inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-surface shadow-xs transition-colors",
        "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
        "disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary dark:bg-surface-sunken",
        touchHitArea,
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator className="block size-1.5 animate-pop-in rounded-full bg-primary-foreground" />
    </RadioPrimitive.Item>
  );
}

/** Radio with label and optional description. */
export function RadioItem({
  value,
  label,
  description,
  id,
  disabled,
}: {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  id?: string;
  disabled?: boolean;
}) {
  const controlId = id ?? `radio-${value}`;
  return (
    <div className="flex items-start gap-2.5">
      <RadioGroupItem id={controlId} value={value} disabled={disabled} className="mt-0.5" />
      <label
        htmlFor={controlId}
        className="flex flex-col gap-0.5 text-sm select-none peer-disabled:opacity-50"
      >
        <span className="leading-5 font-medium">{label}</span>
        {description && <span className="text-muted-foreground">{description}</span>}
      </label>
    </div>
  );
}

/**
 * Large selectable cards (choose a service, a template, a payment mode).
 *
 *   <RadioCards value={v} onValueChange={setV} columns={2}>
 *     <RadioCard value="full" title="Full prepayment" description="…" icon={<CreditCard/>} />
 *   </RadioCards>
 */
export function RadioCards({
  className,
  columns = 1,
  ...props
}: React.ComponentProps<typeof RadioPrimitive.Root> & { columns?: 1 | 2 | 3 }) {
  return (
    <RadioGroup
      className={cn(
        "grid gap-2.5",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
      {...props}
    />
  );
}

export function RadioCard({
  value,
  title,
  description,
  icon,
  aside,
  disabled,
  className,
  children,
}: {
  value: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Right-aligned content, e.g. a price. */
  aside?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <RadioPrimitive.Item
      value={value}
      disabled={disabled}
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-xl border border-border bg-surface p-4 text-left shadow-xs transition-[border-color,box-shadow,background-color] duration-150",
        "outline-none hover:border-border-strong focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25",
        "data-[state=checked]:border-primary data-[state=checked]:bg-surface data-[state=checked]:shadow-[0_0_0_1px_var(--primary)]",
        "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-surface-raised",
        className,
      )}
    >
      {icon && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-data-[state=checked]:bg-brand-soft group-data-[state=checked]:text-brand-soft-foreground [&_svg]:size-[1.125rem]">
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-start justify-between gap-3">
          <span className="text-sm leading-5 font-medium">{title}</span>
          {aside && <span className="tnum text-sm font-medium text-foreground">{aside}</span>}
        </span>
        {description && <span className="text-sm text-muted-foreground">{description}</span>}
        {children}
      </span>
      <span
        aria-hidden
        className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input transition-colors group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary"
      >
        <span className="size-1.5 scale-0 rounded-full bg-primary-foreground transition-transform group-data-[state=checked]:scale-100" />
      </span>
    </RadioPrimitive.Item>
  );
}

"use client";

import { useId } from "react";
import type { FieldPath, FieldValues } from "react-hook-form";
import { Card } from "@/components/ui/card";
import { Field, type FieldParts, type FieldProps } from "@/components/ui/field";
import { FormField } from "@/components/ui/form";
import { cn } from "@/lib/utils";

/** Inside a card, fields are sunk into it rather than outlined: a page of them stays calm. Errors and focus still show. */
const softFields =
  "[&_:where(input,textarea,[role=combobox])]:shadow-none [&_:where(input,textarea,[role=combobox]):not([aria-invalid=true],:focus-visible)]:border-border-strong";

/**
 * The titled card every setting lives in: a short title above it, the rows inside, a hairline between them. `action`
 * sits at the end of the title's line, `note` is small print under the card.
 */
export function SettingGroup({
  title,
  description,
  action,
  note,
  id,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  note?: React.ReactNode;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const titleId = useId();
  return (
    <section id={id} aria-labelledby={titleId} className={cn("flex min-w-0 flex-col gap-2.5", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={titleId} className="text-sm leading-5 font-semibold tracking-tight">
            {title}
          </h3>
          {description && <p className="text-[0.8125rem] leading-5 text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <Card
        variant="panel"
        className={cn(
          "@container/settings divide-y divide-border-subtle overflow-hidden rounded-2xl",
          softFields,
        )}
      >
        {children}
      </Card>
      {note && <div className="text-xs leading-5 text-muted-foreground">{note}</div>}
    </section>
  );
}

type RowShape = {
  /** The control goes under the label, full width: long text, lists, tables. */
  stacked?: boolean;
  /** The control keeps its own size and stays on the right, on phones too: switches, chips. */
  fit?: boolean;
  /** The control keeps its own size beside a longer explanation, and goes under it on phones: buttons, statuses. */
  action?: boolean;
};

export const rowHelp = "text-[0.8125rem] leading-5 text-muted-foreground";

/** Label and help on the left, the control on the right in a column that lines up down the card. Phones stack it. */
function RowFrame({
  label,
  help,
  control,
  stacked,
  fit,
  action,
  disabled,
  className,
}: RowShape & {
  label: React.ReactNode;
  help: React.ReactNode;
  control: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      data-disabled={disabled || undefined}
      className={cn(
        "group flex min-h-14.5 px-4.5 py-3",
        stacked && "flex-col gap-2.5",
        fit && "items-center justify-between gap-4",
        !stacked &&
          !fit &&
          "flex-col gap-2 @lg/settings:flex-row @lg/settings:items-center @lg/settings:justify-between @lg/settings:gap-6",
        action && "gap-2.5 @lg/settings:gap-8",
        className,
      )}
    >
      {(label || help) && (
        <div className="flex min-w-0 flex-col gap-0.5">
          {label}
          {help}
        </div>
      )}
      {control && (
        <div
          className={cn(
            "flex min-w-0 flex-col gap-1.5",
            fit && "shrink-0 items-end",
            !stacked && !fit && !action && "@lg/settings:w-75 @lg/settings:shrink-0",
            action && "items-start @lg/settings:shrink-0 @lg/settings:items-end",
          )}
        >
          {control}
        </div>
      )}
    </div>
  );
}

/** A row that isn't one form control: a status, an action, several fields under one name. */
export function SettingRow({
  label,
  labelId,
  help,
  danger,
  className,
  children,
  ...shape
}: RowShape & {
  label?: React.ReactNode;
  /** For a group of controls this row names. */
  labelId?: string;
  help?: React.ReactNode;
  /** Red label: the row does something that can't be undone. */
  danger?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <RowFrame
      {...shape}
      className={className}
      label={
        label && (
          <p
            id={labelId}
            className={cn("text-sm leading-5 font-medium", danger && "text-danger-soft-foreground")}
          >
            {label}
          </p>
        )
      }
      help={help && <p className={rowHelp}>{help}</p>}
      control={children}
    />
  );
}

/** The row's layout for a <Field>: help stays by the label, an error goes under the control it's about. */
function fieldRow(help: React.ReactNode, shape: RowShape) {
  return function FieldRow({ label, control, error, helpId, disabled }: FieldParts) {
    return (
      <RowFrame
        {...shape}
        disabled={disabled}
        label={label}
        help={
          help && (
            <p id={helpId} className={rowHelp}>
              {help}
            </p>
          )
        }
        control={
          <>
            {control}
            {error}
          </>
        }
      />
    );
  };
}

/** A row for one control outside a form, wired up as a <Field>. */
export function SettingFieldRow({ stacked, fit, help, ...props }: Omit<FieldProps, "layout"> & RowShape) {
  return <Field {...props} help={help} layout={fieldRow(help, { stacked, fit })} />;
}

/** A row for one form control: <FormField> as a row. */
export function SettingFormRow<T extends FieldValues, N extends FieldPath<T>>({
  stacked,
  fit,
  help,
  ...props
}: Omit<React.ComponentProps<typeof FormField<T, N>>, "layout"> & RowShape) {
  return <FormField<T, N> {...props} help={help} layout={fieldRow(help, { stacked, fit })} />;
}

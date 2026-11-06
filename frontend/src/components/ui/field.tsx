"use client";

import { createContext, useContext, useId } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

type FieldContextValue = {
  id: string;
  descriptionId: string;
  errorId: string;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
  hasDescription: boolean;
  /** The label's id, when the field has a label. */
  labelId: string | null;
};

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Wires a control to its surrounding <Field>: id, aria-describedby, aria-invalid,
 * required, disabled. All form controls in this library call it, so
 * `<Field label="Email"><Input /></Field>` is fully accessible with no props.
 */
export function useFieldControlProps<
  P extends {
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: unknown;
    disabled?: boolean;
    required?: boolean;
  },
>(props: P): P {
  const field = useContext(FieldContext);
  if (!field) return props;
  const describedBy = [
    props["aria-describedby"],
    field.hasDescription ? field.descriptionId : null,
    field.invalid ? field.errorId : null,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    ...props,
    id: props.id ?? field.id,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
    disabled: props.disabled ?? (field.disabled || undefined),
    required: props.required ?? (field.required || undefined),
  };
}

/**
 * `aria-labelledby` for a composite control that a `<label for>` can't name (a radio group, a group of toggle
 * buttons): the surrounding <Field>'s label, unless the control is [named] already.
 */
export function useFieldLabelledBy(named: boolean): string | undefined {
  const field = useContext(FieldContext);
  return named ? undefined : (field?.labelId ?? undefined);
}

/** The parts of a field, for a layout other than the two orientations. */
export type FieldParts = {
  label: React.ReactNode;
  control: React.ReactNode;
  error: React.ReactNode;
  /** Give this to the element showing the help, so the control is described by it. */
  helpId: string;
  disabled: boolean;
};

export type FieldProps = {
  label?: React.ReactNode;
  /** Help text under the control. */
  help?: React.ReactNode;
  /** Error message; marks the control invalid. */
  error?: React.ReactNode;
  required?: boolean;
  /** Shows a quiet "Optional" hint next to the label. */
  optional?: boolean;
  disabled?: boolean;
  /** Element rendered at the right of the label row (e.g. a link). */
  labelAction?: React.ReactNode;
  /** "vertical" (default) or "horizontal" (label left, control right — for switches in settings). */
  orientation?: "vertical" | "horizontal";
  /** Places the parts itself (a settings row); it shows `help` too. Replaces `orientation`. */
  layout?: (parts: FieldParts) => React.ReactNode;
  id?: string;
  className?: string;
  children: React.ReactNode;
};

/** Label + control + help/error. Use it for every form control. */
export function Field({
  label,
  help,
  error,
  required = false,
  optional = false,
  disabled = false,
  labelAction,
  orientation = "vertical",
  layout,
  id,
  className,
  children,
}: FieldProps) {
  const autoId = useId();
  const controlId = id ?? `f${autoId.replace(/:/g, "")}`;
  const ctx: FieldContextValue = {
    id: controlId,
    descriptionId: `${controlId}-help`,
    errorId: `${controlId}-error`,
    invalid: !!error,
    required,
    disabled,
    hasDescription: !!help,
    labelId: label ? `${controlId}-label` : null,
  };

  const labelRow = label ? (
    <div className="flex items-center justify-between gap-3">
      <Label id={`${controlId}-label`} htmlFor={controlId}>
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        )}
        {optional && (
          <>
            <span aria-hidden className="ml-1.5 text-xs font-normal text-subtle-foreground">
              Optional
            </span>
            <span className="sr-only"> (optional)</span>
          </>
        )}
      </Label>
      {labelAction}
    </div>
  ) : null;

  const errorMessage = error ? (
    <p
      id={ctx.errorId}
      role="alert"
      className="flex animate-fade-in items-start gap-1.5 text-xs leading-5 font-medium text-danger-soft-foreground"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>{error}</span>
    </p>
  ) : null;

  const messages = (
    <>
      {help && !error && (
        <p id={ctx.descriptionId} className="text-xs leading-5 text-muted-foreground">
          {help}
        </p>
      )}
      {help && error && (
        <span id={ctx.descriptionId} className="sr-only">
          {help}
        </span>
      )}
      {errorMessage}
    </>
  );

  return (
    <FieldContext.Provider value={ctx}>
      {layout ? (
        layout({
          label: labelRow,
          control: children,
          error: errorMessage,
          helpId: ctx.descriptionId,
          disabled,
        })
      ) : orientation === "horizontal" ? (
        <div
          data-disabled={disabled || undefined}
          className={cn("group flex items-start justify-between gap-6", className)}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            {labelRow}
            {messages}
          </div>
          <div className="shrink-0 pt-0.5">{children}</div>
        </div>
      ) : (
        <div data-disabled={disabled || undefined} className={cn("group flex flex-col gap-1.5", className)}>
          {labelRow}
          {children}
          {messages}
        </div>
      )}
    </FieldContext.Provider>
  );
}

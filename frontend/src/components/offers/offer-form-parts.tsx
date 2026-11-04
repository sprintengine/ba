"use client";

import { useId } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** A titled block of the offer form. */
export function FormSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3 border-b border-border-subtle pb-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * A group of several controls (checkboxes, toggles) with one legend, help and error — the
 * multi-control counterpart of `<Field>`, which wires a single control.
 */
export function FieldGroup({
  legend,
  help,
  error,
  action,
  className,
  children,
}: {
  legend: React.ReactNode;
  help?: React.ReactNode;
  error?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <fieldset
      className={cn("flex min-w-0 flex-col gap-1.5", className)}
      aria-describedby={
        [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined
      }
      aria-invalid={error ? true : undefined}
    >
      {/* A legend only names its fieldset as its first child, so the visible one (beside the action) is a copy. */}
      <legend className="sr-only">{legend}</legend>
      <div className="flex items-center justify-between gap-3">
        <span aria-hidden className="text-sm font-medium text-foreground">
          {legend}
        </span>
        {action}
      </div>
      {children}
      {help && !error && (
        <p id={`${id}-help`} className="text-xs leading-5 text-muted-foreground">
          {help}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="flex items-start gap-1.5 text-xs leading-5 font-medium text-danger-soft-foreground"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </fieldset>
  );
}

/** A pill toggle (days of the week, quick picks). */
export function TogglePill({
  pressed,
  onPressedChange,
  label,
  children,
  className,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  /** Accessible name when the visible text is abbreviated. */
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex h-9 min-w-11 items-center justify-center rounded-lg border px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed
          ? "border-primary bg-primary text-primary-foreground shadow-button"
          : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground dark:bg-surface-raised",
        className,
      )}
    >
      {children}
    </button>
  );
}

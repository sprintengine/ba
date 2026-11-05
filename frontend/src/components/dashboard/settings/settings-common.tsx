"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { SETTINGS_NAV, settingsNavText } from "@/components/shells/dashboard-nav";
import { Button } from "@/components/ui/button";
import { Field, type FieldParts, type FieldProps } from "@/components/ui/field";
import { FormField, FormSubmit } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** The current page's address without its query string: where Stripe sends people back to. */
export const currentPageUrl = () =>
  typeof window !== "undefined" ? (window.location.href.split("?")[0] ?? "") : "";

/** The space between a page's groups: on a <Form>, or on a plain wrapper. */
export const settingsStack = "flex flex-col gap-8";

/**
 * The page's title from SETTINGS_NAV. `lede` adds its one line of description, for the pages whose name doesn't say
 * what they do.
 */
export function SettingsHeader({
  segment,
  lede = false,
  mark,
  actions,
}: {
  segment: string;
  lede?: boolean;
  /** A symbol after the title. */
  mark?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { v } = useVocabulary();
  const s = settingsNavText(
    SETTINGS_NAV.find((x) => x.segment === segment)!,
    v,
  );
  return (
    <div className="flex min-h-9 items-start justify-between gap-4 pb-6">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">{s.label}</h2>
          {mark}
        </div>
        {lede && <p className="text-sm text-muted-foreground">{s.description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Inside a card, fields are sunk into it rather than outlined: a page of them stays calm. Errors and focus still show. */
const softFields =
  "[&_:where(input,textarea,[role=combobox])]:bg-surface-sunken [&_:where(input,textarea,[role=combobox])]:shadow-none [&_:where(input,textarea,[role=combobox]):not([aria-invalid=true],:focus-visible)]:border-border-strong";

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

const rowHelp = "text-[0.8125rem] leading-5 text-muted-foreground";

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

/** A whole row that goes somewhere: to another page, or out of the app with `external`. */
export function SettingLink({
  href,
  label,
  help,
  external = false,
}: {
  href: string;
  label: React.ReactNode;
  help?: React.ReactNode;
  external?: boolean;
}) {
  const Icon = external ? ArrowUpRight : ChevronRight;
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener" : undefined}
      className="group/link flex min-h-14.5 items-center justify-between gap-4 px-4.5 py-3 transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm leading-5 font-medium">{label}</span>
        {help && <span className={rowHelp}>{help}</span>}
      </span>
      <Icon className="size-4 shrink-0 text-subtle-foreground transition-transform group-hover/link:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  );
}

/** A list inside a group, one thing to a row. */
export function SettingList({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("divide-y divide-border-subtle", className)} {...props} />;
}

/** One thing in a list: its name and chips, a line or two about it, and what you can do with it. */
export function SettingItem({
  leading,
  title,
  chips,
  meta,
  actions,
  dimmed,
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  chips?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Off for now: paused or inactive. */
  dimmed?: boolean;
}) {
  return (
    <li className="flex min-h-14.5 items-center gap-3 px-4.5 py-3">
      {leading}
      <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", dimmed && "opacity-70")}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm leading-5 font-medium">{title}</span>
          {chips}
        </div>
        {meta}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
    </li>
  );
}

/** A settings card: title, plain-language description, fields, optional footer (save bar). */
export function SettingsCard({
  title,
  description,
  footer,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className={cn("flex flex-col gap-5")}>{children}</CardContent>
      {footer && <CardFooter className="justify-end">{footer}</CardFooter>}
    </Card>
  );
}

export const CURRENCIES = ["EUR", "GBP", "USD", "CAD", "AUD", "NZD", "CHF", "SEK", "NOK", "DKK", "PLN"];
export const LOCALES = [
  { value: "en-IE", label: "English (Ireland)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-US", label: "English (US)" },
  { value: "ga-IE", label: "Gaeilge" },
  { value: "fr-FR", label: "Français" },
  { value: "de-DE", label: "Deutsch" },
  { value: "es-ES", label: "Español" },
  { value: "it-IT", label: "Italiano" },
  { value: "nl-NL", label: "Nederlands" },
  { value: "pl-PL", label: "Polski" },
];

/** How long the bar stays to say the save worked. */
const SAVED_MS = 2400;

/**
 * The one save pattern (must be inside <Form>). It rises when something changes, and after a save it stays a moment to
 * say so, in place of a toast: that's where the eye already is. Sticky, so it's in reach however long the page. On
 * phones it rides above the tab bar, and Bo's launcher where Bo is offered (3.5rem, 0.75rem above the tab bar), and
 * over them, so a tap on Save never lands on a tab link.
 */
export function SaveBar({ dirty, onDiscard }: { dirty: boolean; onDiscard: () => void }) {
  const { assistantAvailable } = useCurrentBusiness();
  const {
    formState: { isSubmitting, isSubmitSuccessful },
  } = useFormContext();
  const [wasSubmitting, setWasSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  if (wasSubmitting !== isSubmitting) {
    setWasSubmitting(isSubmitting);
    if (wasSubmitting && isSubmitSuccessful && !dirty) setSaved(true);
  }
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), SAVED_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  const showSaved = saved && !dirty;
  return (
    <>
      <span role="status" className="sr-only">
        {showSaved ? "Your changes are saved" : ""}
      </span>
      {(dirty || showSaved) && (
        <div
          className={cn(
            "sticky bottom-4 z-10 flex min-h-15 animate-rise items-center justify-end gap-2 rounded-2xl border border-border bg-surface-raised/85 px-4.5 py-3 shadow-lg backdrop-blur-md max-sm:z-40",
            assistantAvailable
              ? "max-sm:bottom-[calc(var(--tab-bar-height,0px)+env(safe-area-inset-bottom)+5rem)]"
              : "max-sm:bottom-[calc(var(--tab-bar-height,0px)+env(safe-area-inset-bottom)+0.75rem)]",
          )}
        >
          {dirty ? (
            <>
              <span className="mr-auto text-sm text-muted-foreground">Unsaved changes</span>
              <Button variant="ghost" onClick={onDiscard}>
                Discard
              </Button>
              <FormSubmit>Save changes</FormSubmit>
            </>
          ) : (
            <span aria-hidden className="mr-auto flex items-center gap-2.5 text-sm font-medium">
              {/* The lit dot: something just happened. */}
              <span className="size-2 rounded-full bg-[image:var(--prism-gradient)] shadow-[0_0_8px_var(--color-prism-lilac)]" />
              Changes saved
            </span>
          )}
        </div>
      )}
    </>
  );
}

/** A status row: a toned icon tile, a title and one line of explanation. */
export function StatusLine({
  tone,
  icon,
  title,
  text,
}: {
  tone: "success" | "warning" | "info" | "neutral";
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  const tones = {
    success: "bg-success-soft text-success-soft-foreground",
    warning: "bg-warning-soft text-warning-soft-foreground",
    info: "bg-info-soft text-info-soft-foreground",
    neutral: "bg-muted text-muted-foreground",
  };
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4.5",
          tones[tone],
        )}
      >
        {icon}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{text}</span>
      </div>
    </div>
  );
}

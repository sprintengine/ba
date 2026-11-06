"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { SETTINGS_NAV, settingsNavText } from "@/components/shells/dashboard-nav";
import { Button } from "@/components/ui/button";
import { FormSubmit } from "@/components/ui/form";
import { cn } from "@/lib/utils";

import { rowHelp } from "./setting-rows";

export * from "./setting-rows";

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

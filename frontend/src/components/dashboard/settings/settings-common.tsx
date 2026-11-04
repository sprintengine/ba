"use client";

import { useCurrentBusiness } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { SETTINGS_NAV, settingsNavText } from "@/components/shells/dashboard-nav";
import { Button } from "@/components/ui/button";
import { FormSubmit } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

/** The current page's address without its query string: where Stripe sends people back to. */
export const currentPageUrl = () =>
  typeof window !== "undefined" ? (window.location.href.split("?")[0] ?? "") : "";

/** Section title + description from SETTINGS_NAV. */
export function SettingsHeader({ segment, actions }: { segment: string; actions?: React.ReactNode }) {
  const { v } = useVocabulary();
  const s = settingsNavText(
    SETTINGS_NAV.find((x) => x.segment === segment)!,
    v,
  );
  return <SectionHeader title={s.label} description={s.description} actions={actions} className="pb-5" />;
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

/**
 * Sticky save bar for settings forms (must be inside <Form>). On phones it rides above the tab bar, and Bo's launcher
 * where Bo is offered (3.5rem, 0.75rem above the tab bar), and over them, so a tap on Save never lands on a tab link.
 */
export function SaveBar({ dirty, onDiscard }: { dirty: boolean; onDiscard: () => void }) {
  const { assistantAvailable } = useCurrentBusiness();
  if (!dirty) return null;
  return (
    <div
      className={cn(
        "sticky bottom-4 z-10 flex animate-rise items-center justify-end gap-2 rounded-xl border border-border bg-surface-raised/95 p-3 shadow-lg backdrop-blur-sm max-sm:z-40",
        assistantAvailable
          ? "max-sm:bottom-[calc(var(--tab-bar-height,0px)+env(safe-area-inset-bottom)+5rem)]"
          : "max-sm:bottom-[calc(var(--tab-bar-height,0px)+env(safe-area-inset-bottom)+0.75rem)]",
      )}
    >
      <span className="mr-auto pl-1 text-sm text-muted-foreground">You have unsaved changes</span>
      <Button variant="ghost" disabled={!dirty} onClick={onDiscard}>
        Discard
      </Button>
      <FormSubmit disabled={!dirty}>Save changes</FormSubmit>
    </div>
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

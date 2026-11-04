/**
 * Tailwind classes for the theme's structural choices (lib/site/themes.ts holds the choices, this
 * maps them to classes). Colours always come from semantic tokens.
 */
import type { SiteThemeKey } from "@/lib/api/types";
import type { CardStyle, EyebrowStyle } from "@/lib/site/themes";

export const CARD: Record<CardStyle, string> = {
  bordered: "rounded-xl border border-border bg-surface",
  soft: "rounded-2xl bg-surface shadow-md",
  offset: "rounded-xl border-2 border-border-strong bg-surface shadow-[5px_5px_0_0_var(--border-strong)]",
  playful: "rounded-2xl border-2 border-border bg-surface shadow-[0_6px_0_0_var(--border)]",
  flat: "rounded-xl bg-surface-sunken",
  hairline: "border-t border-border-strong bg-transparent",
};

/** Interactive affordance matching the card style. */
export const CARD_HOVER: Record<CardStyle, string> = {
  bordered: "transition-colors hover:border-brand-border",
  soft: "transition-shadow hover:shadow-lg",
  offset: "transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5",
  playful: "transition-transform hover:-translate-y-1",
  flat: "transition-colors hover:bg-muted",
  hairline: "transition-colors hover:bg-surface-sunken",
};

export const EYEBROW: Record<EyebrowStyle, string> = {
  pill: "inline-flex w-fit items-center rounded-full bg-highlight-soft px-3 py-1 text-xs font-semibold text-highlight-soft-foreground",
  caps: "text-xs font-semibold tracking-[0.2em] text-highlight uppercase",
  mono: "font-mono text-xs tracking-wide text-highlight uppercase",
  dot: "inline-flex items-center gap-2 text-sm font-semibold text-highlight before:size-1.5 before:rounded-full before:bg-highlight-fill",
};

/** Type scale per theme: page title (hero) and section titles. */
export const TYPE: Record<SiteThemeKey, { display: string; title: string; lead: string }> = {
  clinical: {
    display: "text-[2.5rem] @3xl:text-5xl @5xl:text-[3.5rem]",
    title: "text-3xl @3xl:text-4xl",
    lead: "text-base @3xl:text-lg",
  },
  calm: {
    display: "text-[2.75rem] @3xl:text-6xl @5xl:text-[4.5rem]",
    title: "text-[2.25rem] @3xl:text-5xl",
    lead: "text-lg @3xl:text-xl",
  },
  bold: {
    display: "text-5xl @3xl:text-7xl @5xl:text-[6.25rem]",
    title: "text-4xl @3xl:text-6xl",
    lead: "text-lg @3xl:text-xl",
  },
  playful: {
    display: "text-[2.75rem] @3xl:text-6xl @5xl:text-7xl",
    title: "text-4xl @3xl:text-5xl",
    lead: "text-lg @3xl:text-xl",
  },
  editorial: {
    display: "text-[3.25rem] @3xl:text-7xl @5xl:text-[6.5rem]",
    title: "text-[2.75rem] @3xl:text-6xl",
    lead: "text-lg @3xl:text-xl",
  },
  minimal: {
    display: "text-[2.75rem] @3xl:text-6xl @5xl:text-7xl",
    title: "text-3xl @3xl:text-5xl",
    lead: "text-lg @3xl:text-xl",
  },
};

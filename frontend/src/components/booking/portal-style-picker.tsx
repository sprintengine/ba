"use client";

import { Check } from "lucide-react";
import type { SiteThemeKey } from "@/lib/api/types";
import { SITE_THEME_KEYS, SITE_THEMES } from "@/lib/site/themes";
import { cn } from "@/lib/utils";
import { SiteScope } from "@/components/site/site-scope";

/**
 * The booking portal's style preset (`branding.portalStyle`): fonts, corners and surfaces, each shown as a small
 * booking card in the business's own colour. The only look a business picks besides its colour, logo and cover.
 */
export function PortalStylePicker({
  value,
  onChange,
  primaryColor,
  businessName,
  disabled = false,
}: {
  value: SiteThemeKey;
  onChange: (style: SiteThemeKey) => void;
  primaryColor: string;
  businessName: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Booking page style" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {SITE_THEME_KEYS.map((key) => {
        const theme = SITE_THEMES[key];
        const selected = key === value;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(key)}
            className={cn(
              "group focus-ring flex flex-col overflow-hidden rounded-xl border bg-surface text-left transition-all disabled:opacity-60",
              selected
                ? "border-brand shadow-[0_0_0_1px_var(--brand)]"
                : "border-border hover:border-border-strong hover:shadow-sm",
            )}
          >
            <SiteScope
              theme={key}
              palette={{ primaryColor, accent: null }}
              className="pointer-events-none border-b border-border bg-background p-3"
            >
              <div aria-hidden className="flex flex-col gap-2">
                <p className="site-heading truncate text-base text-foreground">{businessName}</p>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-2.5 py-2">
                  <span className="truncate text-xs text-muted-foreground">Today · 10:30</span>
                  <span className="shrink-0 rounded-[var(--radius-button)] bg-brand px-2 py-0.5 text-[11px] font-semibold text-brand-foreground">
                    Book
                  </span>
                </div>
              </div>
            </SiteScope>
            <span className="flex items-start justify-between gap-2 p-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{theme.name}</span>
                <span className="text-xs text-pretty text-muted-foreground">{theme.description}</span>
              </span>
              {selected && <Check className="size-4 shrink-0 text-brand" aria-hidden />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

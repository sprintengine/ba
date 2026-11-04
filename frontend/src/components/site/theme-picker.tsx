"use client";

import { memo, useDeferredValue, useMemo } from "react";
import { Check } from "lucide-react";
import type { PublicService, SiteContext, SitePlan, SiteThemeKey } from "@/lib/api/types";
import { SITE_THEME_KEYS, SITE_THEMES } from "@/lib/site/themes";
import { cn } from "@/lib/utils";
import { ScaledFrame } from "./scaled-frame";
import type { SiteBusiness } from "./site-render-context";
import { SiteRenderer } from "./site-renderer";

/**
 * Theme choice with live thumbnails: each card renders the business's own hero in that theme
 * (a real render at desktop width, scaled down), so owners see their site, not a stock sample.
 */
export function ThemePicker({
  value,
  onChange,
  plan,
  business,
  services,
  context,
  columns = 2,
}: {
  value: SiteThemeKey;
  onChange: (theme: SiteThemeKey) => void;
  plan: SitePlan;
  business: SiteBusiness;
  services: PublicService[];
  context: SiteContext;
  columns?: 2 | 3;
}) {
  // Six real renders: they catch up after typing instead of holding up every keystroke.
  const thumbnailPlan = useDeferredValue(plan);
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn("grid gap-3", columns === 3 ? "sm:grid-cols-3" : "grid-cols-2")}
    >
      {SITE_THEME_KEYS.map((key) => {
        const theme = SITE_THEMES[key];
        const selected = key === value;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(key)}
            className={cn(
              "group focus-ring flex flex-col overflow-hidden rounded-xl border bg-surface text-left transition-all",
              selected
                ? "border-brand shadow-[0_0_0_1px_var(--brand)]"
                : "border-border hover:border-border-strong hover:shadow-sm",
            )}
          >
            <div
              className="pointer-events-none relative h-28 overflow-hidden border-b border-border"
              aria-hidden
              inert
            >
              <ThemeThumbnail
                plan={thumbnailPlan}
                theme={key}
                business={business}
                services={services}
                context={context}
              />
            </div>
            <div className="flex items-start gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{theme.name}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{theme.bestFor}</p>
              </div>
              <span
                className={cn(
                  "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
                  selected ? "border-brand bg-brand text-brand-foreground" : "border-border-strong",
                )}
              >
                {selected && <Check className="size-3" strokeWidth={3} />}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** The business's hero in one theme; renders again only when the (deferred) plan changes. */
const ThemeThumbnail = memo(function ThemeThumbnail({
  plan,
  theme,
  business,
  services,
  context,
}: {
  plan: SitePlan;
  theme: SiteThemeKey;
  business: SiteBusiness;
  services: PublicService[];
  context: SiteContext;
}) {
  const themed = useMemo(() => ({ ...plan, theme }), [plan, theme]);
  return (
    <ScaledFrame width={1280}>
      <SiteRenderer
        plan={themed}
        business={business}
        services={services}
        context={context}
        mode="thumbnail"
      />
    </ScaledFrame>
  );
});

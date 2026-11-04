import type { SitePalette, SiteThemeKey } from "@/lib/api/types";
import { THEME_FONT_CLASSES } from "@/lib/site/fonts";
import { siteThemeVars } from "@/lib/site/themes";
import { cn } from "@/lib/utils";

/**
 * The `data-theme` scope of a public site (§15.8): theme tokens + palette as CSS variables, the
 * theme's fonts, and a `site` container so section blocks respond to the scope's width (the
 * editor preview renders true mobile and desktop layouts at any size). `mode` forces light or
 * dark for previews; omit it to follow the visitor's preference.
 */
export function SiteScope({
  theme,
  palette,
  mode,
  className,
  style,
  children,
}: {
  theme: SiteThemeKey;
  palette: Partial<SitePalette> | null | undefined;
  mode?: "light" | "dark";
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const scope = siteScopeProps(theme, palette, mode);
  return (
    <div {...scope} style={{ ...scope.style, ...style }} className={cn(scope.className, className)}>
      {children}
    </div>
  );
}

/** What makes an element a site's scope, for an element that is only sometimes one (`SiteScope` is always). */
export function siteScopeProps(
  theme: SiteThemeKey,
  palette: Partial<SitePalette> | null | undefined,
  mode?: "light" | "dark",
) {
  return {
    "data-theme": theme,
    "data-mode": mode,
    style: siteThemeVars(theme, palette) as React.CSSProperties,
    className: cn("@container/site relative isolate", THEME_FONT_CLASSES[theme]),
  };
}

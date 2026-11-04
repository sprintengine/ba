/**
 * Site themes (architecture §15.8). Each theme is a set of design-token overrides for the public
 * site and booking flow: surfaces and text (light and dark), heading/body fonts, radius scale,
 * section spacing and a few structural choices (header, images, cards, services layout) that the
 * section blocks read. Tokens are applied as CSS custom properties on the `data-theme` scope
 * (`siteThemeVars`) and mapped onto the semantic tokens in `globals.css`, exactly like the
 * per-business brand colour. The business palette is layered on top with contrast computed
 * against the theme's own surfaces, in both modes.
 *
 * Pure data + functions: no React, no fonts (see `fonts.ts`), so it is unit-testable. Each theme's tokens are a
 * file in `themes/` (types in `themes/types.ts`); the functions are here.
 */
import type { SitePalette, SiteThemeKey } from "@/lib/api/types";
import {
  brandPalette,
  contrastRatio,
  DEFAULT_BRAND,
  ensureContrast,
  mix,
  normalizeHex,
  readableForeground,
  WHITE,
} from "@/lib/theme/color";
import { BOLD } from "./themes/bold";
import { CALM } from "./themes/calm";
import { CLINICAL } from "./themes/clinical";
import { EDITORIAL } from "./themes/editorial";
import { MINIMAL } from "./themes/minimal";
import { PLAYFUL } from "./themes/playful";
import type { SiteThemeDef, ThemeSurfaces } from "./themes/types";

export type {
  CardStyle,
  EyebrowStyle,
  HeaderStyle,
  ImageStyle,
  ServicesStyle,
  SiteThemeDef,
  ThemeSurfaces,
} from "./themes/types";

export const SITE_THEME_KEYS: SiteThemeKey[] = [
  "clinical",
  "calm",
  "bold",
  "playful",
  "editorial",
  "minimal",
];

export const SITE_THEMES: Record<SiteThemeKey, SiteThemeDef> = {
  clinical: CLINICAL,
  calm: CALM,
  bold: BOLD,
  playful: PLAYFUL,
  editorial: EDITORIAL,
  minimal: MINIMAL,
};

/** The theme for [key], or Minimal when the key is missing or unknown (plans from older versions, AI output). */
export function siteTheme(key: string | null | undefined): SiteThemeDef {
  const byKey: Partial<Record<string, SiteThemeDef>> = SITE_THEMES;
  return (key ? byKey[key] : undefined) ?? SITE_THEMES.minimal;
}

export type HighlightPalette = {
  /** Text-safe on the surface (≥ 4.5:1). */
  highlight: string;
  /** Solid decorative fill (the accent itself, nudged to ≥ 3:1 on the surface). */
  fill: string;
  /** Readable text on `fill`. */
  fillForeground: string;
  soft: string;
  softForeground: string;
};

/** The accent (or primary) as text, fill and soft tint for one surface. */
export function highlightPalette(accent: string, surface: string, background: string): HighlightPalette {
  const isDark = contrastRatio(surface, "#000000") < contrastRatio(surface, WHITE);
  const base = normalizeHex(accent) ?? DEFAULT_BRAND;
  let fill = ensureContrast(ensureContrast(base, surface, 3), background, 3);
  // Text on the fill (badges, chips) must be readable too: move the fill away from its text colour.
  if (contrastRatio(fill, readableForeground(fill)) < 4.5)
    fill = ensureContrast(fill, readableForeground(fill), 4.5);
  const highlight = ensureContrast(isDark ? mix(base, WHITE, 0.25) : base, surface, 4.5);
  const soft = isDark ? mix(surface, base, 0.2) : mix(WHITE, base, 0.12);
  const softForeground = ensureContrast(isDark ? mix(base, WHITE, 0.4) : base, soft, 4.5);
  return { highlight, fill, fillForeground: readableForeground(fill), soft, softForeground };
}

const SURFACE_VARS: [keyof ThemeSurfaces, string][] = [
  ["background", "background"],
  ["foreground", "foreground"],
  ["surface", "surface"],
  ["surfaceRaised", "surface-raised"],
  ["sunken", "surface-sunken"],
  ["muted", "muted"],
  ["mutedForeground", "muted-foreground"],
  ["subtleForeground", "subtle-foreground"],
  ["hover", "accent"],
  ["border", "border"],
  ["borderSubtle", "border-subtle"],
  ["borderStrong", "border-strong"],
  ["input", "input"],
];

/**
 * Sites use the brand as text too (links, "Book" on service cards) as well as a fill with text on it, so it keeps
 * 4.5:1 on the surface and the page background (which can differ) and with its own foreground: moved away from the
 * surfaces until all three hold (mid-tones need it on dark themes).
 */
function textSafeBrand(brand: string, surfaces: ThemeSurfaces): string {
  const lightSurface =
    contrastRatio(surfaces.surface, "#000000") > contrastRatio(surfaces.surface, "#ffffff");
  const away = lightSurface ? "#000000" : "#ffffff";
  let solid = ensureContrast(ensureContrast(brand, surfaces.surface, 4.5), surfaces.background, 4.5);
  for (let i = 0; i < 20 && contrastRatio(solid, readableForeground(solid)) < 4.5; i++)
    solid = mix(solid, away, 0.05);
  return solid;
}

/**
 * Inline CSS custom properties for a `data-theme` scope: `--tl-*` (light) and `--td-*` (dark)
 * surfaces, brand and highlight colours (consumed by `[data-theme]` in globals.css), plus the
 * mode-independent radius, spacing and heading tokens.
 */
export function siteThemeVars(
  themeKey: SiteThemeKey | (string & {}),
  palette: Partial<SitePalette> | null | undefined,
) {
  const theme = siteTheme(themeKey);
  const primary = normalizeHex(palette?.primaryColor) ?? DEFAULT_BRAND;
  const accent = normalizeHex(palette?.accent) ?? normalizeHex(theme.defaultAccent) ?? primary;
  const vars: Record<string, string> = {};
  for (const [mode, surfaces] of [
    ["tl", theme.light],
    ["td", theme.dark],
  ] as const) {
    for (const [key, name] of SURFACE_VARS) vars[`--${mode}-${name}`] = surfaces[key];
    const brand = brandPalette(primary, surfaces.surface);
    const brandColor = textSafeBrand(brand.brand, surfaces);
    vars[`--${mode}-brand`] = brandColor;
    vars[`--${mode}-brand-hover`] = brand.brandHover;
    vars[`--${mode}-brand-foreground`] = readableForeground(brandColor);
    vars[`--${mode}-brand-soft`] = brand.brandSoft;
    vars[`--${mode}-brand-soft-foreground`] = brand.brandSoftForeground;
    vars[`--${mode}-brand-border`] = brand.brandBorder;
    vars[`--${mode}-ring`] = brand.ring;
    const hl = highlightPalette(accent, surfaces.surface, surfaces.background);
    vars[`--${mode}-highlight`] = hl.highlight;
    vars[`--${mode}-highlight-fill`] = hl.fill;
    vars[`--${mode}-highlight-foreground`] = hl.fillForeground;
    vars[`--${mode}-highlight-soft`] = hl.soft;
    vars[`--${mode}-highlight-soft-foreground`] = hl.softForeground;
  }
  const r = theme.radius;
  Object.assign(vars, {
    "--radius-sm": r.sm,
    "--radius-md": r.md,
    "--radius-lg": r.lg,
    "--radius-xl": r.xl,
    "--radius-2xl": r.xxl,
    "--radius-3xl": r.xxxl,
    "--radius-button": r.button,
    "--radius-image": r.image,
    "--site-section-y": theme.sectionY[0],
    "--site-section-y-lg": theme.sectionY[1],
    "--site-heading-weight": String(theme.heading.weight),
    "--site-heading-tracking": theme.heading.tracking,
    "--site-heading-transform": theme.heading.transform,
    "--site-heading-fvs": theme.heading.fvs,
    "--site-heading-leading": String(theme.heading.leading),
    "--font-heading": `var(${theme.fonts.heading}), ${theme.fonts.headingFallback}`,
    "--font-body": `var(${theme.fonts.body}), ${theme.fonts.bodyFallback}`,
  });
  return vars;
}

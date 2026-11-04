/**
 * The site-theme font allowlist, self-hosted from the repository (`fonts.module.css`, files in `font-files/`): no
 * requests to Google at build time or at runtime. Not preloaded: a page only downloads the files its theme actually
 * uses. Each theme's class defines the CSS variables that `siteThemeVars` references. The app itself is set in
 * Figtree (root layout); Geist belongs to the minimal site theme only.
 */
import type { SiteThemeKey } from "@/lib/api/types";
import fonts from "./fonts.module.css";

/** Class names that define each theme's font variables (apply on the `data-theme` scope). */
export const THEME_FONT_CLASSES: Record<SiteThemeKey, string | undefined> = {
  clinical: fonts.clinical,
  calm: fonts.calm,
  bold: fonts.bold,
  playful: fonts.playful,
  editorial: fonts.editorial,
  minimal: fonts.minimal,
};

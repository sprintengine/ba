/**
 * bookanything design tokens for React Native (brand: Prism). Values mirror the website's semantic tokens in
 * `frontend/src/app/globals.css` (`:root` and `.dark`) so a screen reads the same on both; names are the CSS
 * variables in camelCase (`--muted-foreground` → `mutedForeground`). This is the only file allowed raw colours and
 * sizes (`npm run lint:tokens`); change a value here and on the website together.
 */

export type ThemeColors = {
  /** The page behind everything. */
  background: string;
  foreground: string;
  /** Cards, lists, sheets. */
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  muted: string;
  /** Secondary text: 4.5:1 on surface and background. */
  mutedForeground: string;
  /** Tertiary text (meta, captions): still 4.5:1 on surface. */
  subtleForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  borderSubtle: string;
  borderStrong: string;
  input: string;
  /** Modal / sheet scrim. */
  overlay: string;
  /** The primary action: graphite ink in light, near-white in dark. */
  primary: string;
  primaryPressed: string;
  primaryForeground: string;
  /** bookanything's iris, or a business's own colour inside `<BrandScope>`. */
  brand: string;
  brandPressed: string;
  brandForeground: string;
  brandSoft: string;
  brandSoftForeground: string;
  brandBorder: string;
  /** Focus ring (external keyboards, switch access). */
  ring: string;
  success: string;
  successForeground: string;
  successSoft: string;
  successSoftForeground: string;
  warning: string;
  warningForeground: string;
  warningSoft: string;
  warningSoftForeground: string;
  danger: string;
  dangerPressed: string;
  dangerForeground: string;
  dangerSoft: string;
  dangerSoftForeground: string;
  info: string;
  infoForeground: string;
  infoSoft: string;
  infoSoftForeground: string;
  /** Decorative prism light (never text): the brand's spectrum. */
  prismCyan: string;
  prismLilac: string;
  prismPeach: string;
};

export const lightColors: ThemeColors = {
  background: "#f6f7f9",
  foreground: "#0f1012",
  surface: "#ffffff",
  surfaceRaised: "#ffffff",
  surfaceSunken: "#f1f2f4",
  muted: "#eef0f3",
  mutedForeground: "#50565f",
  subtleForeground: "#61676f",
  accent: "#eef0f3",
  accentForeground: "#0f1012",
  border: "#e2e4e8",
  borderSubtle: "#eceef1",
  borderStrong: "#cfd3d9",
  input: "#cfd3d9",
  overlay: "rgba(15, 16, 18, 0.32)",
  primary: "#0f1012",
  primaryPressed: "#2a2d33",
  primaryForeground: "#ffffff",
  brand: "#5b4ae0",
  brandPressed: "#4a3ac8",
  brandForeground: "#ffffff",
  brandSoft: "#f0eeff",
  brandSoftForeground: "#4232b8",
  brandBorder: "#d8d1ff",
  ring: "#5b4ae0",
  success: "#17804f",
  successForeground: "#ffffff",
  successSoft: "#e8f6ee",
  successSoftForeground: "#11683f",
  warning: "#e9a23b",
  warningForeground: "#2b1d05",
  warningSoft: "#fff5e3",
  warningSoftForeground: "#8a5300",
  danger: "#cf3437",
  dangerPressed: "#b42a2d",
  dangerForeground: "#ffffff",
  dangerSoft: "#fdeeee",
  dangerSoftForeground: "#a8262a",
  info: "#1f6fc0",
  infoForeground: "#ffffff",
  infoSoft: "#eaf3fc",
  infoSoftForeground: "#175c9e",
  prismCyan: "#8fd8f2",
  prismLilac: "#bfaeff",
  prismPeach: "#ffbf9c",
};

export const darkColors: ThemeColors = {
  background: "#0c0d0f",
  foreground: "#f2f3f5",
  surface: "#131418",
  surfaceRaised: "#1a1c20",
  surfaceSunken: "#08090b",
  muted: "#1c1e23",
  mutedForeground: "#b0b5bd",
  subtleForeground: "#959ba5",
  accent: "#212328",
  accentForeground: "#f2f3f5",
  border: "#26292e",
  borderSubtle: "#1d1f23",
  borderStrong: "#363a41",
  input: "#33363d",
  overlay: "rgba(0, 0, 0, 0.6)",
  primary: "#f2f3f5",
  primaryPressed: "#d8dbe0",
  primaryForeground: "#0f1012",
  brand: "#a99bff",
  brandPressed: "#bcb1ff",
  brandForeground: "#0f1012",
  brandSoft: "rgba(169, 155, 255, 0.14)",
  brandSoftForeground: "#cbc3ff",
  brandBorder: "rgba(169, 155, 255, 0.34)",
  ring: "#a99bff",
  success: "#3cc68a",
  successForeground: "#0f1012",
  successSoft: "rgba(60, 198, 138, 0.14)",
  successSoftForeground: "#86dfb5",
  warning: "#f0b54f",
  warningForeground: "#1f1503",
  warningSoft: "rgba(240, 181, 79, 0.14)",
  warningSoftForeground: "#f6cd85",
  danger: "#f0625f",
  dangerPressed: "#f47c79",
  dangerForeground: "#0f1012",
  dangerSoft: "rgba(240, 98, 95, 0.14)",
  dangerSoftForeground: "#f9a9a6",
  info: "#5aa9f0",
  infoForeground: "#0f1012",
  infoSoft: "rgba(90, 169, 240, 0.14)",
  infoSoftForeground: "#a3cef7",
  prismCyan: "#8fd8f2",
  prismLilac: "#bfaeff",
  prismPeach: "#ffbf9c",
};

/** The surfaces a business's brand colour is checked against (`@shared/theme/color` brandPalette). */
export const BRAND_SURFACES = { light: lightColors.surface, dark: darkColors.surface } as const;

/** Spacing scale in points; the keys are the website's Tailwind steps (`p-4` → `space[4]` = 16). */
export const space = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** Corner radii (globals.css `--radius-*`). */
export const radius = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 14,
  "2xl": 18,
  "3xl": 22,
  button: 12,
  full: 999,
} as const;

/** Hairline and focus widths. */
export const borderWidth = { hairline: 1, focus: 2 } as const;

/** Figtree, the brand's one typeface, one family per weight (bundled by the expo-font plugin in app.config.ts). */
export const fontFamily = {
  regular: "Figtree-Regular",
  medium: "Figtree-Medium",
  semibold: "Figtree-SemiBold",
  bold: "Figtree-Bold",
} as const;

export type FontWeightName = keyof typeof fontFamily;

/**
 * Type scale (globals.css `--text-*`). Sizes scale with the system text size (Dynamic Type / font scale);
 * `maxScale` caps the largest sizes so headings don't crowd the screen at accessibility sizes.
 */
export const typeScale = {
  /** Screen titles. */
  title1: { fontSize: 30, lineHeight: 38, letterSpacing: -0.9, weight: "bold", maxScale: 1.6 },
  /** Section and sheet titles. */
  title2: { fontSize: 24, lineHeight: 32, letterSpacing: -0.6, weight: "semibold", maxScale: 1.8 },
  /** Card titles. */
  title3: { fontSize: 18, lineHeight: 28, letterSpacing: -0.2, weight: "semibold", maxScale: 2 },
  /** Emphasised body. */
  headline: { fontSize: 16, lineHeight: 24, letterSpacing: 0, weight: "semibold", maxScale: 2.2 },
  body: { fontSize: 16, lineHeight: 24, letterSpacing: 0, weight: "regular", maxScale: 2.2 },
  /** Secondary lines in lists and cards. */
  callout: { fontSize: 14, lineHeight: 22, letterSpacing: 0, weight: "regular", maxScale: 2.2 },
  /** Meta, captions, badges. */
  footnote: { fontSize: 12, lineHeight: 18, letterSpacing: 0, weight: "medium", maxScale: 2.2 },
  /** Overlines ("UPCOMING"). */
  caption: { fontSize: 11, lineHeight: 16, letterSpacing: 0.4, weight: "semibold", maxScale: 2 },
} as const satisfies Record<
  string,
  { fontSize: number; lineHeight: number; letterSpacing: number; weight: FontWeightName; maxScale: number }
>;

export type TextVariant = keyof typeof typeScale;

/** Smallest touch target (WCAG 2.5.8 / Apple HIG: 44pt). */
export const MIN_TOUCH = 44;

/** Width at which the app switches from phone layout (tabs) to the large-screen layout (sidebar, split views). */
export const WIDE_BREAKPOINT = 700;

/** Sidebar width on large screens, and the list column of a split view. */
export const layout = {
  sidebarWidth: 264,
  splitListWidth: 380,
  maxContentWidth: 760,
  formWidth: 520,
} as const;

/** Motion durations (ms), skipped when the person asks for reduced motion. */
export const duration = { fast: 120, base: 180, slow: 280 } as const;

/** Elevation for raised surfaces (sheets, toasts), light and dark. */
export const shadow = {
  light: {
    shadowColor: "#0f1012",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  dark: {
    shadowColor: "#000000",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

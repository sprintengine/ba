import type { GeneratedPattern, HeroVariant, SiteThemeKey } from "@/lib/api/types";

export type ThemeSurfaces = {
  background: string;
  foreground: string;
  surface: string;
  surfaceRaised: string;
  sunken: string;
  muted: string;
  mutedForeground: string;
  subtleForeground: string;
  hover: string;
  border: string;
  borderSubtle: string;
  borderStrong: string;
  input: string;
};

export type HeaderStyle = "bar" | "floating" | "solid" | "centered" | "minimal";
export type ImageStyle = "rounded" | "arch" | "sharp" | "tilted" | "framed";
export type CardStyle = "bordered" | "soft" | "offset" | "playful" | "flat" | "hairline";
export type ServicesStyle = "list" | "cards" | "menu" | "numbered";
export type EyebrowStyle = "pill" | "caps" | "mono" | "dot";

export type SiteThemeDef = {
  key: SiteThemeKey;
  name: string;
  /** One line for the theme picker. */
  description: string;
  bestFor: string;
  /** Families from the `next/font` allowlist (fonts.ts); CSS variable names. */
  fonts: { heading: string; body: string; headingFallback: string; bodyFallback: string };
  heading: {
    weight: number;
    tracking: string;
    transform: "none" | "uppercase";
    fvs: string;
    leading: number;
  };
  radius: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    xxl: string;
    xxxl: string;
    button: string;
    image: string;
  };
  /** Vertical padding of a section (mobile, desktop). */
  sectionY: [string, string];
  header: HeaderStyle;
  image: ImageStyle;
  card: CardStyle;
  services: ServicesStyle;
  eyebrow: EyebrowStyle;
  defaultHero: HeroVariant;
  defaultPattern: GeneratedPattern;
  /** Suggested accent when the palette has none (null = use the primary colour). */
  defaultAccent: string | null;
  light: ThemeSurfaces;
  dark: ThemeSurfaces;
};

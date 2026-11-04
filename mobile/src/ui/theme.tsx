/**
 * Theme: light or dark from the system (`useColorScheme`), and a business's own brand colour where a screen shows
 * that business (`<BrandScope>`, the website's `BusinessThemeProvider`). Components read colours with `useTheme()`,
 * never from tokens directly, so both apply.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { brandPalette, normalizeHex } from "@shared/theme/color";
import { BRAND_SURFACES, darkColors, lightColors, type ThemeColors } from "./tokens";

export type ColorScheme = "light" | "dark";
export type Theme = { scheme: ColorScheme; colors: ThemeColors };

const THEMES: Record<ColorScheme, Theme> = {
  light: { scheme: "light", colors: lightColors },
  dark: { scheme: "dark", colors: darkColors },
};

const ThemeContext = createContext<Theme>(THEMES.light);

/** Follows the system appearance unless `scheme` forces one (tests, previews). */
export function ThemeProvider({ scheme, children }: { scheme?: ColorScheme; children: ReactNode }) {
  const system = useColorScheme();
  const resolved: ColorScheme = scheme ?? (system === "dark" ? "dark" : "light");
  return <ThemeContext.Provider value={THEMES[resolved]}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** The brand tokens for a business colour on this scheme's surface, contrast-checked (WCAG AA). */
export function brandColors(primary: string, scheme: ColorScheme): Partial<ThemeColors> {
  const p = brandPalette(primary, BRAND_SURFACES[scheme]);
  return {
    brand: p.brand,
    brandPressed: p.brandHover,
    brandForeground: p.brandForeground,
    brandSoft: p.brandSoft,
    brandSoftForeground: p.brandSoftForeground,
    brandBorder: p.brandBorder,
    ring: p.ring,
  };
}

/**
 * Re-brands its subtree in a business's colour (their booking, their page): `brand*` tokens become theirs, still
 * readable. Without a valid colour it changes nothing (bookanything's iris stays).
 */
export function BrandScope({ color, children }: { color: string | null | undefined; children: ReactNode }) {
  const parent = useTheme();
  const hex = normalizeHex(color);
  const value = useMemo<Theme>(
    () =>
      hex
        ? { scheme: parent.scheme, colors: { ...parent.colors, ...brandColors(hex, parent.scheme) } }
        : parent,
    [hex, parent],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

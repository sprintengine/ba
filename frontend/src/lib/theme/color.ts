/**
 * Colour utilities for per-business theming. Pure functions, sRGB hex in/out,
 * WCAG 2.x relative luminance and contrast. Tested in color.test.ts.
 */

type Rgb = { r: number; g: number; b: number };

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A full `#rrggbb` colour: the only form the API accepts (mirrors the backend's `Validator.COLOR`). */
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isHexColor(value: string | null | undefined): value is string {
  return !!value && HEX_RE.test(value.trim());
}

function parseHex(hex: string): Rgb {
  const [, digits] = HEX_RE.exec(hex.trim()) ?? [];
  if (!digits) throw new Error(`Invalid hex colour: ${hex}`);
  const h = digits.length === 3 ? digits.replace(/./g, "$&$&") : digits;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function toHex({ r, g, b }: Rgb): string {
  const c = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Normalise user input ("0F766E", "#abc") to lowercase #rrggbb, or null. */
export function normalizeHex(value: string | null | undefined): string | null {
  if (!isHexColor(value)) return null;
  return toHex(parseHex(value));
}

function channel(v: number) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Linear sRGB-space mix: amount 0 → a, 1 → b. */
export function mix(a: string, b: string, amount: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  const t = Math.min(1, Math.max(0, amount));
  return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

export const INK = "#1c1917";
export const WHITE = "#ffffff";

/** Best readable text colour on `bg`: white unless near-black ink contrasts better. */
export function readableForeground(bg: string, light = WHITE, dark = INK): string {
  return contrastRatio(bg, light) >= contrastRatio(bg, dark) ? light : dark;
}

/**
 * Nudge `color` toward black (or white) until it reaches `ratio` against `against`.
 * Returns the original colour when it already passes.
 */
export function ensureContrast(color: string, against: string, ratio: number): string {
  if (contrastRatio(color, against) >= ratio) return normalizeHex(color)!;
  const target = luminance(against) > 0.5 ? "#000000" : "#ffffff";
  for (let i = 1; i <= 20; i++) {
    const candidate = mix(color, target, i * 0.05);
    if (contrastRatio(candidate, against) >= ratio) return candidate;
  }
  return target;
}

export type BrandPalette = {
  brand: string;
  brandHover: string;
  brandForeground: string;
  brandSoft: string;
  brandSoftForeground: string;
  brandBorder: string;
  ring: string;
};

/**
 * Derive a full brand palette from a business primary colour for a given
 * surface. Guarantees:
 *  - brandForeground on brand ≥ 4.5:1 when achievable (brand is darkened/lightened if needed)
 *  - brand vs surface ≥ 4.5:1: solid buttons read as buttons, and `text-brand` links and labels are readable text
 *  - brandSoftForeground on brandSoft ≥ 4.5:1
 */
export function brandPalette(primary: string, surface: string): BrandPalette {
  const base = normalizeHex(primary) ?? DEFAULT_BRAND;
  const isDark = luminance(surface) < 0.2;

  // Solid brand must stand off the surface, as text too (`text-brand`), not just as a fill.
  let brand = ensureContrast(base, surface, 4.5);
  let brandForeground = readableForeground(brand);
  if (contrastRatio(brand, brandForeground) < 4.5) {
    // Push brand away from the foreground until text is readable.
    brand = ensureContrast(brand, brandForeground, 4.5);
    brandForeground = readableForeground(brand);
  }

  const towardText = brandForeground === WHITE ? "#000000" : "#ffffff";
  const brandHover = mix(brand, towardText, 0.12);
  const brandSoft = isDark ? mix(surface, brand, 0.18) : mix(WHITE, brand, 0.09);
  const brandSoftForeground = ensureContrast(isDark ? mix(brand, WHITE, 0.35) : brand, brandSoft, 4.5);
  const brandBorder = isDark ? mix(surface, brand, 0.4) : mix(WHITE, brand, 0.3);
  const ring = isDark ? mix(brand, WHITE, 0.15) : brand;

  return { brand, brandHover, brandForeground, brandSoft, brandSoftForeground, brandBorder, ring };
}

/** A calm teal, used when a business has not chosen a colour (their page is their brand, not ours). */
export const DEFAULT_BRAND = "#0e7c70";

/** Light and dark surfaces the business palette is computed against (≈ --surface). */
export const LIGHT_SURFACE = "#ffffff";
export const DARK_SURFACE = "#131418";

/** CSS custom properties consumed by `[data-business-theme]` in globals.css. */
export function businessThemeVars(primary: string | null | undefined): Record<string, string> {
  const color = normalizeHex(primary) ?? DEFAULT_BRAND;
  const light = brandPalette(color, LIGHT_SURFACE);
  const dark = brandPalette(color, DARK_SURFACE);
  const vars: Record<string, string> = {};
  const assign = (prefix: string, p: BrandPalette) => {
    vars[`--${prefix}brand`] = p.brand;
    vars[`--${prefix}brand-hover`] = p.brandHover;
    vars[`--${prefix}brand-foreground`] = p.brandForeground;
    vars[`--${prefix}brand-soft`] = p.brandSoft;
    vars[`--${prefix}brand-soft-foreground`] = p.brandSoftForeground;
    vars[`--${prefix}brand-border`] = p.brandBorder;
    vars[`--${prefix}brand-ring`] = p.ring;
  };
  assign("bt-", light);
  assign("bt-dark-", dark);
  return vars;
}

/** Curated swatches for the ColorPicker (all pass as a brand on white). */
export const BRAND_SWATCHES = [
  "#0e7c70", // lagoon
  "#1d4ed8", // cobalt
  "#4338ca", // indigo
  "#7c3aed", // violet
  "#be185d", // raspberry
  "#dc2626", // signal red
  "#c2410c", // ember
  "#b45309", // amber
  "#4d7c0f", // moss
  "#15803d", // forest
  "#0369a1", // harbour
  "#1c1917", // ink
] as const;

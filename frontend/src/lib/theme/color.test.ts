import { describe, expect, it } from "vitest";
import {
  BRAND_SWATCHES,
  brandPalette,
  businessThemeVars,
  contrastRatio,
  DARK_SURFACE,
  ensureContrast,
  LIGHT_SURFACE,
  normalizeHex,
  readableForeground,
} from "./color";

describe("color", () => {
  it("normalises hex input", () => {
    expect(normalizeHex("ABC")).toBe("#aabbcc");
    expect(normalizeHex("#0F766E")).toBe("#0f766e");
    expect(normalizeHex("teal")).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("picks a readable foreground", () => {
    expect(readableForeground("#0e7c70")).toBe("#ffffff");
    expect(readableForeground("#fde047")).not.toBe("#ffffff");
  });

  it("ensureContrast nudges colours until they pass", () => {
    const out = ensureContrast("#fef08a", "#ffffff", 3);
    expect(contrastRatio(out, "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  const nasty = [
    "#ffff00",
    "#ffffff",
    "#000000",
    "#00ff00",
    "#7f7f7f",
    "#f472b6",
    "#22d3ee",
    ...BRAND_SWATCHES,
  ];
  it.each(nasty)("brand palette for %s is accessible in light and dark", (color) => {
    for (const surface of [LIGHT_SURFACE, DARK_SURFACE]) {
      const p = brandPalette(color, surface);
      expect(contrastRatio(p.brand, p.brandForeground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.brandSoftForeground, p.brandSoft)).toBeGreaterThanOrEqual(4.5);
      // The brand is text too (`text-brand`), not only a fill.
      expect(contrastRatio(p.brand, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("emits light and dark CSS variables", () => {
    const vars = businessThemeVars("#be185d");
    expect(vars["--bt-brand"]).toBe("#be185d");
    expect(vars["--bt-brand-foreground"]).toBe("#ffffff");
    expect(vars["--bt-dark-brand"]).toMatch(/^#[0-9a-f]{6}$/);
    expect(businessThemeVars("nonsense")["--bt-brand"]).toBe("#0e7c70");
  });
});

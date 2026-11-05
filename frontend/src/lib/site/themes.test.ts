import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/theme/color";
import { must } from "@/test/must";
import { highlightPalette, SITE_THEME_KEYS, SITE_THEMES, siteTheme, siteThemeVars } from "./themes";

/** Colours owners really pick, including awkward ones. */
const NASTY = [
  "#ffff00",
  "#fde68a",
  "#00ff00",
  "#777777",
  "#000000",
  "#ffffff",
  "#0e7c70",
  "#db2777",
  "#1d4ed8",
  "#7c3aed",
];

describe("site themes", () => {
  it("defines six themes with complete light and dark surfaces", () => {
    expect(SITE_THEME_KEYS).toEqual(["clinical", "calm", "bold", "playful", "editorial", "minimal"]);
    for (const key of SITE_THEME_KEYS) {
      const t = SITE_THEMES[key];
      expect(t.key).toBe(key);
      for (const mode of [t.light, t.dark]) {
        // Body and secondary text stay readable on the theme's own surfaces.
        expect(contrastRatio(mode.foreground, mode.background)).toBeGreaterThanOrEqual(7);
        // Secondary and tertiary text are body text too (WCAG AA: 4.5:1), on every surface they can sit on.
        for (const fill of [
          mode.background,
          mode.surface,
          mode.surfaceRaised,
          mode.sunken,
          mode.muted,
          mode.hover,
        ]) {
          expect(contrastRatio(mode.mutedForeground, fill)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(mode.subtleForeground, fill)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("gives form fields an edge that reads on every surface they sit on (WCAG 1.4.11: 3:1)", () => {
    for (const key of SITE_THEME_KEYS) {
      for (const mode of [SITE_THEMES[key].light, SITE_THEMES[key].dark]) {
        for (const fill of [mode.background, mode.surface, mode.surfaceRaised]) {
          expect(contrastRatio(mode.input, fill), `${key} input on ${fill}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it.each(SITE_THEME_KEYS)("%s: any primary colour yields accessible brand tokens in both modes", (key) => {
    for (const color of NASTY) {
      const vars = siteThemeVars(key, { primaryColor: color, accent: color });
      for (const m of ["tl", "td"] as const) {
        const v = (name: string) => must(vars[`--${m}-${name}`], `--${m}-${name}`);
        const surface = v("surface");
        const background = v("background");
        const brand = v("brand");
        // The brand is also text (links, "Book" on service cards): 4.5:1 on the surface and the background.
        expect(contrastRatio(brand, surface), `${key} ${m} ${color} brand/surface`).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(
          contrastRatio(brand, background),
          `${key} ${m} ${color} brand/background`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(v("brand-foreground"), brand),
          `${key} ${m} ${color} text on brand`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(v("brand-soft-foreground"), v("brand-soft"))).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(v("highlight"), surface),
          `${key} ${m} ${color} highlight text`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(v("highlight-soft-foreground"), v("highlight-soft"))).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrastRatio(v("highlight-foreground"), v("highlight-fill"))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("sets radius, spacing, heading and font tokens from the theme", () => {
    const vars = siteThemeVars("editorial", { primaryColor: "#0e7c70", accent: null });
    expect(vars["--radius-button"]).toBe("0");
    expect(vars["--font-heading"]).toContain("--font-instrument-serif");
    expect(siteThemeVars("calm", null)["--radius-button"]).toBe("999px");
    expect(siteThemeVars("bold", null)["--site-heading-transform"]).toBe("uppercase");
  });

  it("uses the theme's accent when the palette has none", () => {
    const withDefault = siteThemeVars("playful", { primaryColor: "#0e7c70", accent: null });
    const withPrimary = siteThemeVars("minimal", { primaryColor: "#0e7c70", accent: null });
    expect(withDefault["--tl-highlight-fill"]).not.toBe(withPrimary["--tl-highlight-fill"]);
  });

  it("falls back to minimal for unknown themes and the lagoon for invalid colours", () => {
    expect(siteTheme("nope").key).toBe("minimal");
    expect(siteTheme(null).key).toBe("minimal");
    expect(siteTheme("bold").key).toBe("bold");
    expect(siteThemeVars("minimal", { primaryColor: "not-a-colour" })["--tl-brand"]).toBe("#0e7c70");
  });

  it("derives a highlight palette for dark surfaces", () => {
    const hl = highlightPalette("#db2777", "#1d1829", "#15111e");
    expect(contrastRatio(hl.highlight, "#1d1829")).toBeGreaterThanOrEqual(4.5);
  });
});

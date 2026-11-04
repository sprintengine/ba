import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_THEME_KEYS, SITE_THEMES } from "./themes";

// Tests don't process CSS (any class name "exists"), so these read the stylesheet itself.
const css = readFileSync(path.join(import.meta.dirname, "fonts.module.css"), "utf8");
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
const familyOf = (face: string) => /font-family:\s*"([^"]+)"/.exec(face)?.[1];
const ruleBody = (selector: string) => new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
const descriptor = (face: string, name: string) =>
  new RegExp(`${name}:\\s*([^;]+);`).exec(face)?.[1]?.replace(/\s+/g, " ").trim();

/**
 * Each family's styles and weights ("style weight") and every subset Google Fonts serves for it, in its order (a later
 * rule wins where ranges overlap), as `next/font/google` served them before the files were committed. Dropping a
 * subset sends that script to the fallback; dropping a weight or style makes the browser synthesise it.
 */
const FAMILIES: Record<string, { variants: string[]; subsets: string[] }> = {
  "IBM Plex Sans": {
    variants: ["normal 400", "normal 500", "normal 600", "normal 700"],
    subsets: ["cyrillic-ext", "cyrillic", "greek", "vietnamese", "latin-ext", "latin"],
  },
  Fraunces: { variants: ["normal 100 900"], subsets: ["vietnamese", "latin-ext", "latin"] },
  "DM Sans": { variants: ["normal 100 1000"], subsets: ["latin-ext", "latin"] },
  Archivo: { variants: ["normal 100 900"], subsets: ["vietnamese", "latin-ext", "latin"] },
  Fredoka: { variants: ["normal 300 700"], subsets: ["hebrew", "latin-ext", "latin"] },
  Nunito: {
    variants: ["normal 200 1000"],
    subsets: ["cyrillic-ext", "cyrillic", "vietnamese", "latin-ext", "latin"],
  },
  "Instrument Serif": { variants: ["italic 400", "normal 400"], subsets: ["latin-ext", "latin"] },
  "Instrument Sans": { variants: ["normal 400 700"], subsets: ["latin-ext", "latin"] },
  Geist: {
    variants: ["normal 100 900"],
    subsets: ["cyrillic-ext", "cyrillic", "vietnamese", "latin-ext", "latin"],
  },
};

/**
 * Google Fonts' unicode-range for each subset (the same for every family). If Google changes one, refresh every family
 * that has the subset along with this table, so the families keep serving the same ranges.
 */
const UNICODE_RANGES: Record<string, string> = {
  "cyrillic-ext": "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
  cyrillic: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
  greek: "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF",
  hebrew: "U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F",
  vietnamese:
    "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, " +
    "U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
  "latin-ext":
    "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, " +
    "U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
  latin:
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, " +
    "U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
};

/**
 * The web-font faces (not the local fallbacks), with the subset their file is named after: `font-files/<family>/
 * <family>[-italic]-<subset>.woff2`. A file named or placed otherwise keeps its path as its "subset", which fails.
 */
const webFaces = faces.flatMap((face) => {
  const file = /url\("\.\/(font-files\/[^"]+)"\)/.exec(face)?.[1];
  const family = familyOf(face);
  if (!file || !family) return [];
  const slug = family.toLowerCase().replaceAll(" ", "-");
  const style = descriptor(face, "font-style");
  const prefix = `font-files/${slug}/${slug}-${style === "italic" ? "italic-" : ""}`;
  const subset = file.startsWith(prefix) && file.endsWith(".woff2") ? file.slice(prefix.length, -6) : file;
  return [{ face, family, variant: `${style} ${descriptor(face, "font-weight")}`, subset }];
});

describe("site-theme fonts", () => {
  it.each(SITE_THEME_KEYS)(
    "the %s class defines its theme's font variables as family then fallback",
    (key) => {
      const body = ruleBody(key);
      expect(body, `.${key} in fonts.module.css`).toBeDefined();
      const { heading, body: bodyVar } = SITE_THEMES[key].fonts;
      for (const variable of new Set([heading, bodyVar])) {
        const value = new RegExp(`${variable}:\\s*"([^"]+)", "([^"]+)";`).exec(body ?? "");
        expect(value, `${variable} in .${key}`).not.toBeNull();
        const [, family, fallback] = value ?? [];
        expect(fallback).toBe(`${family ?? ""} Fallback`);
        expect(faces.some((face) => familyOf(face) === family && face.includes("url("))).toBe(true);
        expect(faces.some((face) => familyOf(face) === fallback && face.includes("src: local("))).toBe(true);
      }
    },
  );

  it("serves only committed files, each family's with its licence beside it", () => {
    const files = [...css.matchAll(/url\("\.\/([^"]+)"\)/g)].map((m) => m[1] ?? "");
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(existsSync(path.join(import.meta.dirname, file)), file).toBe(true);
      expect(
        existsSync(path.join(import.meta.dirname, path.dirname(file), "OFL.txt")),
        `${file} licence`,
      ).toBe(true);
    }
    expect(css).not.toMatch(/fonts\.(googleapis|gstatic)\.com\/s\//);
    const committed = readdirSync(path.join(import.meta.dirname, "font-files"), {
      recursive: true,
      encoding: "utf8",
    })
      .filter((file) => !file.endsWith("OFL.txt") && path.extname(file) !== "")
      .map((file) => `font-files/${file.split(path.sep).join("/")}`);
    expect(new Set(files)).toEqual(new Set(committed));
  });

  it.each(Object.entries(FAMILIES))(
    "serves every weight, style and subset Google serves for %s, in its order",
    (family, { variants, subsets }) => {
      const own = webFaces.filter((face) => face.family === family);
      expect(new Set(own.map((face) => face.variant))).toEqual(new Set(variants));
      for (const variant of variants) {
        expect(
          own.filter((face) => face.variant === variant).map((face) => face.subset),
          `${family} ${variant}`,
        ).toEqual(subsets);
      }
    },
  );

  it("gives each face its subset's unicode-range, and has a subset list for every family", () => {
    expect(new Set(webFaces.map((face) => face.family))).toEqual(new Set(Object.keys(FAMILIES)));
    for (const { face, family, subset } of webFaces) {
      expect(descriptor(face, "unicode-range"), `${family} ${subset}`).toBe(UNICODE_RANGES[subset]);
      expect(descriptor(face, "font-display"), `${family} ${subset}`).toBe("swap");
    }
  });
});

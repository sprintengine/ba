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
 * Every subset Google Fonts serves for each family, in its order (a later rule wins where ranges overlap), as
 * `next/font/google` served them before the files were committed. Dropping one sends that script to the fallback.
 */
const SUBSETS: Record<string, string[]> = {
  "IBM Plex Sans": ["cyrillic-ext", "cyrillic", "greek", "vietnamese", "latin-ext", "latin"],
  Fraunces: ["vietnamese", "latin-ext", "latin"],
  "DM Sans": ["latin-ext", "latin"],
  Archivo: ["vietnamese", "latin-ext", "latin"],
  Fredoka: ["hebrew", "latin-ext", "latin"],
  Nunito: ["cyrillic-ext", "cyrillic", "vietnamese", "latin-ext", "latin"],
  "Instrument Serif": ["latin-ext", "latin"],
  "Instrument Sans": ["latin-ext", "latin"],
  Geist: ["cyrillic-ext", "cyrillic", "vietnamese", "latin-ext", "latin"],
};

/** Google Fonts' unicode-range for each subset (the same for every family). */
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

/** The web-font faces (not the local fallbacks), with the subset their file is named after. */
const webFaces = faces.flatMap((face) => {
  const file = /url\("\.\/font-files\/[^/]+\/([^"]+)\.woff2"\)/.exec(face)?.[1];
  const family = familyOf(face);
  if (!file || !family) return [];
  const prefix = `${family.toLowerCase().replaceAll(" ", "-")}-${descriptor(face, "font-style") === "italic" ? "italic-" : ""}`;
  const variant = ["font-style", "font-weight", "font-stretch"]
    .map((name) => descriptor(face, name))
    .join(" ");
  return [{ face, family, variant, subset: file.startsWith(prefix) ? file.slice(prefix.length) : file }];
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
      .filter((file) => file.endsWith(".woff2"))
      .map((file) => `font-files/${file.split(path.sep).join("/")}`);
    expect(new Set(files)).toEqual(new Set(committed));
  });

  it.each(Object.entries(SUBSETS))(
    "serves every subset Google serves for %s, in its order",
    (family, subsets) => {
      const own = webFaces.filter((face) => face.family === family);
      const variants = [...new Set(own.map((face) => face.variant))];
      expect(variants.length).toBeGreaterThan(0);
      for (const variant of variants) {
        expect(
          own.filter((face) => face.variant === variant).map((face) => face.subset),
          `${family} ${variant}`,
        ).toEqual(subsets);
      }
    },
  );

  it("gives each face its subset's unicode-range, and has a subset list for every family", () => {
    expect(new Set(webFaces.map((face) => face.family))).toEqual(new Set(Object.keys(SUBSETS)));
    for (const { face, family, subset } of webFaces) {
      expect(descriptor(face, "unicode-range"), `${family} ${subset}`).toBe(UNICODE_RANGES[subset]);
      expect(descriptor(face, "font-display"), `${family} ${subset}`).toBe("swap");
    }
  });
});

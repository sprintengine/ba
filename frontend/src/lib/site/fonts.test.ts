import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_THEME_KEYS, SITE_THEMES } from "./themes";

// Tests don't process CSS (any class name "exists"), so these read the stylesheet itself.
const css = readFileSync(path.join(import.meta.dirname, "fonts.module.css"), "utf8");
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
const familyOf = (face: string) => /font-family:\s*"([^"]+)"/.exec(face)?.[1];
const ruleBody = (selector: string) => new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`).exec(css)?.[1];

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
  });
});

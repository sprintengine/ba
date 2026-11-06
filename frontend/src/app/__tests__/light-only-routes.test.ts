import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isLightOnlyPath } from "@/lib/theme/light-only-routes";

const MARKETING = path.resolve(import.meta.dirname, "..", "(marketing)");

describe("the light-only website", () => {
  it("covers every section of the marketing route group", () => {
    const sections = readdirSync(MARKETING, { withFileTypes: true }).filter((e) => e.isDirectory());
    expect(sections.length).toBeGreaterThan(0);
    for (const { name } of sections) expect(isLightOnlyPath(`/${name}`), name).toBe(true);
  });

  it("covers the home page and deep links", () => {
    for (const p of [
      "/",
      "/pricing",
      "/for/physio",
      "/help/ai-assistant",
      "/legal/terms",
      "/explore/dublin",
    ]) {
      expect(isLightOnlyPath(p), p).toBe(true);
    }
  });

  it("leaves the app and booking pages to the visitor's theme", () => {
    for (const p of [
      "/dashboard/lumen-physio",
      "/sign-in",
      "/my/bookings",
      "/lumen-physio",
      "/formula-one",
    ]) {
      expect(isLightOnlyPath(p), p).toBe(false);
    }
  });
});

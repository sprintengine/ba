import { expect, test, type Page } from "@playwright/test";
import { requireLiveBackend } from "./dashboard-helpers";
import { LIGHT_ONLY_PAGES, MAIN_PAGES, openMainPage } from "./main-pages";

/**
 * Page-wide smoke checks on the main pages: nothing scrolls sideways on a phone, dark mode (following the OS) gives a
 * dark page without errors, and the website stays light. Uses the demo seed, read-only.
 */
test.beforeEach(async ({ page }, testInfo) => {
  await requireLiveBackend(page, testInfo);
});

/** Uncaught page errors while [run] runs. */
async function pageErrors(page: Page, run: () => Promise<void>): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await run();
  return errors;
}

/** Relative luminance (0 black – 1 white) of a CSS colour like `rgb(…)`, `oklch(…)` resolved by the browser. */
async function backgroundLuminance(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = Array.from(ctx.getImageData(0, 0, 1, 1).data).map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  });
}

for (const main of MAIN_PAGES) {
  test(`${main.name} does not scroll sideways on a phone`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone layout");
    await openMainPage(page, main);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${main.path} is ${overflow}px wider than the screen`).toBeLessThanOrEqual(0);
  });

  test(`${main.name} on a dark OS`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const errors = await pageErrors(page, () => openMainPage(page, main));
    if (LIGHT_ONLY_PAGES.includes(main)) {
      await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
      expect(await backgroundLuminance(page)).toBeGreaterThan(0.9);
    } else {
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      expect(await backgroundLuminance(page)).toBeLessThan(0.1);
    }
    expect(errors).toEqual([]);
  });
}

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { requireLiveBackend } from "./dashboard-helpers";
import { MAIN_PAGES, openMainPage } from "./main-pages";

/**
 * An axe scan (WCAG 2.1 A and AA) of the main public and dashboard pages, in light and dark mode, on desktop and
 * phone. Any violation fails with the rule, the impact and the offending elements.
 */
test.beforeEach(async ({ page }, testInfo) => {
  await requireLiveBackend(page, testInfo);
});

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Next's dev-only overlay and the toast region are not part of the page.
    .exclude("nextjs-portal")
    .analyze();
  return results.violations.map(
    (v) =>
      `${v.id} (${v.impact ?? "?"}): ${v.help}\n` +
      v.nodes
        .slice(0, 5)
        .map((n) => `    ${n.target.join(" ")} ${n.failureSummary?.split("\n").slice(1, 2).join(" ") ?? ""}`)
        .join("\n"),
  );
}

for (const scheme of ["light", "dark"] as const) {
  for (const main of MAIN_PAGES) {
    test(`${main.name} has no accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await openMainPage(page, main);
      expect(await violations(page), `${main.path} in ${scheme} mode`).toEqual([]);
    });
  }
}

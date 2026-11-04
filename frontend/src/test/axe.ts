/**
 * Accessibility assertions with axe-core (vitest-axe). `await expectNoAxeViolations(container)` fails listing every
 * violation: rule, impact, help, and each offending node with axe's summary of what to fix.
 *
 * Rules that cannot work in jsdom are off: `color-contrast` (no layout or computed colours) and `region` (components
 * are rendered in isolation, outside the shell's landmarks). Pass `document.body` to include Radix portals (dialogs,
 * popovers, menus), which render outside the test's container.
 */
import type { Result, RunOptions } from "axe-core";
import { configureAxe } from "vitest-axe";

const JSDOM_IRRELEVANT_RULES = ["color-contrast", "region"] as const;

const runAxe = configureAxe({
  rules: Object.fromEntries(JSDOM_IRRELEVANT_RULES.map((id) => [id, { enabled: false }])),
});

function describeViolation(violation: Result): string {
  const nodes = violation.nodes.map((node) => {
    const summary = (node.failureSummary ?? "").replace(/\n/g, "\n    ");
    return `  at ${node.target.join(" ")}\n    ${summary}`;
  });
  return [`${violation.id} (${violation.impact ?? "unknown"}): ${violation.help}`, ...nodes].join("\n");
}

/** Runs axe over [container] and fails listing each violation. [options] are axe run options (e.g. more rules off). */
export async function expectNoAxeViolations(container: Element, options?: RunOptions): Promise<void> {
  const results = await runAxe(container, options);
  const report = results.violations.map(describeViolation).join("\n\n");
  expect(results.violations.length, `axe found accessibility violations:\n\n${report}\n\n`).toBe(0);
}

import { expect, test } from "@playwright/test";
import { requireLiveBackend } from "./dashboard-helpers";
import { backToEditing, createSiteBusiness, openEditor, preview, publicTheme, publish } from "./site-helpers";

/**
 * Site builder against a live stack (Next + Ktor with the demo seed, no AI key, so AI requests
 * use the deterministic designer). Each test works on its own throwaway business.
 */
test.beforeEach(async ({ page }, testInfo) => {
  // Business websites are off by default (SITES_ENABLED): run these against a stack with them on, E2E_SITES=1.
  test.skip(
    process.env.E2E_SITES !== "1",
    "business websites are off (SITES_ENABLED); set E2E_SITES=1 to run",
  );
  test.setTimeout(90_000);
  await requireLiveBackend(page, testInfo);
});

test("owner changes the theme, publishes, and the public site follows", async ({
  page,
  request,
  isMobile,
}) => {
  const { slug, owner } = await createSiteBusiness(request);

  // Before anything is published the public page already has a site: the default design.
  await page.goto(`/${slug}`);
  await expect(publicTheme(page)).toHaveAttribute("data-theme", "calm");

  await openEditor(page, slug, owner);
  await page.getByRole("radio", { name: /^Editorial/ }).click();
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await expect((await preview(page, isMobile)).locator("[data-theme]").first()).toHaveAttribute(
    "data-theme",
    "editorial",
  );
  await backToEditing(page, isMobile);
  await publish(page);

  await page.goto(`/${slug}`);
  await expect(publicTheme(page)).toHaveAttribute("data-theme", "editorial");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // And again: publishing replaces what visitors see.
  await openEditor(page, slug, owner);
  await page.getByRole("radio", { name: /^Bold/ }).click();
  await publish(page);
  await page.goto(`/${slug}`);
  await expect(publicTheme(page)).toHaveAttribute("data-theme", "bold");
  // The booking flow shares the theme. (The header's Book link on wide screens, the Book bar on phones.)
  await page.locator(`a[href="/${slug}/book"]`).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/book`));
  await expect(publicTheme(page)).toHaveAttribute("data-theme", "bold");
});

test("AI generate (built-in designer) → preview → publish", async ({ page, request, isMobile }) => {
  const { slug, owner } = await createSiteBusiness(request);
  await openEditor(page, slug, owner, "ai");
  await expect(page.getByText("AI site builder")).toBeVisible();
  await page
    .getByRole("textbox", { name: /What should it feel like/ })
    .fill("Playful and colourful, for kids");
  await page.getByRole("button", { name: "Generate site" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Generate", exact: true }).click();

  const review = page.getByRole("region", { name: "AI changes" });
  await expect(review).toBeVisible({ timeout: 30_000 });
  await expect(review.getByText(/Theme: .* → Playful/)).toBeVisible();
  await review.getByRole("button", { name: "Keep" }).click();

  const frame = await preview(page, isMobile);
  await expect(frame.locator("[data-theme]").first()).toHaveAttribute("data-theme", "playful");
  await backToEditing(page, isMobile);
  await publish(page);

  await page.goto(`/${slug}`);
  await expect(publicTheme(page)).toHaveAttribute("data-theme", "playful");
});

test("edit a section, undo an AI change and restore an older version", async ({
  page,
  request,
  isMobile,
}) => {
  const { slug, owner } = await createSiteBusiness(request);
  await openEditor(page, slug, owner, "sections");

  // Two saved edits of the hero headline: versions 1 and 2.
  await page.getByRole("button", { name: /^Hero(?! options)/, expanded: false }).click();
  const setHeadline = async (text: string) => {
    await page.getByRole("textbox", { name: /^Headline/ }).fill(text);
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  };
  await setHeadline("First headline for testing");
  await setHeadline("Second headline for testing");
  await expect((await preview(page, isMobile)).getByRole("heading", { level: 1 })).toHaveText(
    "Second headline for testing",
  );
  await backToEditing(page, isMobile);

  // An AI change, undone.
  await page.getByRole("tab", { name: "AI" }).click();
  await page.getByRole("button", { name: "Use the bold theme" }).click();
  const review = page.getByRole("region", { name: "AI changes" });
  await expect(review.getByText(/Theme: Calm → Bold/)).toBeVisible({ timeout: 30_000 });
  await review.getByRole("button", { name: "Undo" }).click();
  await expect(review).toHaveCount(0);
  const frame = await preview(page, isMobile);
  await expect(frame.locator("[data-theme]").first()).toHaveAttribute("data-theme", "calm");
  await expect(frame.getByRole("heading", { level: 1 })).toHaveText("Second headline for testing");
  await backToEditing(page, isMobile);

  // Restore version 1: the first headline comes back.
  await page.getByRole("tab", { name: "History" }).click();
  const versions = page.getByRole("list", { name: "Versions" });
  await versions.getByRole("button", { name: "Restore version 1" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Restore", exact: true }).click();
  await expect(versions.getByRole("listitem").first()).toContainText("Restored");
  await expect((await preview(page, isMobile)).getByRole("heading", { level: 1 })).toHaveText(
    "First headline for testing",
  );
});

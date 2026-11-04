import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { authHeader, signInAs } from "./dashboard-helpers";

export type Identity = { sub: string; email: string; name: string };

/**
 * A throwaway business (from the physio template) owned by a fresh dev user, so site tests never
 * change the demo businesses. Names are obviously fictional.
 */
export async function createSiteBusiness(
  request: APIRequestContext,
): Promise<{ slug: string; id: string; owner: Identity }> {
  const rand = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const owner: Identity = {
    sub: `dev_e2e_site_${rand}`,
    email: `e2e-site-${rand}@bookanything.test`,
    name: "Site Tester",
  };
  const setup = await (await request.get("/api/v1/public/templates/physio")).json();
  const slug = `e2e-site-${rand}`;
  const res = await request.post("/api/v1/businesses", {
    headers: authHeader(owner),
    data: { ...setup, name: `Testbed Studio ${rand.slice(-4).toUpperCase()}`, slug },
  });
  expect(res.status(), await res.text()).toBe(201);
  const business = await res.json();
  return { slug, id: business.id, owner };
}

/** Signs in as the owner and opens the site editor on a tab. */
export async function openEditor(
  page: Page,
  slug: string,
  owner: Identity,
  tab: "design" | "sections" | "ai" | "history" = "design",
) {
  await signInAs(page, owner);
  await page.goto(`/dashboard/${slug}/site?tab=${tab}`);
  await expect(page.getByRole("heading", { name: "Site", exact: true })).toBeVisible({ timeout: 30_000 });
}

/** The live preview (on phones the editor shows either the controls or the preview). */
export async function preview(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("radio", { name: "Preview", exact: true }).click();
  return page.getByTestId("site-preview");
}

export async function backToEditing(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("radio", { name: "Edit", exact: true }).click();
}

export async function publish(page: Page) {
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible({ timeout: 20_000 });
}

/** The public site's theme scope. */
export const publicTheme = (page: Page) => page.locator("[data-theme]").first();

/** A valid 1×1 PNG. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

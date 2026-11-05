import { expect, type Page } from "@playwright/test";
import { CUSTOMER, OWNER, signInAs } from "./dashboard-helpers";

/**
 * The main pages, as the people who see them, for page-wide checks (layout on phones, dark mode, accessibility).
 * Read-only: opening them changes nothing in the demo data.
 */
export type MainPage = {
  name: string;
  path: string;
  as?: typeof OWNER;
  ready: (page: Page) => Promise<void>;
};

const SLUG = "lumen-physio";
const heading = (name: string | RegExp) => async (page: Page) => {
  await expect(page.getByRole("heading", { name, level: 1 }).first()).toBeVisible({ timeout: 20_000 });
};
const dashboard = (name: string, sub: string, title: string | RegExp): MainPage => ({
  name: `dashboard ${name}`,
  path: `/dashboard/${SLUG}${sub}`,
  as: OWNER,
  ready: heading(title),
});

/** The website: light only, whatever the OS or the visitor's choice in the app. */
export const LIGHT_ONLY_PAGES: MainPage[] = [
  { name: "marketing home", path: "/", ready: heading(/./) },
  { name: "pricing", path: "/pricing", ready: heading(/./) },
  { name: "explore", path: "/explore", ready: heading(/./) },
];

export const PUBLIC_PAGES: MainPage[] = [
  ...LIGHT_ONLY_PAGES,
  { name: "sign in", path: "/sign-in", ready: heading(/./) },
  {
    name: "booking flow",
    path: `/${SLUG}/book`,
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Choose a service" })).toBeVisible({ timeout: 20_000 });
    },
  },
];

export const SIGNED_IN_PAGES: MainPage[] = [
  dashboard("overview", "", /^Good (morning|afternoon|evening)/),
  dashboard("bookings", "/bookings", /Bookings|Appointments/),
  {
    ...dashboard("calendar", "/calendar", /Calendar/),
    ready: async (page) => {
      await expect(page.getByRole("radiogroup", { name: "Calendar view" })).toBeVisible({ timeout: 20_000 });
    },
  },
  dashboard("customers", "/customers", /Customers|Patients|Clients/),
  dashboard("services", "/services", /Services/),
  dashboard("team", "/team", /Team/),
  dashboard("settings", "/settings/general", /Settings|General/),
  dashboard("release schedules", "/settings/release-schedules", /Settings/),
  {
    name: "my bookings",
    path: "/my/bookings",
    as: CUSTOMER,
    ready: async (page) => {
      await expect(page.getByRole("tablist", { name: "Bookings" })).toBeVisible({ timeout: 20_000 });
    },
  },
];

export const MAIN_PAGES = [...PUBLIC_PAGES, ...SIGNED_IN_PAGES];

/** Signs in as the page's viewer (if any), opens it and waits until its content is there. */
export async function openMainPage(page: Page, main: MainPage) {
  if (main.as) await signInAs(page, main.as);
  await page.goto(main.path);
  await main.ready(page);
}

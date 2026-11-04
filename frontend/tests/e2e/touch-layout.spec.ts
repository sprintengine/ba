import { expect, test, type Page } from "@playwright/test";
import { CUSTOMER, OWNER, requireLiveBackend, signInAs } from "./dashboard-helpers";
import { MAIN_PAGES, type MainPage } from "./main-pages";

/**
 * Touch layout guard: every dashboard page, every page in `main-pages.ts` and more public and customer pages, on a
 * phone and an iPad (touch, mobile emulation), must not scroll sideways, must not clip the label of a button, link or tab (no "Resched…"),
 * and must give every control a touch target of at least 40×40 px. Overlays the owner uses all day (the nav sheet,
 * ⌘K, the booking drawer, the new-booking sheet, Bo) get the same checks. Uses the demo seed, read-only.
 *
 * Runs once, in the `mobile` project (each block sets its own device). Dev hooks: TOUCH_SHOTS_DIR saves a
 * screenshot per check; TOUCH_ALL_VIEWPORTS=1 sweeps every viewport in the phone and iPad brief.
 *
 * Exempt from the size rule (documented, deliberate; see EXEMPT):
 *  - links inside running text (WCAG 2.5.8's inline exception);
 *  - bookings on the calendar grid (`[data-event]`): their height is their duration (a 15-minute booking is 16px);
 *    the same booking is a full-size row in the bookings list and in the overview's day list;
 *  - controls inside `[data-touch-exempt]` (none today; say why where you add one).
 * A truncated label inside a control with more than one line of text (a row: name over email) is data, not a
 * label, and is allowed to ellipsize.
 *
 * PENDING lists pages whose phone pass runs separately and what is still open on them: those findings are reported as
 * annotations, not failures, until that work lands. None today: the marketing chrome (the pill nav, its menu and the
 * footer) and the landing page pass too. Clipped labels fail everywhere. Drop an entry once it passes.
 */

const EXEMPT = "[data-event], [data-touch-exempt]";
type Finding = "size" | "overflow";
const PENDING: Partial<Record<string, readonly Finding[]>> = {};

type Device = {
  name: string;
  viewport: { width: number; height: number };
  touch: boolean;
};

const PHONE: Device = { name: "phone", viewport: { width: 390, height: 844 }, touch: true };
const IPAD: Device = { name: "ipad", viewport: { width: 744, height: 1133 }, touch: true };
const ALL_DEVICES: Device[] = [
  PHONE,
  { name: "phone-small", viewport: { width: 360, height: 780 }, touch: true },
  { name: "phone-large", viewport: { width: 430, height: 932 }, touch: true },
  IPAD,
  { name: "ipad-air", viewport: { width: 820, height: 1180 }, touch: true },
  { name: "ipad-landscape", viewport: { width: 1180, height: 820 }, touch: true },
  { name: "ipad-pro", viewport: { width: 1024, height: 1366 }, touch: true },
  { name: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
];
const DEVICES = process.env.TOUCH_ALL_VIEWPORTS ? ALL_DEVICES : [PHONE, IPAD];
const SHOTS = process.env.TOUCH_SHOTS_DIR;

const SLUG = "lumen-physio";
const DASH = `/dashboard/${SLUG}`;
const h1 = (name: RegExp) => async (page: Page) => {
  await expect(page.getByRole("heading", { name, level: 1 }).first()).toBeVisible({ timeout: 20_000 });
};
const dash = (name: string, sub: string, title: RegExp): MainPage => ({
  name: `dashboard ${name}`,
  path: `${DASH}${sub}`,
  as: OWNER,
  ready: h1(title),
});

/** Dashboard pages beyond the main pages (which already hold overview, bookings, calendar, customers, services…). */
const MORE_DASHBOARD_PAGES: MainPage[] = [
  {
    ...dash("calendar week", "/calendar?view=week", /Calendar/),
    ready: async (page) => {
      await expect(page.getByRole("radiogroup", { name: "Calendar view" })).toBeVisible({ timeout: 20_000 });
    },
  },
  dash("offers", "/offers", /Offers|Deals/),
  dash("resources", "/resources", /./),
  dash("reports", "/reports", /Reports/),
  dash("settings branding", "/settings/branding", /Settings|Branding/),
  dash("settings policies", "/settings/policies", /Settings|policies/i),
  dash("settings groups", "/settings/customer-groups", /Settings|groups/i),
  dash("settings questions", "/settings/questions", /Settings|Questions/),
  dash("settings marketplace", "/settings/marketplace", /Settings|Marketplace/),
  dash("settings payments", "/settings/payments", /Settings|Payments/),
  dash("settings billing", "/settings/billing", /Settings|Billing/),
];

/** Public and customer pages beyond the main pages: the other portal styles, a second booking flow, onboarding. */
const MORE_PUBLIC_PAGES: MainPage[] = [
  { name: "booking page bold", path: "/gleam-car-wash", ready: h1(/./) },
  { name: "booking page playful", path: "/cadence-music", ready: h1(/./) },
  { name: "booking page clinical", path: "/meadowbrook-practice", ready: h1(/./) },
  {
    name: "booking flow car wash",
    path: "/gleam-car-wash/book",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Choose a service" })).toBeVisible({ timeout: 20_000 });
    },
  },
  { name: "connected apps", path: "/my/connected-apps", as: CUSTOMER, ready: h1(/Connected apps/) },
  {
    name: "onboarding",
    path: "/onboarding",
    // Someone without a business (onboarding changes nothing until they create one).
    as: { sub: "dev_e2e_touch_onboarding", email: "touch-onboarding@example.test", name: "Touch Tester" },
    ready: h1(/set up your/i),
  },
];

const PAGES = [...MAIN_PAGES, ...MORE_PUBLIC_PAGES, ...MORE_DASHBOARD_PAGES];

/** An interaction that opens an overlay; the checks then run inside `root` (default: the open dialog, if any). */
type Overlay = { name: string; path: string; root?: string; open: (page: Page) => Promise<void> };

const firstRowLink = (page: Page) => page.locator("main a[href*='/customers/']").first();

const OVERLAYS: Overlay[] = [
  {
    name: "navigation",
    path: DASH,
    open: async (page) => {
      // Phones: the tab bar's "More"; iPad portrait: the rail's expand control. The full sidebar has no overlay.
      await expect(
        page.getByRole("navigation", { name: /Dashboard|Quick navigation/ }).first(),
      ).toBeVisible();
      const more = page.getByRole("button", { name: "More" });
      test.skip(await page.getByRole("button", { name: "Collapse sidebar" }).isVisible(), "full sidebar");
      if (await more.isVisible()) await more.click();
      else await page.getByRole("button", { name: "Expand sidebar" }).click();
      await expect(page.getByRole("dialog").getByRole("link", { name: "Settings" })).toBeVisible();
    },
  },
  {
    name: "command menu",
    path: DASH,
    open: async (page) => {
      await page.getByRole("button", { name: "Search" }).first().click();
      await expect(page.getByRole("dialog").getByRole("combobox")).toBeVisible();
    },
  },
  {
    name: "new booking",
    path: `${DASH}/bookings?new=1`,
    open: async (page) => {
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 20_000 });
    },
  },
  {
    name: "booking detail",
    path: `${DASH}/bookings`,
    open: async (page) => {
      await page.locator("main [data-booking-row]:visible").first().click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("dialog").getByRole("heading").first()).toBeVisible();
    },
  },
  {
    name: "customer detail",
    path: `${DASH}/customers`,
    open: async (page) => {
      await firstRowLink(page).click();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
    },
  },
  {
    name: "assistant",
    path: DASH,
    open: async (page) => {
      await page.getByRole("button", { name: /^Open Bo/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 20_000 });
    },
  },
  {
    name: "account menu",
    path: DASH,
    root: "[role=menu]",
    open: async (page) => {
      await page
        .getByRole("button", { name: /Account menu|Avery Morgan/ })
        .first()
        .click();
      await expect(page.getByRole("menu")).toBeVisible();
    },
  },
  {
    name: "business switcher",
    path: DASH,
    root: "[role=menu]",
    open: async (page) => {
      await page
        .getByRole("button", { name: /Lumen Physiotherapy/ })
        .first()
        .click();
      await expect(page.getByRole("menu")).toBeVisible();
    },
  },
  {
    name: "date picker",
    path: `${DASH}/bookings?range=custom`,
    open: async (page) => {
      await page.getByRole("button", { name: "From" }).click();
      await expect(page.getByRole("grid")).toBeVisible();
    },
  },
  {
    name: "service editor",
    path: `${DASH}/services`,
    open: async (page) => {
      await page
        .getByRole("button", { name: /^Edit / })
        .first()
        .click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 20_000 });
    },
  },
  {
    name: "resource editor",
    path: `${DASH}/resources`,
    open: async (page) => {
      await page.getByRole("button", { name: /^Add / }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 20_000 });
    },
  },
  {
    name: "team invite",
    path: `${DASH}/team`,
    open: async (page) => {
      await page.getByRole("button", { name: "Invite" }).click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 20_000 });
    },
  },
];

type Problems = { overflow: number; clipped: string[]; small: string[] };

/** Runs in the page: sideways overflow, clipped control labels and small touch targets under `rootSelector`. */
function auditInPage({
  rootSelector,
  touch,
  exempt,
  width,
}: {
  rootSelector: string | null;
  touch: boolean;
  exempt: string;
  /** The device width. Not `innerWidth`: mobile emulation widens the layout viewport to fit content that overflows. */
  width: number;
}): Problems {
  const MIN = 40;
  const roots = rootSelector ? Array.from(document.querySelectorAll(rootSelector)) : [document.body];
  const controls = new Set<HTMLElement>();
  const selector = [
    "button",
    "a[href]",
    "summary",
    "select",
    "textarea",
    "input:not([type=hidden])",
    "[role=button]",
    "[role=tab]",
    "[role=radio]",
    "[role=checkbox]",
    "[role=switch]",
    "[role=combobox]",
    "[role=menuitem]",
    "[role=menuitemradio]",
    "[role=option]",
  ].join(",");
  for (const root of roots) root.querySelectorAll<HTMLElement>(selector).forEach((el) => controls.add(el));

  const visible = (el: HTMLElement) => {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    if (el.closest("[aria-hidden=true], [inert], nextjs-portal")) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const describe = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const name = (el.getAttribute("aria-label") ?? el.textContent).replace(/\s+/g, " ").trim().slice(0, 40);
    return `<${el.tagName.toLowerCase()}${el.getAttribute("role") ? ` role=${el.getAttribute("role")}` : ""}> "${name}" ${Math.round(r.width)}×${Math.round(r.height)}`;
  };
  /** Text for screen readers only (`sr-only`, or a label collapsed to it on a narrow screen): not on screen to clip. */
  const visuallyHidden = (n: HTMLElement) => {
    const r = n.getBoundingClientRect();
    return r.width <= 1 && r.height <= 1;
  };
  /** Elements under `el` (and `el`) that carry their own visible text. */
  const textBlocks = (el: HTMLElement) =>
    [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))].filter(
      (n) =>
        n.checkVisibility() &&
        !visuallyHidden(n) &&
        Array.from(n.childNodes).some((c) => c.nodeType === Node.TEXT_NODE && c.textContent?.trim()),
    );
  const isClipped = (n: HTMLElement) => {
    const s = getComputedStyle(n);
    const clips = s.overflowX === "hidden" || s.overflowX === "clip" || s.textOverflow === "ellipsis";
    return clips && n.scrollWidth > n.clientWidth + 1;
  };

  /** The control's box (or its wrapping label's) is at least MIN×MIN. */
  const fits = (el: HTMLElement, label: HTMLElement | null) => {
    const r = el.getBoundingClientRect();
    const lr = label?.getBoundingClientRect();
    return Math.max(r.width, lr?.width ?? 0) >= MIN - 0.5 && Math.max(r.height, lr?.height ?? 0) >= MIN - 0.5;
  };
  /** A smaller control may still take a MIN×MIN tap around its centre (an invisible hit area, `touchHitArea`). */
  const hitArea = (el: HTMLElement, label: HTMLElement | null) => {
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = MIN / 2 - 1;
    return [
      [cx, cy],
      [cx - d, cy - d],
      [cx + d, cy - d],
      [cx - d, cy + d],
      [cx + d, cy + d],
    ].every(([x, y]) => {
      const hit = document.elementFromPoint(x!, y!);
      return !!hit && (el.contains(hit) || !!label?.contains(hit));
    });
  };

  const clipped: string[] = [];
  const small: string[] = [];
  for (const el of controls) {
    if (!visible(el)) continue;
    const blocks = textBlocks(el);
    // A row (name over email, time over service) may ellipsize its data; a label may not.
    if (blocks.length === 1 && blocks.some(isClipped)) clipped.push(describe(el));
    else if (blocks.length === 1 && isClipped(el) && el.matches("button, [role=tab], [role=radio]")) {
      clipped.push(describe(el));
    }

    if (!touch) continue;
    if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") continue;
    if (el.closest(exempt)) continue;
    if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
    const label = el.closest("label");
    if (!fits(el, label) && !hitArea(el, label)) small.push(describe(el));
  }
  window.scrollTo(0, 0);
  return {
    overflow: document.documentElement.scrollWidth - width,
    clipped,
    small,
  };
}

async function check(
  page: Page,
  device: Device,
  what: string,
  { rootSelector = null, pending = [] }: { rootSelector?: string | null; pending?: readonly Finding[] } = {},
) {
  // Let entrance animations (sheets, popovers) settle so sizes are final.
  await page.waitForTimeout(400);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${device.name}-${what.replace(/\W+/g, "-")}.png` });
  const problems = await page.evaluate(auditInPage, {
    rootSelector,
    touch: device.touch,
    exempt: EXEMPT,
    width: device.viewport.width,
  });
  const note = (kind: Finding, description: string) =>
    test.info().annotations.push({ type: `pending ${kind}`, description: `${what}: ${description}` });

  if (!pending.includes("overflow")) {
    expect
      .soft(problems.overflow, `${what} is ${problems.overflow}px wider than the screen`)
      .toBeLessThanOrEqual(0);
  } else if (problems.overflow > 0) note("overflow", `${problems.overflow}px wider than the screen`);
  expect.soft(problems.clipped, `${what}: controls whose label is cut off`).toEqual([]);
  if (!pending.includes("size")) {
    expect.soft(problems.small, `${what}: touch targets under 40×40`).toEqual([]);
  } else for (const target of problems.small) note("size", target);
}

for (const device of DEVICES) {
  test.describe(`touch layout on ${device.name} (${device.viewport.width}×${device.viewport.height})`, () => {
    test.use({
      viewport: device.viewport,
      hasTouch: device.touch,
      isMobile: device.touch,
      deviceScaleFactor: 2,
    });

    test.beforeEach(async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "mobile", "runs once, in the mobile project, with its own devices");
      await requireLiveBackend(page, testInfo);
      await page.emulateMedia({ reducedMotion: "reduce" });
    });

    for (const main of PAGES) {
      test(main.name, async ({ page }) => {
        if (main.as) await signInAs(page, main.as);
        await page.goto(main.path);
        await main.ready(page);
        await check(page, device, main.name, { pending: PENDING[main.name] });
      });
    }

    for (const overlay of OVERLAYS) {
      test(`overlay: ${overlay.name}`, async ({ page }) => {
        await signInAs(page, OWNER);
        await page.goto(overlay.path);
        // By CSS, not role: a modal opened on load (the new-booking sheet) hides the page from the accessibility tree.
        await expect(page.locator("main h1").first()).toBeAttached({ timeout: 20_000 });
        await overlay.open(page);
        const inDialog = await page.getByRole("dialog").count();
        await check(page, device, `overlay ${overlay.name}`, {
          rootSelector: overlay.root ?? (inDialog ? "[role=dialog]" : null),
        });
      });
    }
  });
}

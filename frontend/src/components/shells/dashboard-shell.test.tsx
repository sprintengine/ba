import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Membership } from "@/lib/api/types";
import type { AuthUser } from "@/lib/auth/types";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { renderDashboard } from "@/components/dashboard/test/render";
import { DashboardShell } from "./dashboard-shell";

const push = vi.fn();
let pathname = "/dashboard/lumen-physio/calendar";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

const auth = vi.hoisted((): { signOut: Mock<() => Promise<void>>; user: AuthUser | null; mode: "dev" } => ({
  signOut: vi.fn(async () => {}),
  user: { id: "u1", email: "owner@example.test", name: "Avery Morgan", imageUrl: null },
  mode: "dev",
}));
vi.mock("@/lib/auth/context", () => ({ useAuth: () => auth }));
const theme = vi.hoisted(() => ({ theme: "system", setTheme: vi.fn() }));
vi.mock("@/components/common/theme-toggle", () => ({ useThemeChoice: () => theme }));

/** Answers media queries as a screen `width` px wide with a pointer of `pointer` (jsdom has no layout). */
function setScreen(width: number, pointer: "fine" | "coarse" = "fine") {
  vi.stubGlobal("matchMedia", (media: string) => {
    const min = /min-width:\s*(\d+)px/.exec(media);
    const max = /max-width:\s*(\d+)px/.exec(media);
    const asked = /pointer:\s*(fine|coarse)/.exec(media);
    const matches =
      (!min || width >= Number(min[1])) &&
      (!max || width <= Number(max[1])) &&
      (!asked || asked[1] === pointer);
    return { matches, media, addEventListener: () => {}, removeEventListener: () => {} };
  });
}

// ⌘K loads on demand; transforming its modules the first time takes longer than findBy waits, so do it up front.
beforeAll(() => import("./command-menu"), 60_000);

beforeEach(() => {
  setScreen(1440);
  push.mockClear();
  auth.signOut.mockClear();
  theme.setTheme.mockClear();
  pathname = "/dashboard/lumen-physio/calendar";
});
afterEach(() => vi.unstubAllGlobals());

const branding = { primaryColor: "#0e7c70", logoUrl: null, coverImageUrl: null };
const memberships: Membership[] = [
  { businessId: "b1", slug: "lumen-physio", name: "Lumen Physiotherapy", role: "owner", branding },
  { businessId: "b2", slug: "gleam-wash", name: "Gleam Car Wash", role: "staff", branding },
];
const current = { slug: "lumen-physio", name: "Lumen Physiotherapy", branding };

function renderShell(props: Partial<React.ComponentProps<typeof DashboardShell>> = {}) {
  return renderDashboard(
    <DashboardShell business={current} role="owner" memberships={memberships} {...props}>
      {props.children ?? <h1>Page title</h1>}
    </DashboardShell>,
  );
}

/** The desktop sidebar's navigation (the mobile sheet has its own once opened). */
const sidebarNav = () => must(screen.getAllByRole("navigation", { name: "Dashboard" })[0], "sidebar nav");

describe("DashboardShell", () => {
  it("lays out the five rail items in the business vocabulary, marking the current page", async () => {
    const { container } = renderShell();
    const nav = within(sidebarNav());
    expect(nav.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Today",
      "Calendar",
      "Patients",
      "Business",
      "Reports",
    ]);
    expect(nav.getByRole("link", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current");
    expect(nav.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/calendar",
    );
    expect(screen.getByRole("main")).toHaveTextContent("Page title");
    await expectNoAxeViolations(container);
  });

  it("keeps Calendar lit on the bookings list", () => {
    pathname = "/dashboard/lumen-physio/bookings";
    renderShell();
    expect(within(sidebarNav()).getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("gathers the set-up pages under Business, with a strip to move between them", () => {
    pathname = "/dashboard/lumen-physio/resources";
    renderShell();
    const rail = within(sidebarNav());
    expect(rail.getByRole("link", { name: "Business" })).toHaveAttribute("aria-current", "page");
    expect(rail.getByRole("link", { name: "Business" })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/services",
    );
    const strip = within(screen.getByRole("navigation", { name: "Business" }));
    expect(strip.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Services",
      "Offers",
      "Therapists",
      "Settings",
    ]);
    expect(strip.getByRole("link", { name: "Therapists" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "View booking page" })).toHaveAttribute("href", "/lumen-physio");
  });

  it("shows no Business strip on other pages", () => {
    renderShell();
    expect(screen.queryByRole("navigation", { name: "Business" })).not.toBeInTheDocument();
  });

  it("shows the site builder and View site only where business websites are on", () => {
    pathname = "/dashboard/lumen-physio/services";
    renderShell({ business: { ...current, sitesEnabled: true } });
    const strip = within(screen.getByRole("navigation", { name: "Business" }));
    expect(strip.getByRole("link", { name: "Site" })).toHaveAttribute("href", "/dashboard/lumen-physio/site");
    expect(screen.getByRole("link", { name: "View site" })).toHaveAttribute("href", "/lumen-physio");
  });

  it("hides admin pages from staff", () => {
    renderDashboard(
      <DashboardShell business={current} role="staff" memberships={memberships}>
        <p>content</p>
      </DashboardShell>,
      "staff",
    );
    const links = within(sidebarNav())
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(links).not.toContain("Settings");
    expect(links).not.toContain("Reports");
  });

  it("opens and closes the command menu with ⌘K / Ctrl+K and Escape", async () => {
    const user = userEvent.setup();
    renderShell();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.keyboard("{Meta>}k{/Meta}");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("combobox")).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.keyboard("{Control>}K{/Control}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens the command menu from the sidebar's search and the mobile bar", async () => {
    const user = userEvent.setup();
    renderShell();
    const [rail, bar] = screen.getAllByRole("button", { name: "Search" });
    await user.click(must(rail, "rail search"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(must(bar, "top bar search"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("opens the full navigation from the phone tab bar's More, and closes it on navigation", async () => {
    setScreen(390, "coarse");
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole("button", { name: "More" }));
    const sheet = await screen.findByRole("dialog", { name: "Navigation" });
    expect(within(sheet).getByRole("link", { name: "Today" })).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
    await user.click(within(sheet).getByRole("button", { name: /Search…/ }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument());
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // the command menu
    await user.keyboard("{Escape}");

    // The tab bar is back once the palette's field lets go of focus.
    await user.click(await screen.findByRole("button", { name: "More" }));
    await screen.findByRole("dialog", { name: "Navigation" });
    // Navigating changes the path; any re-render of the shell (here ⌘K) then sees it.
    pathname = "/dashboard/lumen-physio/bookings";
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument());
  });

  it("gives phones a tab bar of the most used pages in the business vocabulary, marking the current one", () => {
    setScreen(390, "coarse");
    renderShell();
    const bar = within(screen.getByRole("navigation", { name: "Quick navigation" }));
    expect(bar.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Today",
      "Calendar",
      "Appointments",
      "Patients",
    ]);
    expect(bar.getByRole("link", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
    expect(bar.getByRole("link", { name: "Appointments" })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/bookings",
    );
    expect(bar.getByRole("button", { name: "More" })).toHaveAttribute("aria-expanded", "false");
  });

  it("steps the tab bar aside while a text field has focus on a touch screen", async () => {
    setScreen(390, "coarse");
    renderShell({ children: <input aria-label="Search appointments" /> });
    const bar = screen.getByRole("navigation", { name: "Quick navigation" });
    expect(bar).toBeVisible();
    fireEvent.focusIn(screen.getByRole("textbox", { name: "Search appointments" }));
    screen.getByRole("textbox", { name: "Search appointments" }).focus();
    await waitFor(() => expect(bar).not.toBeVisible());
    screen.getByRole("textbox", { name: "Search appointments" }).blur();
    await waitFor(() => expect(bar).toBeVisible());
  });

  it("keeps the labelled rail on iPad portrait", () => {
    setScreen(820, "coarse");
    renderShell();
    const rail = within(sidebarNav());
    expect(rail.getByRole("link", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
    expect(rail.getAllByRole("link").every((a) => a.textContent !== "")).toBe(true);
  });

  it("switches business from the switcher menu", async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(must(screen.getAllByRole("button", { name: /Lumen Physiotherapy/ })[0], "switcher"));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Gleam Car Wash/ })).toHaveAttribute(
      "href",
      "/dashboard/gleam-wash",
    );
    expect(within(menu).getByRole("menuitem", { name: /Create a business/ })).toHaveAttribute(
      "href",
      "/onboarding",
    );
  });

  it("renders skeleton chrome while the business loads, without a command menu", async () => {
    const user = userEvent.setup();
    renderShell({ business: null });
    expect(within(sidebarNav()).getByRole("link", { name: "Today" })).toHaveAttribute("href", "#");
    await user.keyboard("{Meta>}k{/Meta}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("pins a floating element, with room kept for it at the foot of the rail rather than over the page", () => {
    const { container } = renderShell({ floating: <button type="button">Ask Bo</button> });
    expect(screen.getByRole("button", { name: "Ask Bo" })).toBeInTheDocument();
    expect(container.querySelector("aside")?.className).toMatch(/\bpb-\[calc\(4rem/);
  });
});

describe("UserMenu", () => {
  it("offers my bookings, connected apps, theme and sign out", async () => {
    const user = userEvent.setup();
    renderShell();
    const [avatar] = screen.getAllByRole("button", { name: "Account menu" });
    await user.click(must(avatar));
    const menu = await screen.findByRole("menu");
    expect(menu).toHaveTextContent("Avery Morgan");
    expect(menu).toHaveTextContent("Dev auth");
    expect(within(menu).getByRole("menuitem", { name: /My bookings/ })).toHaveAttribute(
      "href",
      "/my/bookings",
    );
    expect(within(menu).getByRole("menuitem", { name: /Connected apps/ })).toHaveAttribute(
      "href",
      "/my/connected-apps",
    );
    // The theme submenu, by keyboard: → opens it on the first choice.
    within(menu).getByRole("menuitem", { name: /Theme/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("menuitemradio", { name: "Light" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(theme.setTheme).toHaveBeenCalledWith("dark");

    await user.click(must(screen.getAllByRole("button", { name: "Account menu" })[0]));
    await user.click(await screen.findByRole("menuitem", { name: /Sign out/ }));
    expect(auth.signOut).toHaveBeenCalledWith({ redirectUrl: "/" });
  });

  it("is keyboard operable from the rail", async () => {
    const user = userEvent.setup();
    renderShell();
    const row = must(screen.getAllByRole("button", { name: "Account menu" })[0], "rail account");
    row.focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(menu).not.toBeInTheDocument());
    expect(row).toHaveFocus();
  });

  it("renders nothing when signed out", () => {
    const signedIn = auth.user;
    auth.user = null;
    try {
      renderShell();
      expect(screen.queryByRole("button", { name: "Account menu" })).not.toBeInTheDocument();
    } finally {
      auth.user = signedIn;
    }
  });
});

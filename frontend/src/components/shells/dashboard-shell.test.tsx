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
  it("lays out the sidebar navigation in the business vocabulary, marking the current page", async () => {
    const { container } = renderShell();
    const nav = within(sidebarNav());
    expect(nav.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Overview",
      "Calendar",
      "Appointments",
      "Patients",
      "Services",
      "Offers",
      "Therapists",
      "Team",
      "Reports",
      "Settings",
    ]);
    expect(nav.getByRole("link", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(nav.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/calendar",
    );
    expect(screen.getByRole("main")).toHaveTextContent("Page title");
    await expectNoAxeViolations(container);
  });

  it("shows the site builder and View site only where business websites are on", () => {
    renderShell({ business: { ...current, sitesEnabled: true } });
    const nav = within(sidebarNav());
    expect(nav.getByRole("link", { name: "Site" })).toHaveAttribute("href", "/dashboard/lumen-physio/site");
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
    await user.click(screen.getByRole("button", { name: /Search…/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("collapses the sidebar with ⌘\\ and the button, keeping every control named", async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(window.localStorage.getItem("bookanything.sidebarCollapsed")).toBe("1");
    const nav = within(sidebarNav());
    expect(nav.getByRole("link", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
    expect(nav.getAllByRole("link").every((a) => a.textContent === "")).toBe(true);
    expect(screen.getByRole("link", { name: "View booking page" })).toHaveAttribute("href", "/lumen-physio");
    expect(screen.getByRole("button", { name: "Lumen Physiotherapy, switch business" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Account menu" })).toHaveLength(2);
    await expectNoAxeViolations(container);

    fireEvent.keyDown(window, { key: "\\", metaKey: true });
    expect(await screen.findByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
    expect(window.localStorage.getItem("bookanything.sidebarCollapsed")).toBe("0");
  });

  it("restores a collapsed sidebar", async () => {
    window.localStorage.setItem("bookanything.sidebarCollapsed", "1");
    renderShell();
    expect(await screen.findByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });

  it("starts collapsed in a small window with a mouse, and keeps a saved choice", async () => {
    setScreen(1100);
    const first = renderShell();
    expect(await screen.findByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    first.unmount();

    setScreen(1100, "coarse");
    const touch = renderShell();
    expect(await screen.findByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
    touch.unmount();

    setScreen(1100);
    window.localStorage.setItem("bookanything.sidebarCollapsed", "0");
    renderShell();
    expect(await screen.findByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });

  it("opens the full navigation from the phone tab bar's More, and closes it on navigation", async () => {
    setScreen(390, "coarse");
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole("button", { name: "More" }));
    const sheet = await screen.findByRole("dialog", { name: "Navigation" });
    expect(within(sheet).getByRole("link", { name: "Overview" })).toBeInTheDocument();
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
      "Overview",
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

  it("is a named glyph rail on iPad portrait whose expand control lays the labelled navigation over the page", async () => {
    setScreen(820, "coarse");
    const user = userEvent.setup();
    renderShell();
    const rail = within(sidebarNav());
    expect(rail.getByRole("link", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
    expect(rail.getAllByRole("link").every((a) => a.textContent === "")).toBe(true);
    expect(screen.queryByRole("button", { name: "Collapse sidebar" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
    const sheet = await screen.findByRole("dialog", { name: "Navigation" });
    expect(within(sheet).getByRole("link", { name: "Patients" })).toBeInTheDocument();
    // The rail stays a rail (the content keeps its width) and the preference is untouched.
    expect(window.localStorage.getItem("bookanything.sidebarCollapsed")).toBeNull();
    await user.click(within(sheet).getByRole("button", { name: "Close navigation" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument());
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
    expect(within(sidebarNav()).getByRole("link", { name: "Overview" })).toHaveAttribute("href", "#");
    await user.keyboard("{Meta>}k{/Meta}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("pins a floating element, with room kept for it at the foot of the sidebar rather than over the page", () => {
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

  it("is keyboard operable from the sidebar row", async () => {
    const user = userEvent.setup();
    renderShell();
    const row = screen.getByRole("button", { name: /Avery Morgan.*owner@example\.test/ });
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

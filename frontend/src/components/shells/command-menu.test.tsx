import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberRole, Membership } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { renderDashboard } from "@/components/dashboard/test/render";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { CommandMenu, type CommandMenuExtension } from "./command-menu";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
const signOut = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/auth/context", () => ({ useAuth: () => ({ signOut }) }));
const setTheme = vi.hoisted(() => vi.fn());
vi.mock("@/components/common/theme-toggle", () => ({ useThemeChoice: () => ({ setTheme }) }));

beforeEach(() => {
  push.mockClear();
  signOut.mockClear();
  setTheme.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

const branding = { primaryColor: "#0e7c70", logoUrl: null, coverImageUrl: null };
const memberships: Membership[] = [
  { businessId: "b1", slug: "lumen-physio", name: "Lumen Physiotherapy", role: "owner", branding },
  { businessId: "b2", slug: "gleam-wash", name: "Gleam Car Wash", role: "staff", branding },
];

function renderMenu({
  role = "owner",
  extension,
  onOpenChange = vi.fn(),
  sitesEnabled = false,
}: {
  role?: MemberRole;
  extension?: CommandMenuExtension;
  onOpenChange?: (open: boolean) => void;
  sitesEnabled?: boolean;
} = {}) {
  renderDashboard(
    <CommandMenu
      open
      onOpenChange={onOpenChange}
      slug="lumen-physio"
      role={role}
      memberships={memberships}
      extension={extension}
      sitesEnabled={sitesEnabled}
    />,
    role,
  );
  return { onOpenChange };
}

const option = (name: string | RegExp) => screen.getByRole("option", { name });

describe("CommandMenu", () => {
  it("lists actions, pages, other businesses and general commands, and is accessible", async () => {
    renderMenu();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("combobox")).toHaveFocus();
    for (const group of ["Actions", "Go to", "Switch business", "General"]) {
      expect(within(dialog).getByText(group)).toBeInTheDocument();
    }
    expect(option(/New appointment/)).toBeInTheDocument();
    expect(option(/Patients/)).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Lumen Physiotherapy/ })).not.toBeInTheDocument();
    await expectNoAxeViolations(document.body);
  });

  it("filters as you type and runs the highlighted command with Enter", async () => {
    const { onOpenChange } = renderMenu();
    const user = userEvent.setup();
    await user.type(screen.getByRole("combobox"), "calendar");
    expect(screen.getAllByRole("option").map((o) => o.textContent.trim())).toEqual(["Calendar"]);
    await user.keyboard("{Enter}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(push).toHaveBeenCalledWith("/dashboard/lumen-physio/calendar");
  });

  it("moves through the commands with the arrow keys", async () => {
    renderMenu();
    const user = userEvent.setup();
    await user.type(screen.getByRole("combobox"), "theme");
    expect(screen.getAllByRole("option").map((o) => o.textContent.trim())).toEqual([
      "Light theme",
      "Dark theme",
      "System theme",
    ]);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("says when nothing matches", async () => {
    renderMenu();
    await userEvent.type(screen.getByRole("combobox"), "zzzzqqq");
    expect(screen.getByText("Nothing found.")).toBeInTheDocument();
  });

  it("runs each command (business websites on)", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const user = userEvent.setup();
    renderMenu({ sitesEnabled: true });
    await user.click(option(/New appointment/));
    expect(push).toHaveBeenLastCalledWith("/dashboard/lumen-physio/bookings?new=1");
    await user.click(option("View site"));
    expect(open).toHaveBeenLastCalledWith("/lumen-physio", "_blank", "noopener");
    await user.click(option("View booking page"));
    expect(open).toHaveBeenLastCalledWith("/lumen-physio/book", "_blank", "noopener");
    await user.click(option("Edit site"));
    expect(push).toHaveBeenLastCalledWith("/dashboard/lumen-physio/site");
    await user.click(option("Change site with AI"));
    expect(push).toHaveBeenLastCalledWith("/dashboard/lumen-physio/site?tab=ai");
    await user.click(option(/Gleam Car Wash/));
    expect(push).toHaveBeenLastCalledWith("/dashboard/gleam-wash");
    await user.click(option("Create a new business"));
    expect(push).toHaveBeenLastCalledWith("/onboarding");
    await user.click(option("Light theme"));
    expect(setTheme).toHaveBeenLastCalledWith("light");
    await user.click(option("System theme"));
    expect(setTheme).toHaveBeenLastCalledWith("system");
    await user.click(option("Sign out"));
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/" });
  });

  it("has no site commands or page where business websites are off", () => {
    renderMenu();
    for (const name of ["View site", "Edit site", "Change site with AI", "Site"])
      expect(screen.queryByRole("option", { name })).not.toBeInTheDocument();
    expect(option("View booking page")).toBeInTheDocument();
  });

  it("keeps site editing and admin pages from staff", () => {
    renderMenu({ role: "staff", sitesEnabled: true });
    expect(screen.queryByRole("option", { name: "Edit site" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Settings" })).not.toBeInTheDocument();
    expect(option("Calendar")).toBeInTheDocument();
  });

  it("renders extensions first with the search, and clears the search on close", async () => {
    const extension = vi.fn<CommandMenuExtension>(({ search, close }) => (
      <CommandGroup heading="Results" forceMount>
        <CommandItem forceMount value={`result ${search}`} onSelect={close}>
          Result for “{search}”
        </CommandItem>
      </CommandGroup>
    ));
    const { onOpenChange } = renderMenu({ extension });
    const user = userEvent.setup();
    await user.type(screen.getByRole("combobox"), "alex");
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Result for “alex”");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(extension).toHaveBeenLastCalledWith(expect.objectContaining({ search: "" }));
  });
});

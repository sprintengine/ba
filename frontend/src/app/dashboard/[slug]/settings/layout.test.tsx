import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderDashboard } from "@/components/dashboard/test/render";
import SettingsLayout from "./layout";

const nav = vi.hoisted(() => ({ pathname: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

const SLUG = "lumen-physio";
const at = (segment: string) => {
  nav.pathname = `/dashboard/${SLUG}/settings/${segment}`;
};
const show = (role?: Parameters<typeof renderDashboard>[1]) =>
  renderDashboard(<SettingsLayout>The section</SettingsLayout>, role, { slug: SLUG });

describe("the settings layout", () => {
  it("names the section you're on in the phone's picker, so it reads as it looks", () => {
    at("policies");
    show();
    expect(screen.getByRole("button", { name: /^Settings section: / })).toHaveTextContent(/policies/i);
  });

  it("falls back to Settings on an address with no section", () => {
    at("nowhere");
    show();
    expect(screen.getByRole("button", { name: "Settings section: Settings" })).toBeInTheDocument();
  });

  it("offers every section under its heading, marks where you are, and closes on a choice", async () => {
    at("general");
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: /^Settings section: / }));
    const list = await screen.findByRole("dialog");
    expect(within(list).getByText("Your business")).toBeInTheDocument();
    expect(within(list).getByText("Money")).toBeInTheDocument();
    const links = within(list).getAllByRole("link");
    const here = links.find((l) => l.getAttribute("href")?.endsWith("/settings/general"));
    expect(here).toHaveAttribute("aria-current", "page");

    const other = links.find((l) => l !== here)!;
    other.addEventListener("click", (e) => e.preventDefault());
    await user.click(other);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows the section beside the desktop's list, with the page you're on marked", () => {
    at("general");
    show();
    expect(screen.getByText("The section")).toBeInTheDocument();
    const list = screen.getByRole("navigation", { name: "Settings", hidden: true });
    const current = within(list)
      .getAllByRole("link", { hidden: true })
      .filter((l) => l.hasAttribute("aria-current"));
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", `/dashboard/${SLUG}/settings/general`);
  });

  it("sends staff back, without the section", () => {
    at("general");
    show("staff");
    expect(screen.getByText("Settings are for admins")).toBeInTheDocument();
    expect(screen.queryByText("The section")).not.toBeInTheDocument();
  });
});

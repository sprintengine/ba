import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import { renderDashboard } from "@/components/dashboard/test/render";
import { TeamView } from "../team-view";
import { apiError, fakeTeamApi, member, resource } from "./fake-team-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  toast.success.mockReset();
  toast.error.mockReset();
});

const avery = member({ id: "m1", userId: "u1", name: "Avery Morgan", role: "owner" });
const casey = member({
  id: "m2",
  userId: "u2",
  name: "Casey Lane",
  email: "casey@example.test",
  role: "staff",
  resourceId: "r1",
});
const blake = member({
  id: "m3",
  userId: "u3",
  name: "Blake Shaw",
  email: "blake@example.test",
  role: "admin",
});
const invited = member({
  id: "m4",
  userId: null,
  name: null,
  email: "new@example.test",
  role: "staff",
  status: "invited",
  createdAt: "2026-09-28T10:00:00Z",
});
const team = [invited, casey, avery, blake];
const resources = [
  resource({ id: "r1", name: "Sam Rivers" }),
  resource({ id: "r2", name: "Jo Park" }),
  resource({ id: "r3", name: "Room 1", kind: "space" }),
  resource({ id: "r4", name: "Former", isActive: false }),
];

const list = () => screen.findByRole("list", { name: "Team members" });
/** The member rows, once loaded (the skeleton rows are list items too). */
const rows = async () => {
  await screen.findByText("Casey Lane");
  return within(await list()).getAllByRole("listitem");
};

describe("TeamView", () => {
  it("shows the list as busy while the team loads", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderDashboard(<TeamView />);
    expect(screen.getByRole("list", { name: "Team members" })).toHaveAttribute("aria-busy", "true");
  });

  it("shows the API's error with a retry", async () => {
    const api = fakeTeamApi({ team, resources });
    api.fail("GET", /\/team$/, () => apiError(500, "INTERNAL", "Team unavailable."));
    const user = userEvent.setup();
    const { container } = renderDashboard(<TeamView />);
    expect(await screen.findByRole("heading", { level: 2, name: "This didn’t load" })).toBeInTheDocument();
    expect(screen.getByText("Team unavailable.")).toBeInTheDocument();
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await list()).not.toHaveAttribute("aria-busy");
  });

  it("lists active members by role then name, invitations last, and explains the roles", async () => {
    fakeTeamApi({ team, resources });
    const { container } = renderDashboard(<TeamView />);
    const items = await rows();
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/Avery MorganYou/),
      expect.stringMatching(/Blake Shaw.*Admin(Remove)?$/),
      expect.stringMatching(/Casey Lane.*Sam Rivers.*Staff(Remove)?$/),
      expect.stringMatching(/^new@example\.testInvitedInvited 28 Sept?/),
    ]);
    expect(screen.getByRole("heading", { level: 2, name: "Roles" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent.trim())).toEqual([
      "Owner",
      "Admin",
      "Staff",
    ]);
    expect(screen.getByText("See appointments on their own calendar")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("changes a member's role from the keyboard", async () => {
    const api = fakeTeamApi({ team, resources });
    const user = userEvent.setup();
    renderDashboard(<TeamView />);
    const role = await screen.findByRole("combobox", { name: "Role for Casey Lane" });
    expect(role).toHaveTextContent("Staff");
    role.focus();
    await user.keyboard("{Enter}");
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual([
      "Owner",
      "Admin",
      "Staff",
    ]);
    await user.keyboard("{ArrowUp}{Enter}");

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Role updated"));
    expect(api.bodies("PATCH", "/team/m2")).toEqual([{ role: "admin" }]);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Role for Casey Lane" })).toHaveTextContent("Admin"),
    );
  });

  it("offers admins only the roles they can give, and no control over owners", async () => {
    fakeTeamApi({ team, resources });
    const user = userEvent.setup();
    renderDashboard(<TeamView />, "admin");
    await user.click(await screen.findByRole("combobox", { name: "Role for Casey Lane" }));
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Admin", "Staff"]);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("combobox", { name: /Avery Morgan/ })).not.toBeInTheDocument();
  });

  it("links and unlinks a member's calendar, offering only active people", async () => {
    const api = fakeTeamApi({ team, resources });
    const user = userEvent.setup();
    renderDashboard(<TeamView />);
    const calendar = await screen.findByRole("combobox", { name: "Linked therapist for Casey Lane" });
    expect(calendar).toHaveTextContent("Sam Rivers");
    await user.click(calendar);
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual([
      "No calendar",
      "Sam Rivers",
      "Jo Park",
    ]);
    await user.click(screen.getByRole("option", { name: "No calendar" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Calendar unlinked"));

    await user.click(screen.getByRole("combobox", { name: "Linked therapist for Blake Shaw" }));
    await user.click(await screen.findByRole("option", { name: "Jo Park" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Calendar linked"));
    expect(api.bodies("PATCH", "/team/m2")).toEqual([{ resourceId: null }]);
    expect(api.bodies("PATCH", "/team/m3")).toEqual([{ resourceId: "r2" }]);
  });

  it("says why a change failed", async () => {
    const api = fakeTeamApi({ team, resources });
    api.fail("PATCH", /\/team\/m2$/, () => apiError(409, "CONFLICT", "They were just removed."));
    const user = userEvent.setup();
    renderDashboard(<TeamView />);
    await user.click(await screen.findByRole("combobox", { name: "Role for Casey Lane" }));
    await user.click(await screen.findByRole("option", { name: "Admin" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("They were just removed."));
  });

  it("removes a member after confirming", async () => {
    const api = fakeTeamApi({ team, resources });
    const user = userEvent.setup();
    renderDashboard(<TeamView />);
    await user.click(await screen.findByRole("button", { name: "Remove Casey Lane" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Remove Casey Lane?" });
    expect(confirm).toHaveAccessibleDescription(/lose access straight away/);
    await expectNoAxeViolations(document.body);
    await user.click(within(confirm).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Removed from the team"));
    expect(api.state.team.map((m) => m.id)).not.toContain("m2");
    await waitFor(() => expect(screen.queryByText("Casey Lane")).not.toBeInTheDocument());
  });

  it("revokes an invitation after confirming, and keeps it when cancelled", async () => {
    fakeTeamApi({ team, resources });
    const user = userEvent.setup();
    renderDashboard(<TeamView />);
    const revoke = await screen.findByRole("button", { name: "Revoke invite for new@example.test" });
    await user.click(revoke);
    let confirm = await screen.findByRole("alertdialog", { name: "Revoke the invite for new@example.test?" });
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(revoke).toHaveFocus();

    await user.click(revoke);
    confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Invite revoked"));
  });

  it("says why a removal failed", async () => {
    const api = fakeTeamApi({ team, resources });
    api.fail("DELETE", /\/team\/m2$/, () => apiError(409, "POLICY_VIOLATION", "They have bookings today."));
    const user = userEvent.setup();
    renderDashboard(<TeamView />);
    await user.click(await screen.findByRole("button", { name: "Remove Casey Lane" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("They have bookings today."));
  });

  it("keeps the last owner: no role change, and removal disabled", async () => {
    const pat = member({
      id: "m9",
      userId: "u9",
      name: "Pat Owner",
      email: "pat@example.test",
      role: "owner",
    });
    fakeTeamApi({ team: [member({ ...avery, role: "admin" }), pat], resources });
    renderDashboard(<TeamView />);
    expect(await screen.findByRole("button", { name: "Remove Pat Owner" })).toBeDisabled();
    expect(screen.queryByRole("combobox", { name: "Role for Pat Owner" })).not.toBeInTheDocument();
  });

  it("lets the only active owner revoke a pending invitation for a second owner", async () => {
    const invitedOwner = member({ ...invited, id: "m5", email: "partner@example.test", role: "owner" });
    fakeTeamApi({ team: [avery, invitedOwner], resources });
    const user = userEvent.setup();
    renderDashboard(<TeamView />);
    const revoke = await screen.findByRole("button", { name: "Revoke invite for partner@example.test" });
    expect(revoke).toBeEnabled();
    await user.click(revoke);
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Invite revoked"));
  });

  it("shows staff the team read-only, with linked calendars by name", async () => {
    fakeTeamApi({ team, resources });
    renderDashboard(<TeamView />, "staff");
    const casey = (await rows())[2];
    expect(casey).toHaveTextContent(/Sam Rivers/);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove|revoke|invite/i })).not.toBeInTheDocument();
  });

  it("opens the invite dialog", async () => {
    fakeTeamApi({ team, resources });
    const user = userEvent.setup();
    renderDashboard(<TeamView />);
    await user.click(await screen.findByRole("button", { name: "Invite" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite to Lumen Physiotherapy" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

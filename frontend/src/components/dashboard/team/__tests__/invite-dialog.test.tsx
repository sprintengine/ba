import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberRole } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { renderDashboard } from "@/components/dashboard/test/render";
import { InviteDialog } from "../invite-dialog";
import { apiError, fakeTeamApi } from "./fake-team-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

afterEach(() => {
  vi.unstubAllGlobals();
  toast.success.mockReset();
  toast.error.mockReset();
});

const people = [
  { id: "r1", name: "Sam Rivers" },
  { id: "r2", name: "Jo Park" },
];

function open(role: MemberRole = "owner", withPeople = people) {
  const onOpenChange = vi.fn();
  renderDashboard(<InviteDialog open onOpenChange={onOpenChange} people={withPeople} />, role);
  const dialog = screen.getByRole("dialog", { name: "Invite to Lumen Physiotherapy" });
  return { dialog, onOpenChange, user: userEvent.setup() };
}

const email = (dialog: HTMLElement) => within(dialog).getByRole("textbox", { name: /^Email/ });
const send = (dialog: HTMLElement) =>
  userEvent.click(within(dialog).getByRole("button", { name: "Send invite" }));

describe("InviteDialog", () => {
  it("starts on the email, explains the invite and is axe-clean", async () => {
    fakeTeamApi();
    const { dialog } = open();
    expect(dialog).toHaveAccessibleDescription(/They get an email with a link/);
    expect(email(dialog)).toHaveFocus();
    expect(within(dialog).getByRole("radiogroup", { name: "Role" })).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
  });

  it("invites with a role and a calendar", async () => {
    const api = fakeTeamApi();
    const { dialog, user, onOpenChange } = open();
    await user.type(email(dialog), "jordan@example.test");
    const roles = within(dialog).getByRole("radiogroup", { name: "Role" });
    expect(
      within(roles)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual([
      expect.stringMatching(/^Staff/),
      expect.stringMatching(/^Admin/),
      expect.stringMatching(/^Owner/),
    ]);
    const calendar = within(dialog).getByRole("combobox", { name: /^Their calendar/ });
    expect(calendar).toHaveAccessibleDescription(
      "Pick one, and they see appointments on that calendar only.",
    );
    await user.click(within(roles).getByRole("radio", { name: /^Admin/ }));
    expect(calendar).toHaveAccessibleDescription("Link them to their own calendar column.");

    calendar.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("option", { name: "Sam Rivers" }));
    await send(dialog);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.bodies("POST", "/team/invitations")).toEqual([
      { email: "jordan@example.test", role: "admin", resourceId: "r1" },
    ]);
    expect(toast.success).toHaveBeenCalledWith("Invite sent to jordan@example.test");
  });

  it("sends no calendar by default", async () => {
    const api = fakeTeamApi();
    const { dialog, user } = open();
    await user.type(email(dialog), "kim@example.test");
    await send(dialog);
    await waitFor(() => expect(api.bodies("POST", "/team/invitations")).toHaveLength(1));
    expect(api.bodies("POST", "/team/invitations")[0]).toEqual({
      email: "kim@example.test",
      role: "staff",
      resourceId: null,
    });
  });

  it("asks for a valid email before sending", async () => {
    const api = fakeTeamApi();
    const { dialog, user } = open();
    await send(dialog);
    const input = email(dialog);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a valid email");
    expect(input).toHaveFocus();
    await expectNoAxeViolations(document.body);

    await user.type(input, "jordan@");
    await send(dialog);
    expect(input).toHaveAccessibleDescription("Enter a valid email");
    expect(api.bodies("POST", "/team/invitations")).toEqual([]);
  });

  it("shows the server's field error under the email", async () => {
    const api = fakeTeamApi();
    api.fail("POST", /\/team\/invitations$/, () =>
      apiError(400, "INVALID_REQUEST", "Check the highlighted fields.", { email: "Already on the team" }),
    );
    const { dialog, user, onOpenChange } = open();
    await user.type(email(dialog), "casey@example.test");
    await send(dialog);
    const input = await within(dialog).findByRole("textbox", {
      name: /^Email/,
      description: "Already on the team",
    });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveFocus();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("shows other API errors at the top", async () => {
    const api = fakeTeamApi();
    api.fail("POST", /\/team\/invitations$/, () =>
      apiError(403, "FORBIDDEN", "Only owners can invite owners."),
    );
    const { dialog, user } = open();
    await user.type(email(dialog), "kim@example.test");
    await send(dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Only owners can invite owners.");
  });

  it("explains a full plan, with a link to plans for those who manage billing", async () => {
    const api = fakeTeamApi();
    api.fail("POST", /\/team\/invitations$/, () =>
      apiError(402, "PLAN_LIMIT_REACHED", "Your plan includes 3 team members."),
    );
    const { dialog, user } = open();
    await user.type(email(dialog), "kim@example.test");
    await send(dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /^Your plan includes 3 team members\. See plans$/,
    );
    expect(within(dialog).getByRole("link", { name: "See plans" })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/settings/billing",
    );
  });

  it("gives admins no plans link and only the roles they can give", async () => {
    const api = fakeTeamApi();
    api.fail("POST", /\/team\/invitations$/, () => apiError(402, "PLAN_LIMIT_REACHED", "The team is full."));
    const { dialog, user } = open("admin");
    expect(
      within(dialog)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual([expect.stringMatching(/^Staff/), expect.stringMatching(/^Admin/)]);
    await user.type(email(dialog), "kim@example.test");
    await send(dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/^The team is full\.$/);
    expect(within(dialog).queryByRole("link", { name: "See plans" })).not.toBeInTheDocument();
  });

  it("leaves out the calendar when there are no people to link", () => {
    fakeTeamApi();
    const { dialog } = open("owner", []);
    expect(within(dialog).queryByRole("combobox", { name: /calendar/i })).not.toBeInTheDocument();
  });

  it("closes on Escape and Cancel", async () => {
    fakeTeamApi();
    const { dialog, user, onOpenChange } = open();
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    onOpenChange.mockClear();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

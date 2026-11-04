import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerGroup, CustomerGroupInput } from "@/lib/api/types";
import { must } from "@/test/must";
import { expectNoAxeViolations } from "@/test/axe";
import { json, mockApi, renderDashboard } from "../../test/render";
import { GroupsSettings } from "../groups-settings";
import { apiError, group, invalidRequest } from "./settings-fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio/settings/customer-groups",
  useSearchParams: () => new URLSearchParams(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

type Overrides = {
  list?: () => unknown;
  create?: (input: CustomerGroupInput) => unknown;
  update?: (input: Partial<CustomerGroupInput>) => unknown;
  remove?: () => unknown;
};

/** A stateful fake of the customer-groups endpoints, recording what was sent. */
function fakeGroups(initial: CustomerGroup[], overrides: Overrides = {}) {
  let groups = [...initial];
  const sent: { method: string; path: string; body: unknown }[] = [];
  const fetchMock = mockApi((method, path, body) => {
    if (!path.includes("/customer-groups")) return {};
    if (method !== "GET") sent.push({ method, path, body });
    const id = path.split("/customer-groups/")[1];
    if (method === "GET") return overrides.list ? overrides.list() : groups;
    if (method === "POST") {
      const input = body as CustomerGroupInput;
      if (overrides.create) return overrides.create(input);
      const created = { ...input, id: `g${groups.length + 1}` };
      groups = [...groups, created];
      return created;
    }
    if (method === "PATCH") {
      const input = body as Partial<CustomerGroupInput>;
      if (overrides.update) return overrides.update(input);
      groups = groups.map((g) => (g.id === id ? { ...g, ...input } : g));
      return groups.find((g) => g.id === id);
    }
    if (method === "DELETE") {
      if (overrides.remove) return overrides.remove();
      groups = groups.filter((g) => g.id !== id);
      return new Response(null, { status: 204 });
    }
    return {};
  });
  return { fetchMock, sent };
}

const members = group({ id: "g1", name: "Members", sortOrder: 1, description: "Paying members" });
const medical = group({ id: "g2", name: "Medical card holders", sortOrder: 0, restricted: true });
const legacy = group({ id: "g3", name: "Legacy", sortOrder: -1, isActive: false });

const rows = () =>
  within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((li) => li.textContent);

describe("GroupsSettings", () => {
  it("shows nothing but a placeholder while loading", async () => {
    let release: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (release = resolve))),
    );
    renderDashboard(<GroupsSettings />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText("No groups")).not.toBeInTheDocument();
    release(json([members]));
    expect(await screen.findByText("Members")).toBeInTheDocument();
  });

  it("explains groups when there are none", async () => {
    fakeGroups([]);
    const { container } = renderDashboard(<GroupsSettings />);
    expect(await screen.findByText("No groups")).toBeInTheDocument();
    expect(screen.getByText(/Add a group when some patients need their own/)).toBeInTheDocument();
    // The section is named in the business's words.
    expect(screen.getByRole("heading", { name: "Patient groups" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("shows the error and retries", async () => {
    let fail = true;
    fakeGroups([members], {
      list: () =>
        fail ? apiError(500, "INTERNAL_SERVER_ERROR", "The groups couldn't be loaded.") : [members],
    });
    const user = userEvent.setup();
    renderDashboard(<GroupsSettings />);
    expect(await screen.findByText("The groups couldn't be loaded.")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Members")).toBeInTheDocument();
  });

  it("lists active groups in order, then inactive ones, with their badges; axe-clean", async () => {
    fakeGroups([members, legacy, medical]);
    const { container } = renderDashboard(<GroupsSettings />);
    await screen.findByText("Members");
    expect(rows()).toEqual([
      expect.stringMatching(/^Medical card holders\s*Restricted/),
      expect.stringMatching(/^MembersPaying members/),
      expect.stringMatching(/^Legacy\s*Inactive/),
    ]);
    expect(screen.getByRole("button", { name: "Edit Members" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Legacy" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  describe("the group dialog", () => {
    it("adds a group: validates the name, sends the input and closes", async () => {
      const { sent } = fakeGroups([members]);
      const user = userEvent.setup();
      renderDashboard(<GroupsSettings />);
      await screen.findByText("Members");
      await user.click(screen.getByRole("button", { name: "New group" }));

      const dialog = await screen.findByRole("dialog", { name: "New group" });
      const name = within(dialog).getByRole("textbox", { name: "Name" });
      expect(name).toHaveFocus();
      expect(within(dialog).queryByRole("switch", { name: "Active" })).not.toBeInTheDocument();
      await expectNoAxeViolations(document.body);

      await user.click(within(dialog).getByRole("button", { name: "Add group" }));
      expect(name).toHaveAccessibleDescription("Name the group");
      expect(name).toHaveAttribute("aria-invalid", "true");
      expect(sent).toEqual([]);

      await user.type(name, "  Students ");
      await user.type(within(dialog).getByRole("textbox", { name: /description/i }), "Under 18s");
      await user.click(within(dialog).getByRole("switch", { name: "Restricted" }));
      await user.click(within(dialog).getByRole("button", { name: "Add group" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(sent).toEqual([
        {
          method: "POST",
          path: "/v1/businesses/b1/customer-groups",
          body: {
            name: "Students",
            description: "Under 18s",
            restricted: true,
            isActive: true,
            sortOrder: 2, // one past Members (1), not the list length
          },
        },
      ]);
      expect(toast.success).toHaveBeenCalledWith("Group added");
      expect(await screen.findByText("Students")).toBeInTheDocument();
    });

    it("edits a group, including switching it off", async () => {
      const { sent } = fakeGroups([members]);
      const user = userEvent.setup();
      renderDashboard(<GroupsSettings />);
      await user.click(await screen.findByRole("button", { name: "Edit Members" }));
      const dialog = await screen.findByRole("dialog", { name: "Edit Members" });
      expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue("Members");
      expect(within(dialog).getByRole("textbox", { name: /description/i })).toHaveValue("Paying members");
      await user.click(within(dialog).getByRole("switch", { name: "Active" }));
      await user.click(within(dialog).getByRole("button", { name: "Save" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(sent).toEqual([
        {
          method: "PATCH",
          path: "/v1/businesses/b1/customer-groups/g1",
          body: {
            name: "Members",
            description: "Paying members",
            restricted: false,
            isActive: false,
            sortOrder: 1,
          },
        },
      ]);
      expect(toast.success).toHaveBeenCalledWith("Group saved");
      expect(await screen.findByText("Inactive")).toBeInTheDocument();
    });

    it("puts the server's field error under the field and stays open", async () => {
      fakeGroups([members], {
        create: () => invalidRequest({ name: "A group with this name already exists" }),
      });
      const user = userEvent.setup();
      renderDashboard(<GroupsSettings />);
      await screen.findByText("Members");
      await user.click(screen.getByRole("button", { name: "New group" }));
      const dialog = await screen.findByRole("dialog");
      await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Members");
      await user.click(within(dialog).getByRole("button", { name: "Add group" }));

      const name = await within(dialog).findByRole("textbox", {
        name: "Name",
        description: /already exists/,
      });
      expect(name).toHaveAttribute("aria-invalid", "true");
      expect(name).toHaveFocus();
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("closes on Escape and on Cancel, returning focus to the button that opened it", async () => {
      fakeGroups([members]);
      const user = userEvent.setup();
      renderDashboard(<GroupsSettings />);
      await screen.findByText("Members");
      const open = screen.getByRole("button", { name: "New group" });
      await user.click(open);
      await screen.findByRole("dialog");
      // Focus stays inside the dialog.
      for (let i = 0; i < 8; i++) await user.tab();
      expect(must(screen.getByRole("dialog").contains(document.activeElement), "focus in dialog")).toBe(true);
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(open).toHaveFocus());

      await user.click(screen.getByRole("button", { name: "Edit Members" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
  });

  describe("deleting", () => {
    it("asks first, then removes the group", async () => {
      const { sent } = fakeGroups([members, medical]);
      const user = userEvent.setup();
      renderDashboard(<GroupsSettings />);
      await user.click(await screen.findByRole("button", { name: "Delete Members" }));
      const confirm = await screen.findByRole("alertdialog", { name: "Delete Members?" });
      expect(confirm).toHaveAccessibleDescription(/hours, services or appointments it.s deactivated/);
      await expectNoAxeViolations(document.body);
      await user.click(within(confirm).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(screen.queryByText("Members")).not.toBeInTheDocument());
      expect(sent).toEqual([
        { method: "DELETE", path: "/v1/businesses/b1/customer-groups/g1", body: undefined },
      ]);
      expect(toast.success).toHaveBeenCalledWith("Group removed");
    });

    it("reports a failure", async () => {
      fakeGroups([members], { remove: () => apiError(409, "CONFLICT", "That group is in use.") });
      const user = userEvent.setup();
      renderDashboard(<GroupsSettings />);
      await user.click(await screen.findByRole("button", { name: "Delete Members" }));
      await user.click(await screen.findByRole("button", { name: "Delete" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That group is in use."));
    });
  });
});
